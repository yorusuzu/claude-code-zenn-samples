#!/usr/bin/env node
// run-case.mjs
// cases.json の 1 ケースを、使い捨ての作業ディレクトリで実行し、終了コード、標準出力、標準エラー出力、所要時間を別々に保存する。
// samples/claude-code-subagent-errors/run-case.mjs をもとに、権限ルールの警告の検証向けに変えたもの。
//   - spawnSync で直接起動する（シェルを介さない。パイプを使うと終了コードが隠れるため）。
//   - 標準出力と標準エラー出力は必ず別のファイルに保存する（警告が片方にだけ出る場合を取り違えないため）。
//   - ケースごとに、使い捨ての作業ディレクトリ（lab/ のコピー、git init 済み）へ設定ファイルを書き込む。
//       settings.project → <cwd>/.claude/settings.json
//       settings.local   → <cwd>/.claude/settings.local.json
//       settings.user    → 隔離した CLAUDE_CONFIG_DIR/settings.json（isolatedConfig のケースだけ）
//       settings.file    → <作業>/cfgfile/<tag>.json（引数の {settingsFile} に入る）
//     値の中の文字列 "$<ID>" は rules.json のルール文字列に置き換える。{"$raw": "..."} は文字列をそのまま書く。
//   - 子プロセスの環境変数は許可リスト方式。process.env を丸ごと渡さない・出力しない。記録するのは変数の「名前」だけ。
//   - 実行は os.tmpdir() の下で行い、生の出力は <作業>/raw/ に置く（リポジトリには置かない）。
//   - 起動回数、モデルを使った回数、累積コスト、ケースごとの実行回数を ledger.jsonl に記録し、上限を超える実行は拒否する。
//   - 止める条件（認証・利用枠のエラー、版の変化、managed settings の存在、親ディレクトリの設定の混入）を見つけたら
//     ledger に stop を書き、以後の実行を拒否する。
//   - ユーザー設定（~/.claude/settings.json）と認証情報ファイルは読まない。更新日時とサイズだけを比べる
//     （--cred-stat と、claude を起動した後の毎回。直前の記録と比べる）。
//       認証情報ファイル … サイズが変わったら止める。更新日時だけの変化は記録だけ（OAuth の更新で変わるため）
//       ユーザー設定     … 更新日時かサイズが変わったら止める
//
// 使い方:
//   node run-case.mjs --list
//   node run-case.mjs --case <ID> [--dry-run] [--reason <再実行の理由>] [--work <os.tmpdir() の下のパス>] [--claude <claude の実行ファイル>]
//   node run-case.mjs --preflight                    managed settings と、親ディレクトリの .claude / CLAUDE.md の有無（名前だけ）
//   node run-case.mjs --cred-stat [--label <名前>]   認証情報ファイルとユーザー設定の更新日時とサイズだけを記録し、最初の記録と比べる
//   node run-case.mjs --status                       ledger の集計
//   node run-case.mjs --resume-after-stop --reason <理由>
import { spawnSync, execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractWarnings, formatReport, loadMarkers } from "./extract-warnings.mjs";
import { buildRedactor, scanResidue } from "./redact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redact = buildRedactor();

// 上限（plans/free-articles-5.md 6-6 節）。セット全体で数える。
const LIMITS = { launches: 80, modelRuns: 30, costUsd: 0.5 };
// 範囲ごとの上限。今回実行してよい範囲は ACTIVE_PHASES だけ。広げるときは理由を VERIFIED.md に書く。
//   E3 … 実行の土台と経路の探索（終了）。E4 … W 群を claude doctor で（隔離、モデルなし。14-4 節。終了）
//   E5 … D 群（壊れた deny / ask / allow が実際に効くか。haiku、--setting-sources project,local。14-5 節）
const PHASE_LIMITS = { E3: { launches: 25, modelRuns: 4 }, E4: { launches: 35, modelRuns: 0 }, E5: { launches: 30, modelRuns: 22 } };
const ACTIVE_PHASES = ["E5"];
// 1 ケースあたりの実行回数の上限（最初の 1 回 + 再実行 1 回）
const MAX_RUNS_PER_CASE = 2;
// 想定する版。途中で変わったら止める。
const EXPECTED_VERSION = "2.1.293";

// 子プロセスに渡す環境変数の名前（許可リスト）。足りないと分かったものだけを足し、VERIFIED.md に名前を書く。
const ALLOW = [
  "PATH", "SystemRoot", "windir", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH",
  "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "ComSpec", "PATHEXT",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramData",
  "CLAUDE_CODE_GIT_BASH_PATH", // Git Bash の場所（設定されている場合だけ渡る）
];

// managed settings（企業管理の設定）の置き場所の候補。中身は読まず、有無だけを見る。
const MANAGED_FILES = process.platform === "win32"
  ? [
      join(process.env.ProgramFiles ?? "C:\\Program Files", "ClaudeCode", "managed-settings.json"),
      join(process.env.ProgramFiles ?? "C:\\Program Files", "ClaudeCode", "managed-settings.d"),
      join(process.env.ProgramData ?? "C:\\ProgramData", "ClaudeCode", "managed-settings.json"),
    ]
  : process.platform === "darwin"
    ? ["/Library/Application Support/ClaudeCode/managed-settings.json", "/Library/Application Support/ClaudeCode/managed-settings.d"]
    : ["/etc/claude-code/managed-settings.json", "/etc/claude-code/managed-settings.d"];
const MANAGED_REG_KEYS = process.platform === "win32" ? ["HKLM\\SOFTWARE\\Policies\\ClaudeCode", "HKCU\\SOFTWARE\\Policies\\ClaudeCode"] : [];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") out.list = true;
    else if (a === "--status") out.status = true;
    else if (a === "--cred-stat") out.credStat = true;
    else if (a === "--preflight") out.preflight = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--case") out.caseId = argv[++i];
    else if (a === "--work") out.work = argv[++i];
    else if (a === "--claude") out.claude = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
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

function tally(entries, phase = null) {
  const runs = entries.filter((e) => e.type === "run" && (phase === null || e.phase === phase));
  return {
    launches: runs.length,
    claudeLaunches: runs.filter((e) => e.cmd === "claude").length,
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

// 更新日時とサイズだけを比べるファイル。内容は読まない（statSync のメタデータだけ）。
//   stopOn: 何が変わったら止めるか（plans/free-articles-5.md 14-4 節 5 項）
//     "size"           … サイズが変わったら止める。更新日時だけの変化は ledger に記録するだけ
//                        （認証情報ファイル。モデルを使う実行の最中に OAuth の更新で更新日時だけが変わることがあるため）
//     "mtime-or-size"  … 更新日時かサイズが変わったら止める（ユーザー設定）
//     null             … 参考（~/.claude.json は通常の起動でも更新されるため）
function watchedFiles() {
  return [
    { label: "credentials", path: join(homedir(), ".claude", ".credentials.json"), stopOn: "size" },
    { label: "user-settings", path: join(homedir(), ".claude", "settings.json"), stopOn: "mtime-or-size" },
    { label: "claude.json", path: join(homedir(), ".claude.json"), stopOn: null },
  ];
}

// 監視するファイルのメタデータを記録し、同じファイルの直前の記録と比べる。止める条件に当たったら stop を書く。
//   直前の記録と比べるのは、--resume-after-stop の後に同じ変化で何度も止まらないようにするため。最初の記録との差も表示する。
function checkWatched(work, label, { quiet = false } = {}) {
  const ledgerFile = join(work, "ledger.jsonl");
  const ledger = readLedger(work);
  for (const f of watchedFiles()) {
    const st = statMeta(f.path);
    const mine = ledger.filter((e) => e.type === "cred-stat" && e.file === f.label);
    const first = mine[0];
    const prev = mine[mine.length - 1];
    const diff = (a) => (a ? { exists: a.exists !== st.exists, size: a.size !== st.size, mtime: a.mtime !== st.mtime } : null);
    const d = diff(prev);
    const changed = d ? [d.exists && "存在", d.size && "サイズ", d.mtime && "更新日時"].filter(Boolean) : [];
    const stop = d !== null && f.stopOn !== null && (d.exists || d.size || (f.stopOn === "mtime-or-size" && d.mtime));
    const note = d === null ? "最初の記録" : changed.length ? `直前の記録から ${changed.join("・")} が変わった` : "直前の記録と同じ";
    appendFileSync(ledgerFile, JSON.stringify({ type: "cred-stat", ts: new Date().toISOString(), file: f.label, label, ...st, changed, stopOn: f.stopOn, stop }) + "\n");
    if (!quiet || changed.length) {
      const firstSame = first ? first.size === st.size && first.mtime === st.mtime && first.exists === st.exists : null;
      console.log(`cred-stat ${f.label} ${label}: ${JSON.stringify(st)}（${note}${first && prev !== first ? `。最初の記録と${firstSame ? "同じ" : "違う"}` : ""}）${f.stopOn === null ? "（参考）" : ""}`);
    }
    if (stop) writeStop(work, `${f.label} の${changed.join("・")}が変わった（止める条件: ${f.stopOn}）`);
    else if (changed.length && f.stopOn !== null) console.log(`- ${f.label}: ${changed.join("・")}の変化は記録だけ（止める条件は ${f.stopOn}）`);
  }
}

function statMeta(p) {
  try {
    const s = statSync(p);
    return { exists: true, size: s.size, mtime: s.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

// managed settings の有無（名前だけ）と、作業ディレクトリの親に .claude / CLAUDE.md が混ざっていないか（名前だけ）
function preflight(cwdForAncestors) {
  const managed = MANAGED_FILES.filter((p) => existsSync(p)).map((p) => redact(p));
  for (const key of MANAGED_REG_KEYS) {
    // キーの有無だけを終了コードで見る。出力（値）は捨てて表示しない
    const r = spawnSync("reg", ["query", key], { stdio: "ignore", windowsHide: true, shell: false });
    if (r.status === 0) managed.push(`registry:${key}`);
  }
  const ancestors = [];
  const userConfigDir = resolve(join(homedir(), ".claude"));
  let d = resolve(cwdForAncestors);
  const root = parse(d).root;
  while (true) {
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
    for (const n of [".claude", "CLAUDE.md", "CLAUDE.local.md"]) {
      const p = join(d, n);
      if (!existsSync(p)) continue;
      // ホームの .claude はユーザー設定の置き場所（--setting-sources か CLAUDE_CONFIG_DIR で読ませない）。混入とは別に記録する
      ancestors.push({ name: redact(p), expectedUserConfig: resolve(p) === userConfigDir });
    }
    if (d === root) break;
  }
  return { managed, ancestors, unexpected: ancestors.filter((a) => !a.expectedUserConfig) };
}

// cases.json の "@名前" を presets で展開する（入れ子も）
function expandArgs(args, presets) {
  const out = [];
  for (const a of args) {
    if (typeof a === "string" && a.startsWith("@") && a.length > 1 && presets[a] !== undefined) out.push(...expandArgs(presets[a], presets));
    else out.push(a);
  }
  return out;
}

// settings の値の "$<ID>" を rules.json のルール文字列に置き換える
function expandRules(v, rules) {
  if (typeof v === "string" && /^\$[A-Za-z0-9-]+$/.test(v)) {
    const id = v.slice(1);
    if (!rules[id]) throw new Error(`rules.json に ${id} がありません`);
    return rules[id].rule;
  }
  if (Array.isArray(v)) return v.map((x) => expandRules(x, rules));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expandRules(x, rules)]));
  return v;
}

function settingsText(v, rules) {
  if (v && typeof v === "object" && typeof v.$raw === "string") return v.$raw;
  return JSON.stringify(expandRules(v, rules), null, 2) + "\n";
}

// W 群の "@W" を wBranch で決める
function resolveCase(c, doc) {
  if (c.kind !== "@W") return c;
  const b = doc.wBranch;
  const s = doc.wBranchSettings?.[b];
  if (!s) throw new Error(`${c.id}: W 群の回し方（wBranch）が決まっていません（${b}）`);
  if (b === "model" && c.nomodelOnly) throw new Error(`${c.id}: モデルありの分岐では実行しない（user スコープ）`);
  return { ...c, ...s };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
  const rules = JSON.parse(readFileSync(join(here, "rules.json"), "utf8")).rules;

  if (args.list) {
    for (const c of doc.cases) console.log(`${c.id}\t${c.phase}\t${c.kind}\t${c.expect}`);
    return;
  }

  const work = resolve(args.work ?? join(tmpdir(), "claude-permission-rule-errors-run"));
  if (!isInside(tmpdir(), work)) throw new Error(`${work} は os.tmpdir() の外です`);
  mkdirSync(join(work, "raw"), { recursive: true });
  const ledgerFile = join(work, "ledger.jsonl");

  if (args.status) {
    const all = readLedger(work);
    const t = tally(all);
    const phases = Object.fromEntries(Object.keys(PHASE_LIMITS).map((p) => [p, tally(all, p)]).map(([p, x]) => [p, { launches: x.launches, claudeLaunches: x.claudeLaunches, modelRuns: x.modelRuns, costUsd: x.costUsd }]));
    console.log(JSON.stringify({ launches: t.launches, claudeLaunches: t.claudeLaunches, modelRuns: t.modelRuns, costUsd: t.costUsd, phases, stops: t.stops.map((s) => s.reason) }));
    return;
  }
  if (args.resume) {
    if (!args.reason) throw new Error("--resume-after-stop には --reason <理由> が必要です");
    appendFileSync(ledgerFile, JSON.stringify({ type: "resume", ts: new Date().toISOString(), reason: args.reason }) + "\n");
    console.log(`resume: ${args.reason}`);
    return;
  }
  if (args.credStat) {
    checkWatched(work, args.label ?? "");
    return;
  }
  if (args.preflight) {
    const p = preflight(join(work, "cwd", "x"));
    appendFileSync(ledgerFile, JSON.stringify({ type: "preflight", ts: new Date().toISOString(), ...p }) + "\n");
    console.log(`managed settings: ${p.managed.length ? p.managed.join(", ") : "なし"}`);
    console.log(`親ディレクトリの .claude / CLAUDE.md: ${p.ancestors.length ? p.ancestors.map((a) => `${a.name}${a.expectedUserConfig ? "（ユーザー設定の置き場所）" : ""}`).join(", ") : "なし"}`);
    if (p.managed.length) writeStop(work, `managed settings がある（${p.managed.join(", ")}）`);
    if (p.unexpected.length) writeStop(work, `親ディレクトリに設定が混ざっている（${p.unexpected.map((a) => a.name).join(", ")}）`);
    return;
  }

  const raw = doc.cases.find((x) => x.id === args.caseId);
  if (!raw) throw new Error("--case にはケース ID を指定してください（--list で一覧）");
  if (!args.dryRun && !ACTIVE_PHASES.includes(raw.phase)) throw new Error(`${raw.id} は ${raw.phase} の範囲です。今回の範囲は ${ACTIVE_PHASES.join(", ")} だけです`);
  const c = resolveCase(raw, doc);

  // 上限と止める条件の確認（実行前）
  const ledger = readLedger(work);
  const t = tally(ledger);
  const tp = tally(ledger, c.phase);
  const pl = PHASE_LIMITS[c.phase];
  if (t.stops.length) throw new Error(`止める条件が記録されています（${t.stops.map((s) => s.reason).join(" / ")}）。実行しません`);
  const willModel = c.kind === "model";
  if (t.launches + 1 > LIMITS.launches) throw new Error(`起動回数の上限 ${LIMITS.launches} に達しています`);
  if (willModel && t.modelRuns + 1 > LIMITS.modelRuns) throw new Error(`モデルを使う実行の上限 ${LIMITS.modelRuns} に達しています`);
  if (t.costUsd >= LIMITS.costUsd) throw new Error(`累積コストの上限 ${LIMITS.costUsd} ドルに達しています`);
  if (pl && tp.launches + 1 > pl.launches) throw new Error(`${c.phase} の起動回数の上限 ${pl.launches} に達しています`);
  if (pl && willModel && tp.modelRuns + 1 > pl.modelRuns) throw new Error(`${c.phase} のモデルを使う実行の上限 ${pl.modelRuns} に達しています`);
  const previous = ledger.filter((e) => e.type === "run" && e.id === c.id).length;
  if (previous >= MAX_RUNS_PER_CASE) throw new Error(`${c.id} は ${previous} 回実行済みです（再実行は 1 回まで）`);
  if (previous >= 1 && !args.reason) throw new Error(`${c.id} の再実行には --reason <理由> が必要です`);

  // 使い捨ての作業ディレクトリ（lab/ のコピー。リポジトリの CLAUDE.md や .claude/ と混ざらない）
  const tag = previous === 0 ? c.id : `${c.id}-${previous + 1}`;
  const cwd = join(work, "cwd", tag);
  if (existsSync(cwd)) throw new Error(`${cwd} が既にあります（作業ディレクトリは使い回さない）`);
  mkdirSync(cwd, { recursive: true });
  cpSync(join(here, "lab"), cwd, { recursive: true });
  if (c.cmd === "claude") {
    const p = preflight(cwd);
    if (p.managed.length || p.unexpected.length) {
      writeStop(work, `実行前の確認: managed settings ${p.managed.join(", ") || "なし"}、親ディレクトリの混入 ${p.unexpected.map((a) => a.name).join(", ") || "なし"}`);
      return;
    }
  }

  // 設定ファイルを書く
  const written = [];
  let cfg = null;
  if (c.isolatedConfig === true) {
    cfg = join(work, "cfg", tag);
    mkdirSync(cfg, { recursive: true });
  }
  const s = c.settings ?? {};
  if (s.project !== undefined) {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "settings.json"), settingsText(s.project, rules));
    written.push(".claude/settings.json");
  }
  if (s.local !== undefined) {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "settings.local.json"), settingsText(s.local, rules));
    written.push(".claude/settings.local.json");
  }
  if (s.user !== undefined) {
    if (!cfg) throw new Error(`${c.id}: user の設定は isolatedConfig のケースでしか書きません（本物の ~/.claude/settings.json には書かない）`);
    writeFileSync(join(cfg, "settings.json"), settingsText(s.user, rules));
    written.push("<CLAUDE_CONFIG_DIR>/settings.json");
  }
  let settingsFile = null;
  if (s.file !== undefined) {
    mkdirSync(join(work, "cfgfile"), { recursive: true });
    settingsFile = join(work, "cfgfile", `${tag}.json`);
    writeFileSync(settingsFile, settingsText(s.file, rules));
    written.push("<作業>/cfgfile/<tag>.json");
  }
  execFileSync("git", ["init", "-q"], { cwd });

  // 子プロセスの環境変数（許可リスト）
  const env = {};
  for (const name of ALLOW) if (process.env[name] !== undefined) env[name] = process.env[name];
  env.DISABLE_AUTOUPDATER = "1"; // 公式 docs の自動更新を止める環境変数
  if (cfg) env.CLAUDE_CONFIG_DIR = cfg; // 使い捨てディレクトリ（本物のログイン情報・ユーザー設定を読ませない）
  if (c.env && Object.keys(c.env).length) throw new Error(`${c.id}: env は使いません（足すときは許可リストを作ってから）`);
  const envNames = Object.keys(env).sort();

  const debugFile = join(work, "raw", `${tag}.debug.txt`);
  const argv = expandArgs(c.args, doc.presets).map((a) =>
    String(a).split("{cwd}").join(cwd).split("{settingsFile}").join(settingsFile ?? "").split("{debugFile}").join(debugFile));
  if (argv.some((a) => a === "")) throw new Error(`${c.id}: 空の引数があります（{settingsFile} の書き忘れなど）`);
  if (argv.some((a) => /dangerously-skip-permissions|bypassPermissions/.test(a))) throw new Error("権限確認を飛ばす指定は使いません");

  if (args.dryRun) {
    console.log(`## ${tag}（dry-run。起動しない）`);
    console.log(`- argv: ${redact(JSON.stringify(argv))}`);
    console.log(`- 書いた設定: ${written.join(", ") || "なし"}`);
    for (const [k, v] of Object.entries(s)) console.log(`  ${k}: ${redact(settingsText(v, rules)).replace(/\s+/g, " ")}`);
    console.log(`- 環境変数の名前: ${envNames.join(", ")}`);
    return;
  }

  const cmd = c.cmd === "node" ? process.execPath : findClaude(args.claude);
  const before = Date.now();
  const r = spawnSync(cmd, argv, {
    cwd, env, input: "", encoding: "utf8", shell: false, windowsHide: true,
    timeout: c.timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - before;
  const timedOut = r.error?.code === "ETIMEDOUT" || (r.status === null && r.signal === "SIGTERM" && durationMs >= c.timeoutSec * 1000 - 500);
  const spawnError = r.error && !timedOut ? String(r.error.code ?? r.error.message) : null;

  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  writeFileSync(join(work, "raw", `${tag}.stdout.txt`), stdout);
  writeFileSync(join(work, "raw", `${tag}.stderr.txt`), stderr);
  const debug = existsSync(debugFile) ? readFileSync(debugFile, "utf8") : null;

  const x = extractWarnings({ stdout, stderr, debug, markers: loadMarkers(c.markers ?? []) });
  const costUsd = x.result?.totalCostUsd ?? 0;

  const meta = {
    type: "run", id: c.id, tag, phase: c.phase, declaredKind: c.kind, cmd: c.cmd,
    reason: args.reason ?? null, settingsWritten: written, isolatedConfig: Boolean(cfg),
    exitCode: r.status, signal: r.signal ?? null, timedOut, spawnError, durationMs,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), debugBytes: debug == null ? null : Buffer.byteLength(debug),
    costUsd, envNames,
    stderrWarnLines: x.stderr.hits.length, invalidRuleCount: x.stderr.invalidRuleCount,
    streamWarnEvents: x.stdout.warnEvents.length, stdoutWarnLines: x.stdout.hits.length, stdoutInvalidRuleCount: x.stdout.invalidRuleCount, debugWarnLines: x.debug?.count ?? null,
    initVersion: x.init?.version ?? null, resultIsError: x.result?.isError ?? null, resultSubtype: x.result?.subtype ?? null,
    // claude doctor の標準出力のとき（E4）: 節の見出し、「Invalid settings」節の有無と行数、末尾の N warnings found の N
    doctorVersion: x.doctor?.version ?? null, doctorSections: x.doctor?.sections ?? null,
    doctorInvalidSettings: x.doctor ? x.doctor.invalidSettings !== null : null,
    doctorInvalidLines: x.doctor?.invalidSettings?.length ?? null, doctorWarningsFound: x.doctor?.warningsFound ?? null,
  };
  appendFileSync(ledgerFile, JSON.stringify(meta) + "\n");
  writeFileSync(join(work, "raw", `${tag}.meta.json`), JSON.stringify(meta, null, 1) + "\n");

  // 画面に出すのは、置換を通した要約だけ（環境変数の値は出さない）
  const report = formatReport(x);
  const residue = scanResidue(report);
  console.log(`## ${tag}（想定: ${c.expect}）${args.reason ? ` 再実行の理由: ${args.reason}` : ""}`);
  console.log(`- 終了コード: ${timedOut ? "timeout" : r.status}${r.signal ? ` シグナル ${r.signal}` : ""}${spawnError ? ` 起動エラー ${spawnError}` : ""}、所要 ${durationMs} ms`);
  console.log(`- 書いた設定: ${written.join(", ") || "なし"}${cfg ? "（CLAUDE_CONFIG_DIR を隔離）" : ""}`);
  console.log(`- 子プロセスに渡した環境変数の名前: ${envNames.join(", ")}`);
  if (residue.length) console.log(`- 置換後にも残った形: ${residue.join(", ")}（本文は表示しない）`);
  else console.log(report);
  if (timedOut) console.log("- タイムアウト。再実行は 1 回まで（--reason を付ける）");

  // 止める条件（実行後）
  if (residue.length) writeStop(work, `置換後の要約にトークンらしい形（${residue.join(", ")}）`);
  if (c.cmd === "claude") {
    if (!c.expectAuthError) {
      const text = `${stderr}\n${x.result?.isError ? x.result.text ?? "" : ""}`;
      const status = x.result?.apiErrorStatus;
      const m = [401, 403, 429].includes(status) ? [`api_error_status=${status}`]
        : text.match(/\b(401|403|429)\b|rate[ _-]?limit|usage limit|limit reached|not logged in|invalid api key|authentication|oauth|sign in again/i);
      if (m) writeStop(work, `認証・利用枠のエラーの可能性（「${m[0]}」）。リトライしない`);
    }
    if (c.kind !== "model" && costUsd > 0) writeStop(work, "モデルなしの想定の実行でコストが付いた（モデル実行に数えた）");
    const version = x.init?.version ?? x.doctor?.version ?? (argv[0] === "--version" ? (stdout.match(/\d+\.\d+\.\d+/) ?? [null])[0] : null);
    if (version && version !== EXPECTED_VERSION) writeStop(work, `版が ${EXPECTED_VERSION} ではない（${version}）`);
    // claude を起動したあとは毎回、認証情報ファイルとユーザー設定のメタデータを直前の記録と比べる（内容は読まない）
    checkWatched(work, `after:${tag}`, { quiet: true });
  }
  const t2 = tally(readLedger(work));
  const tp2 = tally(readLedger(work), c.phase);
  console.log(`- 累計: 起動 ${t2.launches}/${LIMITS.launches}（${c.phase} ${tp2.launches}/${pl?.launches ?? "-"}）、モデル ${t2.modelRuns}/${LIMITS.modelRuns}（${c.phase} ${tp2.modelRuns}/${pl?.modelRuns ?? "-"}）、コスト ${t2.costUsd.toFixed(4)}/${LIMITS.costUsd} ドル`);
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
