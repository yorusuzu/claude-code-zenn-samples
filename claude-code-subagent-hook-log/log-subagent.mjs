#!/usr/bin/env node
// log-subagent.mjs
// SubagentStart / SubagentStop の hook から呼ばれ、標準入力の JSON から
// 「取れた項目だけ」を 1 行の JSON として JSONL に追記する。
//
// 使い方（hook の command から）:
//   node log-subagent.mjs <出力ファイル> [--raw]
//
// 方針:
//   - 常に終了コード 0。例外は握りつぶす（hook の失敗でセッションを止めない）
//   - 標準出力・標準エラーには何も出さない
//   - 本文（last_assistant_message など）、cwd、transcript のパスは記録しない。
//     記録するのは項目名の一覧（keys）と、本文の文字数だけ
//   - session_id は生の値を書かず、SHA-256 の先頭 8 桁にする（同じセッションかどうかだけ分かる）
//   - --raw を付けると、入力 JSON の全文を <出力ファイル>.raw にも書く。
//     個人情報が入るため、実験用。コミットや記事への貼り付けはしないこと
import { appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const SAFE_FIELDS = ["agent_id", "agent_type", "permission_mode", "stop_hook_active"];
const LENGTH_FIELDS = ["last_assistant_message", "subagent_output"];

// 5 秒で必ず終わる（標準入力が閉じられない場合の保険）
setTimeout(() => process.exit(0), 5000).unref();

function readStdin() {
  return new Promise((done) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => done(data));
    process.stdin.on("error", () => done(data));
  });
}

function append(file, line) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line + "\n", "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes("--raw");
  const target = args.find((a) => !a.startsWith("--")) ?? "subagent-log.jsonl";
  const file = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), target);

  const text = await readStdin();
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    append(file, JSON.stringify({ ts: new Date().toISOString(), event: "parse-error", bytes: text.length }));
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    event: input.hook_event_name ?? "unknown",
  };
  if (typeof input.session_id === "string") {
    entry.session = createHash("sha256").update(input.session_id).digest("hex").slice(0, 8);
  }
  for (const key of SAFE_FIELDS) {
    if (key in input) entry[key] = input[key];
  }
  for (const key of LENGTH_FIELDS) {
    if (typeof input[key] === "string") entry[`${key}_length`] = input[key].length;
  }
  entry.keys = Object.keys(input).sort();
  append(file, JSON.stringify(entry));

  if (raw) append(file + ".raw", JSON.stringify(input));
}

try {
  await main();
} catch {
  // 握りつぶす
}
process.exit(0);
