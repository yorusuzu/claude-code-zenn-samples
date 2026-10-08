#!/usr/bin/env node
// deny-zone.mjs
// 検証用の PreToolUse hook。2 つのことをする。
//   1. 呼ばれたツールの記録（ツール名、サブエージェントからの呼び出しか、対象の zone 名）を JSONL に追記する
//   2. Write / Edit の対象パスに "a8-hook" が含まれていたら、終了コード 2 で拒否する
// 使い方: node deny-zone.mjs <ログファイル>
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

setTimeout(() => process.exit(0), 5000).unref();

function readStdin() {
  return new Promise((done) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => done(data));
    process.stdin.on("error", () => done(data));
  });
}

let exitCode = 0;
try {
  const target = process.argv[2] ?? "logs/pretool.jsonl";
  const file = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), target);
  const input = JSON.parse(await readStdin());
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  const path = String(ti.file_path ?? "");
  // \x5c はバックスラッシュ。Windows のパス（zones\a0-allow\...）と、スラッシュ区切りの両方に対応する
  const zone = (path.match(/zones[/\x5c]+([^/\x5c]+)/) ?? [])[1] ?? null;

  let decision = "allow";
  if ((tool === "Write" || tool === "Edit") && path.includes("a8-hook")) {
    decision = "deny";
    exitCode = 2;
    process.stderr.write("deny-zone.mjs: a8-hook への書き込みは hook で拒否しています\n");
  }

  const entry = {
    ts: new Date().toISOString(),
    tool,
    from_subagent: input.agent_id != null,
    agent_type: input.agent_type ?? null,
    zone,
    decision,
  };
  // Agent ツールの呼び出しは、呼ぼうとしたサブエージェントの名前も残す
  if (typeof ti.subagent_type === "string") entry.subagent_type = ti.subagent_type;
  if (tool === "Bash" && typeof ti.command === "string") {
    entry.bash_zone = (ti.command.match(/zones[/\x5c]+([^/\x5c\s"']+)/) ?? [])[1] ?? null;
  }
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
} catch {
  // 記録に失敗しても、ツールの実行は止めない
}
process.exit(exitCode);
