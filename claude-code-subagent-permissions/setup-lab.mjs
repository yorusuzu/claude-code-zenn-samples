#!/usr/bin/env node
// setup-lab.mjs
// 使い捨ての検証用ディレクトリ（os.tmpdir() 以下）を作る。
//   - lab/.claude/agents/t-*.md  を  <dir>/.claude/agents/ にコピー
//   - lab/.claude/settings.<run>.json を <dir>/.claude/settings.json としてコピー
//   - lab/hooks/*.mjs を <dir>/hooks/ にコピー
//   - lab/prompts/<run>.txt を <dir>/prompt.txt としてコピー
//   - zones/<名前>/ と logs/ を作り、git init する
// モデルは呼ばない。実行コマンドは表示するだけで、実行はしない。
//
// 使い方:
//   node setup-lab.mjs --run a1|a2 [--dir <パス>] [--force]
//   --dir は os.tmpdir() の下だけ許可（このリポジトリの CLAUDE.md や .claude/agents/ が混ざらないようにするため）
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, "lab");

const ZONES = {
  a1: ["a0-allow", "a1-readonly", "a2-disallow", "a3-deny", "a3w-deny", "a4-cli", "a5-plan", "a6-nest", "a7-bash", "a8-hook"],
  a2: ["a0-allow", "a5-plan", "a5b-noallow", "a6-nest", "a7-bash", "a7n-bash", "a9-projallow"],
};

const COMMON =
  "--model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config " +
  "--forward-subagent-text --output-format stream-json --verbose --include-hook-events --max-budget-usd 2";
const COMMANDS = {
  a1:
    `claude -p ${COMMON} --permission-mode acceptEdits ` +
    `--disallowedTools "Edit(/zones/a4-cli/**)" --allowedTools "Bash(echo *)" < prompt.txt > run-a1.jsonl 2> run-a1.stderr`,
  a2:
    `claude -p ${COMMON} --permission-mode default ` +
    `--allowedTools "Edit(/zones/a0-allow/**)" "Edit(/zones/a5-plan/**)" "Edit(/zones/a6-nest/**)" "Edit(/zones/a7-bash/**)" "Bash(echo *)" < prompt.txt > run-a2.jsonl 2> run-a2.stderr`,
};

function parseArgs(argv) {
  const out = { run: null, dir: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") out.run = argv[++i];
    else if (argv[i] === "--dir") out.dir = argv[++i];
    else if (argv[i] === "--force") out.force = true;
    else throw new Error(`知らない引数: ${argv[i]}`);
  }
  return out;
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ZONES[args.run]) throw new Error("--run には a1 か a2 を指定してください");

  const dir = resolve(args.dir ?? join(tmpdir(), `claude-subagent-lab-${args.run}`));
  if (!isInside(tmpdir(), dir)) throw new Error(`${dir} は os.tmpdir() の外です。tmpdir の下を指定してください`);
  if (existsSync(dir)) {
    if (!args.force) throw new Error(`${dir} は既にあります。作り直すなら --force を付けてください`);
    rmSync(dir, { recursive: true, force: true });
  }

  mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
  for (const f of readdirSync(join(lab, ".claude", "agents"))) {
    if (f.startsWith("t-") && f.endsWith(".md")) cpSync(join(lab, ".claude", "agents", f), join(dir, ".claude", "agents", f));
  }
  cpSync(join(lab, ".claude", `settings.${args.run}.json`), join(dir, ".claude", "settings.json"));
  cpSync(join(lab, "hooks"), join(dir, "hooks"), { recursive: true });
  cpSync(join(lab, "prompts", `${args.run}.txt`), join(dir, "prompt.txt"));
  mkdirSync(join(dir, "logs"), { recursive: true });
  for (const z of ZONES[args.run]) {
    mkdirSync(join(dir, "zones", z), { recursive: true });
    writeFileSync(join(dir, "zones", z, ".keep"), "");
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });

  console.log(`作成: ${dir}`);
  console.log(`zone: ${ZONES[args.run].join(", ")}`);
  console.log("");
  console.log("実行（モデルを呼ぶ。認証用以外の ANTHROPIC_* などの環境変数が 401 の原因になる場合は、先に unset する）:");
  console.log(`  cd "${dir}"`);
  console.log(`  ${COMMANDS[args.run]}`);
  console.log("");
  console.log("実行後:");
  console.log(`  node check-zones.mjs "${dir}" --run ${args.run}`);
  console.log(`  node summarize-run.mjs "${join(dir, `run-${args.run}.jsonl`)}"`);
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
