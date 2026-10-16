#!/usr/bin/env node
// run-case.mjs
// cases.json の 1 ケースを実行し、終了コード、標準出力、標準エラー出力、hook のログ、所要時間を別々に保存する。
// samples/claude-code-exit-codes/run-case.mjs をもとに、サブエージェントの起動の検証向けに変えたもの。
//   - spawnSync で直接起動する（シェルを介さない。パイプを使うと終了コードが隠れるため）。
//   - 子プロセスの環境変数は許可リスト方式。process.env を丸ごと渡さない・出力しない。記録するのは変数の「名前」だけ。
//   - 実行は os.tmpdir() の下の使い捨てディレクトリ（lab/ のコピー）で行い、生の出力は <作業ディレクトリ>/raw/ に置く。
//   - 起動回数、モデルを使った回数、累積コスト、ケースごとの再実行回数を ledger.jsonl に記録し、上限を超える実行は拒否する。
//   - 止める条件（認証・利用枠のエラー、版の変化、想定外のエージェント定義）を見つけたら ledger に stop を書き、以後の実行を拒否する。
//
// 使い方:
//   node run-case.mjs --list
//   node run-case.mjs --case <ID> [--target <定義名>] [--reason <再実行の理由>] [--work <os.tmpdir() の下のパス>] [--claude <claude の実行ファイル>]
//   node run-case.mjs --cred-stat [--label <名前>]   認証情報ファイルの更新日時とサイズだけを記録し、最初の記録と比べる（内容は読まない）
//   node run-case.mjs --status [--work <パス>]       ledger の集計
//   node run-case.mjs --resume-after-stop --reason <理由>   止める条件の原因を確認したあとで再開する（理由を ledger に残す）
//
// cases.json の項目のうち、この版で足したもの:
//   env                   子プロセスに足す環境変数（CASE_ENV_ALLOW にある名前と値だけ）
//   scope: "d"            今回の範囲の上限（PHASE_MODEL_LIMIT）ではなく、セット全体の上限だけで数える
//   requireNoSubagentType Agent の tool_use の input に subagent_type がないことを確かめ、あれば不成立と記録する
import { spawnSync, execFileSync } from "node:child_process";
import {
  appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNoSubagentType, extractSpawn, formatTable } from "./extract-spawn.mjs";
import { buildRedactor } from "./redact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redact = buildRedactor();

// 上限（plans/free-articles-4.md 7 節）。セット全体で数える。
const LIMITS = { launches: 25, modelRuns: 15, costUsd: 0.5 };
// 今回の範囲（E3・E4）でのモデルを使う実行の上限。後の範囲で引き上げるときは、理由を VERIFIED.md に書く。
const PHASE_MODEL_LIMIT = 10;
// 1 ケースあたりの実行回数の上限（最初の 1 回 + 再実行 1 回）
const MAX_RUNS_PER_CASE = 2;
// 想定する版。途中で変わったら止める。
const EXPECTED_VERSION = "2.1.293";
// 想定するエージェントの種類（組み込み + lab の s-*）。これ以外が init に出たら、名前だけ記録して止める。
const BUILTIN_AGENTS = ["claude", "Explore", "general-purpose", "Plan", "statusline-setup"];

// 子プロセスに渡す環境変数の名前（許可リスト）。足りないと分かったものだけを足し、VERIFIED.md に名前を書く。
const ALLOW = [
  "PATH", "SystemRoot", "windir", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH",
  "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "ComSpec", "PATHEXT",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramData",
  "CLAUDE_CODE_GIT_BASH_PATH", // Git Bash の場所（設定されている場合だけ渡る）
];
// ケースごとに足してよい環境変数（cases.json の env）。名前と値の両方をここで固定し、それ以外は拒否する。
// 値は秘密ではない（docs の errors ページの条件 1: 非対話モードで組み込みのエージェントを無効にする）。
const CASE_ENV_ALLOW = { CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: ["1"] };

function parseArgs(argv) {
  const out = { list: false, status: false, credStat: false, caseId: null, work: null, claude: null, label: null, target: null, reason: null, includeDraft: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") out.list = true;
    else if (a === "--status") out.status = true;
    else if (a === "--cred-stat") out.credStat = true;
    else if (a === "--case") out.caseId = argv[++i];
    else if (a === "--work") out.work = argv[++i];
    else if (a === "--claude") out.claude = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--include-draft") out.includeDraft = true;
    else if (a === "--resume-after-stop") out.resume = true;
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
    // resume（--resume-after-stop）より後の stop だけを数える
    stops: entries.slice(entries.map((e) => e.type).lastIndexOf("resume") + 1).filter((e) => e.type === "stop"),
  };
}

function writeStop(work, reason) {
  appendFileSync(join(work, "ledger.jsonl"), JSON.stringify({ type: "stop", ts: new Date().toISOString(), reason }) + "\n");
  console.log(`- 止める条件に当たりました: ${reason}`);
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

// 認証・利用枠のエラーの形（result の api_error_status、または標準エラー出力・result の本文）
function authOrQuotaProblem(stderr, last) {
  const status = last?.api_error_status;
  if ([401, 403, 429].includes(status)) return `api_error_status=${status}`;
  if (last?.terminal_reason === "api_error") return "terminal_reason=api_error";
  const text = `${stderr}\n${typeof last?.result === "string" && last?.is_error ? last.result : ""}`;
  const m = text.match(/\b(401|403|429)\b|rate[ _-]?limit|usage limit|limit reached|not logged in|invalid api key|authentication|oauth|sign in again/i);
  return m ? `本文に「${m[0]}」` : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const casesDoc = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
  const cases = casesDoc.cases;

  if (args.list) {
    for (const c of cases) console.log(`${c.id}\t${c.kind}\t${c.status ?? ""}\t${c.agent ?? ""}\t${c.expect}`);
    return;
  }

  const work = resolve(args.work ?? join(tmpdir(), "claude-subagent-errors-run"));
  if (!isInside(tmpdir(), work)) throw new Error(`${work} は os.tmpdir() の外です`);
  mkdirSync(join(work, "raw"), { recursive: true });

  if (args.status) {
    const t = tally(readLedger(work));
    console.log(JSON.stringify({ ...t, stops: t.stops.map((s) => s.reason) }));
    return;
  }
  if (args.resume) {
    // 止める条件の原因を PM が確認し、再開を決めたときだけ使う。理由を ledger に残す
    if (!args.reason) throw new Error("--resume-after-stop には --reason <理由> が必要です");
    appendFileSync(join(work, "ledger.jsonl"), JSON.stringify({ type: "resume", ts: new Date().toISOString(), reason: args.reason }) + "\n");
    console.log(`resume: ${args.reason}`);
    return;
  }
  if (args.credStat) {
    const st = credStat();
    const first = readLedger(work).find((e) => e.type === "cred-stat");
    appendFileSync(join(work, "ledger.jsonl"), JSON.stringify({ type: "cred-stat", label: args.label ?? "", ...st }) + "\n");
    const same = first ? first.size === st.size && first.mtime === st.mtime && first.exists === st.exists : null;
    console.log(`cred-stat ${args.label ?? ""}: ${JSON.stringify(st)}${first ? `（最初の記録と${same ? "同じ" : "違う"}）` : "（最初の記録）"}`);
    if (same === false) writeStop(work, "認証情報ファイルの更新日時またはサイズが変わった");
    return;
  }

  const c = cases.find((x) => x.id === args.caseId);
  if (!c) throw new Error("--case にはケース ID を指定してください（--list で一覧）");
  if (c.status === "draft" && !args.includeDraft) throw new Error(`${c.id} は下書き（status: draft）です。まだ実行しません`);

  // 上限と止める条件の確認（実行前）
  const ledger = readLedger(work);
  const t = tally(ledger);
  if (t.stops.length) throw new Error(`止める条件が記録されています（${t.stops.map((s) => s.reason).join(" / ")}）。実行しません`);
  const willModel = c.kind === "model";
  if (t.launches + 1 > LIMITS.launches) throw new Error(`起動回数の上限 ${LIMITS.launches} に達しています`);
  if (willModel && t.modelRuns + 1 > LIMITS.modelRuns) throw new Error(`モデルを使う実行の上限 ${LIMITS.modelRuns} に達しています`);
  // 今回の範囲（E4）の上限は scope が d でないケースだけに掛ける（(d) はセット全体の上限で数える）
  if (willModel && c.scope !== "d" && t.modelRuns + 1 > PHASE_MODEL_LIMIT) throw new Error(`今回の範囲のモデルを使う実行の上限 ${PHASE_MODEL_LIMIT} に達しています`);
  if (t.costUsd >= LIMITS.costUsd) throw new Error(`累積コストの上限 ${LIMITS.costUsd} ドルに達しています`);
  const previous = ledger.filter((e) => e.type === "run" && e.id === c.id).length;
  if (previous >= MAX_RUNS_PER_CASE) throw new Error(`${c.id} は ${previous} 回実行済みです（再実行は 1 回まで）`);
  if (previous >= 1 && !args.reason) throw new Error(`${c.id} の再実行には --reason <理由> が必要です`);

  // 使い捨ての作業ディレクトリ（lab/ のコピー。CLAUDE.md や .claude/agents/ がリポジトリのものと混ざらない）
  const tag = previous === 0 ? c.id : `${c.id}-${previous + 1}`;
  const cwd = join(work, "cwd", tag);
  mkdirSync(cwd, { recursive: true });
  const skip = new Set([resolve(join(here, "lab", "prompts")), resolve(join(here, "lab", "drafts"))]);
  cpSync(join(here, "lab"), cwd, { recursive: true, filter: (src) => !skip.has(resolve(src)) });
  for (const f of c.extraAgents ?? []) copyFileSync(join(here, "lab", "drafts", "agents", f), join(cwd, ".claude", "agents", f));

  // Sf1: 指定した定義の tools 行（と disallowedTools 行）を 1 行の「tools: Read」に直す（コピーの中だけ。lab/ は変えない）
  let agent = c.agent;
  let patched = null;
  if (c.patchTools) {
    if (!args.target) throw new Error(`${c.id} には --target <定義名> が必要です`);
    agent = args.target;
    const f = join(cwd, ".claude", "agents", `${agent}.md`);
    if (!existsSync(f)) throw new Error(`${agent}.md がありません`);
    const lines = readFileSync(f, "utf8").split("\n");
    const end = lines.indexOf("---", 1);
    const head = lines.slice(1, end).filter((l) => !/^(tools|disallowedTools):/.test(l));
    const nameAt = head.findIndex((l) => l.startsWith("description:"));
    head.splice(nameAt + 1, 0, c.patchTools);
    writeFileSync(f, ["---", ...head, ...lines.slice(end)].join("\n"));
    patched = { agent, frontmatter: head };
  }
  execFileSync("git", ["init", "-q"], { cwd });

  // 子プロセスの環境変数（許可リスト）
  const env = {};
  for (const name of ALLOW) if (process.env[name] !== undefined) env[name] = process.env[name];
  env.DISABLE_AUTOUPDATER = "1"; // 公式 docs の自動更新を止める環境変数
  for (const [name, value] of Object.entries(c.env ?? {})) {
    if (!(CASE_ENV_ALLOW[name] ?? []).includes(value)) throw new Error(`${c.id} の env の ${name} は許可リストにありません`);
    env[name] = value;
  }
  const envNames = Object.keys(env).sort();

  const cmd = c.cmd === "node" ? process.execPath : findClaude(args.claude);
  const argv = c.args;
  const input = c.prompt ? readFileSync(join(here, "lab", "prompts", c.prompt), "utf8").split("{agent}").join(agent ?? "") : "";

  const before = Date.now();
  const r = spawnSync(cmd, argv, {
    cwd, env, input, encoding: "utf8", shell: false, windowsHide: true,
    timeout: c.timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - before;
  const timedOut = r.error?.code === "ETIMEDOUT" || (r.status === null && r.signal === "SIGTERM" && durationMs >= c.timeoutSec * 1000 - 500);
  const spawnError = r.error && !timedOut ? String(r.error.code ?? r.error.message) : null;

  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  writeFileSync(join(work, "raw", `${tag}.stdout.txt`), stdout);
  writeFileSync(join(work, "raw", `${tag}.stderr.txt`), stderr);
  const hookSrc = join(cwd, "logs", "subagent.jsonl");
  const hookLog = existsSync(hookSrc) ? readFileSync(hookSrc, "utf8") : "";
  writeFileSync(join(work, "raw", `${tag}.hook.jsonl`), hookLog);

  let x = null;
  if (c.format === "stream-json") {
    const token = readFileSync(join(here, "lab", "fixtures", "token.txt"), "utf8").trim();
    x = extractSpawn({ stdout, hookLog, token });
  }
  const costUsd = typeof x?.result?.total_cost_usd === "number" ? x.result.total_cost_usd : 0;

  const meta = {
    type: "run", id: c.id, tag, declaredKind: c.kind, cmd: c.cmd, format: c.format, agent: agent ?? null,
    reason: args.reason ?? null, patched,
    exitCode: r.status, signal: r.signal ?? null, timedOut, spawnError, durationMs,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr),
    costUsd, envNames,
    started: x ? x.started : null,
    validity: null,
  };
  // (d): Agent ツールの tool_use の input に subagent_type が入っていたら、そのケースは不成立
  if (c.requireNoSubagentType && x) meta.validity = checkNoSubagentType(x);
  appendFileSync(join(work, "ledger.jsonl"), JSON.stringify(meta) + "\n");
  writeFileSync(join(work, "raw", `${tag}.meta.json`), JSON.stringify(meta, null, 1) + "\n");

  // 画面に出すのは、置換を通した要約だけ（環境変数の値は出さない）
  const clip = (s, n = 400) => redact(s).replace(/\s+/g, " ").trim().slice(0, n);
  console.log(`## ${tag}（想定: ${c.expect}）${agent ? ` 定義: ${agent}` : ""}${args.reason ? ` 再実行の理由: ${args.reason}` : ""}`);
  console.log(`- 終了コード: ${timedOut ? "timeout" : r.status}${r.signal ? ` シグナル ${r.signal}` : ""}${spawnError ? ` 起動エラー ${spawnError}` : ""}、所要 ${durationMs} ms`);
  console.log(`- 子プロセスに渡した環境変数の名前: ${envNames.join(", ")}`);
  console.log(`- 標準出力 ${meta.stdoutBytes} バイト、標準エラー出力 ${meta.stderrBytes} バイト`);
  if (meta.validity) console.log(`- 前提の確認: ${meta.validity}`);
  if (patched) console.log(`- 直した定義の frontmatter: ${patched.frontmatter.join(" | ")}`);
  if (x) console.log(formatTable(x).split("\n").map((l) => `  ${l}`).join("\n"));
  else console.log(`- 標準出力（先頭、置換済み）: ${clip(stdout, 1500)}`);
  if (stderr.trim()) console.log(`- 標準エラー出力（先頭、置換済み）: ${clip(stderr)}`);
  if (timedOut) console.log("- タイムアウト。再実行は 1 回まで（--reason を付ける）");

  // 止める条件（実行後）
  if (c.cmd === "claude") {
    const problem = authOrQuotaProblem(stderr, x?.result ?? null);
    if (problem) writeStop(work, `認証・利用枠のエラーの可能性（${problem}）。リトライしない`);
    const version = x?.init?.version ?? (c.args[0] === "--version" ? (stdout.match(/\d+\.\d+\.\d+/) ?? [null])[0] : undefined);
    if (version !== undefined && version !== null && version !== EXPECTED_VERSION) writeStop(work, `版が ${EXPECTED_VERSION} ではない（${version}）`);
    if (x?.init?.agents) {
      const lab = new Set([...BUILTIN_AGENTS, "s-ok", "s-tools-blank", "s-tools-emptystr", "s-tools-emptylist", "s-tools-bogus", "s-tools-mixed", "s-tools-lower", "s-disallow-all", "s-main", "s-tools-mcp", "s-tools-cron"]);
      const extra = x.init.agents.filter((a) => !lab.has(a));
      if (extra.length) writeStop(work, `想定外のエージェント定義が init に出た（名前: ${extra.join(", ")}）`);
    }
    if (c.id === "S0" && x && !x.started) writeStop(work, "陽性対照 S0 でサブエージェントが起動しなかった");
  }
  const t2 = tally(readLedger(work));
  console.log(`- 累計: 起動 ${t2.launches}/${LIMITS.launches}、モデル ${t2.modelRuns}/${LIMITS.modelRuns}（今回の範囲 ${PHASE_MODEL_LIMIT}）、コスト ${t2.costUsd.toFixed(4)}/${LIMITS.costUsd} ドル`);
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
