#!/usr/bin/env node
// run-case.mjs
// cases.json の 1 ケースを実行し、終了コード、標準出力、標準エラー出力、所要時間を別々に保存する。
//   - spawnSync で直接起動する（シェルを介さない。パイプを使うと終了コードが隠れるため）。
//   - 子プロセスの環境変数は許可リスト方式。process.env を丸ごと渡さない・出力しない。記録するのは変数の「名前」だけ。
//   - ダミーの API キーは、実行時に文字列を組み立てる（ソースにキーらしい文字列を置かない）。値はどこにも出さない。
//   - 生の出力は <作業ディレクトリ>/raw/ に置く（os.tmpdir() の下。リポジトリの外）。
//   - 起動回数、モデルを使った回数、累積コストを ledger.jsonl に記録し、上限を超える実行は拒否する。
//
// 使い方:
//   node run-case.mjs --list
//   node run-case.mjs --case <ID> [--work <os.tmpdir() の下のパス>] [--allow <環境変数の名前>] [--claude <claude の実行ファイル>]
//   node run-case.mjs --cred-stat [--label <名前>]   認証情報ファイルの更新日時とサイズだけを記録する（内容は読まない）
//   node run-case.mjs --status [--work <パス>]       ledger の集計
import { spawnSync, execFileSync } from "node:child_process";
import {
  appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, parseOutput } from "./classify-run.mjs";
import { buildRedactor } from "./redact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redact = buildRedactor();

// 上限（plans/free-articles-3.md 6-4 節）
const LIMITS = { launches: 25, modelRuns: 15, costUsd: 0.5 };

// 子プロセスに渡す環境変数の名前（許可リスト）。足りないと分かったものだけを足し、VERIFIED.md に名前を書く。
const ALLOW = [
  "PATH", "SystemRoot", "windir", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH",
  "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "ComSpec", "PATHEXT",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramData",
  "CLAUDE_CODE_GIT_BASH_PATH", // Git Bash の場所（設定されている場合だけ渡る）
];

function parseArgs(argv) {
  const out = { list: false, status: false, credStat: false, caseId: null, work: null, allow: [], claude: null, label: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") out.list = true;
    else if (a === "--status") out.status = true;
    else if (a === "--cred-stat") out.credStat = true;
    else if (a === "--case") out.caseId = argv[++i];
    else if (a === "--work") out.work = argv[++i];
    else if (a === "--allow") out.allow.push(argv[++i]);
    else if (a === "--claude") out.claude = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else throw new Error(`知らない引数: ${a}`);
  }
  return out;
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

// claude の実行ファイルを PATH から探す（見つからなければ ~/.local/bin を見る）
function findClaude(explicit) {
  if (explicit) return resolve(explicit);
  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"];
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  dirs.push(join(homedir(), ".local", "bin"));
  for (const d of dirs) for (const n of names) if (existsSync(join(d, n))) return join(d, n);
  throw new Error("claude の実行ファイルが見つかりません。--claude <パス> で指定してください");
}

// ダミーの API キーを実行時に組み立てる。明らかな偽物（DUMMY の繰り返し）。ソースにキーらしい文字列は置かない。
function makeDummyKey() {
  return ["sk", "ant", "api03"].join("-") + "-" + "DUMMY".repeat(19) + "AA";
}

function readLedger(work) {
  const f = join(work, "ledger.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function tally(entries) {
  const runs = entries.filter((e) => e.type === "run");
  return {
    launches: runs.length,
    modelRuns: runs.filter((e) => e.declaredKind === "model" || (e.costUsd ?? 0) > 0).length,
    costUsd: runs.reduce((n, e) => n + (e.costUsd ?? 0), 0),
  };
}

function credFile() {
  // 公式 docs: Windows では %USERPROFILE%\.claude\.credentials.json。内容は読まない。
  return join(homedir(), ".claude", ".credentials.json");
}

function credStat() {
  try {
    const s = statSync(credFile());
    return { exists: true, size: s.size, mtime: s.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const casesDoc = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
  const cases = casesDoc.cases;

  if (args.list) {
    for (const c of cases) console.log(`${c.id}\t${c.kind}\t${c.expect}`);
    return;
  }

  const work = resolve(args.work ?? join(tmpdir(), "claude-exit-codes-run"));
  if (!isInside(tmpdir(), work)) throw new Error(`${work} は os.tmpdir() の外です`);
  mkdirSync(join(work, "raw"), { recursive: true });

  if (args.status) {
    console.log(JSON.stringify(tally(readLedger(work))));
    return;
  }
  if (args.credStat) {
    const st = credStat();
    appendFileSync(join(work, "ledger.jsonl"), JSON.stringify({ type: "cred-stat", label: args.label ?? "", ...st }) + "\n");
    console.log(`cred-stat ${args.label ?? ""}: ${JSON.stringify(st)}`);
    return;
  }

  const c = cases.find((x) => x.id === args.caseId);
  if (!c) throw new Error("--case にはケース ID を指定してください（--list で一覧）");

  // 上限の確認（実行前）
  const t = tally(readLedger(work));
  const willModel = c.kind === "model" || c.mayInfer === true;
  if (t.launches + 1 > LIMITS.launches) throw new Error(`起動回数の上限 ${LIMITS.launches} に達しています`);
  if (willModel && t.modelRuns + 1 > LIMITS.modelRuns) throw new Error(`モデルを使う実行の上限 ${LIMITS.modelRuns} に達しています`);
  if (t.costUsd >= LIMITS.costUsd) throw new Error(`累積コストの上限 ${LIMITS.costUsd} ドルに達しています`);

  // 使い捨ての作業ディレクトリ（lab/ のコピー。CLAUDE.md や .claude/agents/ がリポジトリのものと混ざらない）
  let seq = 1;
  while (existsSync(join(work, "cwd", seq === 1 ? c.id : `${c.id}-${seq}`))) seq++;
  const tag = seq === 1 ? c.id : `${c.id}-${seq}`;
  const cwd = join(work, "cwd", tag);
  mkdirSync(cwd, { recursive: true });
  const labPrompts = resolve(join(here, "lab", "prompts"));
  cpSync(join(here, "lab"), cwd, { recursive: true, filter: (src) => resolve(src) !== labPrompts });
  mkdirSync(join(cwd, "zones", "w"), { recursive: true });
  writeFileSync(join(cwd, "zones", "w", ".keep"), "");
  execFileSync("git", ["init", "-q"], { cwd });

  // 子プロセスの環境変数（許可リスト）
  const env = {};
  for (const name of [...ALLOW, ...args.allow]) if (process.env[name] !== undefined) env[name] = process.env[name];
  env.DISABLE_AUTOUPDATER = "1"; // 公式 docs の自動更新を止める環境変数
  if (c.isolatedConfig) {
    const cfg = join(work, "cfg", tag);
    mkdirSync(cfg, { recursive: true });
    env.CLAUDE_CONFIG_DIR = cfg;
  }
  if (c.dummyKey) env.ANTHROPIC_API_KEY = makeDummyKey();
  const envNames = Object.keys(env).sort();

  const cmd = c.cmd === "node" ? process.execPath : findClaude(args.claude);
  const argv = c.args.map((a) => a.split("{cwd}").join(cwd));
  const input = c.stdinEmpty ? "" : c.prompt ? readFileSync(join(here, "lab", "prompts", c.prompt), "utf8") : "";

  const before = Date.now();
  const r = spawnSync(cmd, argv, {
    cwd, env, input, encoding: "utf8", shell: false, windowsHide: true,
    timeout: c.timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - before;
  const timedOut = r.error?.code === "ETIMEDOUT" || (r.status === null && r.signal === "SIGTERM" && durationMs >= c.timeoutSec * 1000 - 500);
  const spawnError = r.error && !timedOut ? String(r.error.code ?? r.error.message) : null;

  // ファイルシステムの確認（プロセスの終了直後と、必要なら数秒後）
  const files = {};
  for (const f of c.checkFiles ?? []) files[f] = { atExit: existsSync(join(cwd, f)) };
  if (c.recheckAfterSec) {
    sleepMs(c.recheckAfterSec * 1000);
    for (const f of c.checkFiles ?? []) files[f].afterWait = existsSync(join(cwd, f));
  }

  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  writeFileSync(join(work, "raw", `${tag}.stdout.txt`), stdout);
  writeFileSync(join(work, "raw", `${tag}.stderr.txt`), stderr);

  const verdict = classify({ exitCode: r.status, timedOut, signal: r.signal && !timedOut ? r.signal : null, format: c.format, stdout, stderr });
  const parsed = parseOutput(stdout, c.format);
  const last = parsed.results[parsed.results.length - 1] ?? null;
  const costUsd = last && typeof last.total_cost_usd === "number" ? last.total_cost_usd : 0;

  const meta = {
    type: "run", id: c.id, tag, declaredKind: c.kind, mayInfer: c.mayInfer === true, cmd: c.cmd, format: c.format,
    exitCode: r.status, signal: r.signal ?? null, timedOut, spawnError, durationMs,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr),
    costUsd, envNames, dummyKeyPassed: c.dummyKey === true, isolatedConfig: c.isolatedConfig === true,
    files, verdict: verdict.verdict,
  };
  appendFileSync(join(work, "ledger.jsonl"), JSON.stringify(meta) + "\n");
  writeFileSync(join(work, "raw", `${tag}.meta.json`), JSON.stringify(meta, null, 1) + "\n");

  // 画面に出すのは、置換を通した要約だけ（環境変数の値は出さない）
  const clip = (s, n = 400) => redact(s).replace(/\s+/g, " ").trim().slice(0, n);
  console.log(`## ${tag}（想定: ${c.expect}）`);
  console.log(`- 終了コード: ${timedOut ? "timeout" : r.status}${r.signal ? ` シグナル ${r.signal}` : ""}${spawnError ? ` 起動エラー ${spawnError}` : ""}、所要 ${durationMs} ms`);
  console.log(`- 子プロセスに渡した環境変数の名前: ${envNames.join(", ")}`);
  console.log(`- 標準出力 ${meta.stdoutBytes} バイト、標準エラー出力 ${meta.stderrBytes} バイト、形式 ${c.format}、JSON の形 ${parsed.shape}、result イベント ${parsed.results.length} 個`);
  if (last) {
    console.log(`- 最後の result: subtype=${last.subtype} is_error=${last.is_error} num_turns=${last.num_turns} total_cost_usd=${last.total_cost_usd} permission_denials=${(last.permission_denials ?? []).length}`);
  }
  if (Object.keys(files).length) console.log(`- ファイル: ${JSON.stringify(files)}`);
  console.log(`- 判定: ${verdict.verdict}（${verdict.reasons.join(" / ")}）`);
  if (c.format === "text" || !last) console.log(`- 標準出力（先頭、置換済み）: ${clip(stdout)}`);
  if (last && typeof last.result === "string") console.log(`- result.result（先頭、置換済み）: ${clip(last.result, 300)}`);
  if (stderr.trim()) console.log(`- 標準エラー出力（先頭、置換済み）: ${clip(stderr)}`);
  const t2 = tally(readLedger(work));
  console.log(`- 累計: 起動 ${t2.launches}/${LIMITS.launches}、モデル ${t2.modelRuns}/${LIMITS.modelRuns}、コスト ${t2.costUsd.toFixed(4)}/${LIMITS.costUsd} ドル`);
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
