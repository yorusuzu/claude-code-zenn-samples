#!/usr/bin/env node
// summarize-run.mjs
// `claude -p --output-format stream-json --verbose` の出力（JSONL）から、判定に使う情報を表にする。
//   1. init イベント: 版、モデル、権限モード、ツール、読み込まれたエージェント
//   2. イベントの種類ごとの件数（サブエージェント内部のイベントが出ているか）
//   3. Agent ツールの呼び出し（誰が、どのサブエージェントを呼んだか）
//   4. tool_use と tool_result（エラーかどうか、先頭の内容）
//   5. permission_denials（全 result の合計）
//   6. 結果イベント（複数出ることがある。エラー、ターン数、累積の費用）
//   7. hook イベント（--include-hook-events を付けた場合）
// 出力に出る本名・ホームのパス・一時ディレクトリ・セッション ID は置換する。
// 使い方: node summarize-run.mjs <run.jsonl | ->
import { readFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";

function buildRedactor() {
  const pairs = [];
  const add = (value, label) => {
    if (typeof value === "string" && value.length >= 3) {
      pairs.push([value, label]);
      pairs.push([value.replace(/\\/g, "/"), label]);
      pairs.push([value.replace(/\\/g, "\\\\"), label]);
    }
  };
  // 長い（具体的な）ものから先に置換する
  add(tmpdir(), "<tmp>");
  add(homedir(), "<home>");
  let name = "";
  try {
    name = userInfo().username;
  } catch {
    // 取れなければ飛ばす
  }
  add(name, "<user>");
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let s = String(text);
    for (const [from, to] of pairs) s = s.split(from).join(to);
    s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<session-id>");
    return s;
  };
}
const redact = buildRedactor();

const clip = (v, n = 110) => {
  const s = redact(typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "..." : s;
};
const cell = (v, n) => clip(v, n).replace(/\|/g, "\\|");
const short = (id) => (id ? String(id).slice(-6) : "-");

function readLines(file) {
  const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const events = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      bad++;
    }
  }
  return { events, bad };
}

function contentBlocks(event) {
  const c = event?.message?.content;
  return Array.isArray(c) ? c : [];
}

function resultText(block) {
  const c = block.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join(" ");
  return JSON.stringify(c ?? "");
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("使い方: node summarize-run.mjs <run.jsonl | ->");
  const { events, bad } = readLines(file);
  console.log(`イベント数: ${events.length}（JSON として読めなかった行: ${bad}）`);

  // 1. init
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  console.log("\n## init");
  if (!init) {
    console.log("init イベントがありません");
  } else {
    const tools = Array.isArray(init.tools) ? init.tools : [];
    const agents = Array.isArray(init.agents) ? init.agents : [];
    console.log(`- claude_code_version: ${init.claude_code_version ?? "(なし)"}`);
    console.log(`- model: ${init.model ?? "(なし)"}`);
    console.log(`- permissionMode: ${init.permissionMode ?? "(なし)"}`);
    console.log(`- tools(${tools.length}): ${tools.join(", ")}`);
    console.log(`- agents(${agents.length}): ${agents.join(", ")}`);
    console.log(`- 出てきた項目名: ${Object.keys(init).sort().join(", ")}`);
  }

  // 2. 種類ごとの件数
  const counts = new Map();
  for (const e of events) {
    const key = `${e.type}${e.subtype ? "/" + e.subtype : ""}${e.parent_tool_use_id ? " (parent_tool_use_id あり)" : ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log("\n## イベントの種類");
  for (const [k, v] of [...counts].sort()) console.log(`- ${k}: ${v}`);

  // tool_use の索引
  const uses = new Map(); // id -> {name, input, parent}
  const order = [];
  for (const e of events) {
    if (e.type !== "assistant") continue;
    for (const b of contentBlocks(e)) {
      if (b.type === "tool_use") {
        uses.set(b.id, { name: b.name, input: b.input ?? {}, parent: e.parent_tool_use_id ?? null });
        order.push(b.id);
      }
    }
  }
  const label = (id) => {
    const u = uses.get(id);
    return u && (u.name === "Agent" || u.name === "Task") ? u.input.subagent_type ?? "?" : short(id);
  };

  // 3. Agent 呼び出し
  console.log("\n## Agent ツールの呼び出し");
  console.log("| # | 呼んだ側 | subagent_type | prompt（先頭） |");
  console.log("|---|---|---|---|");
  let n = 0;
  let top = 0;
  let nested = 0;
  for (const id of order) {
    const u = uses.get(id);
    if (u.name !== "Agent" && u.name !== "Task") continue;
    n++;
    if (u.parent) nested++;
    else top++;
    console.log(`| ${n} | ${u.parent ? "サブエージェント内 (" + cell(label(u.parent), 20) + ")" : "親"} | ${cell(u.input.subagent_type ?? "(なし)", 30)} | ${cell(u.input.prompt ?? "", 60)} |`);
  }
  console.log(`\n合計 ${n} 回（親から ${top}、サブエージェント内から ${nested}）`);

  // 4. tool_use と tool_result
  console.log("\n## tool_use と tool_result");
  console.log("| 呼び出し元 | ツール | 対象 | エラー | 結果（先頭） |");
  console.log("|---|---|---|---|---|");
  const resultOf = new Map();
  for (const e of events) {
    if (e.type !== "user") continue;
    for (const b of contentBlocks(e)) {
      if (b.type === "tool_result") resultOf.set(b.tool_use_id, { isError: b.is_error === true, text: resultText(b) });
    }
  }
  for (const id of order) {
    const u = uses.get(id);
    const r = resultOf.get(id);
    const target = u.input.file_path ?? u.input.command ?? u.input.subagent_type ?? "";
    console.log(`| ${u.parent ? cell(label(u.parent), 20) : "親"} | ${u.name} | ${cell(target, 60)} | ${r ? (r.isError ? "はい" : "いいえ") : "(結果なし)"} | ${r ? cell(r.text, 110) : ""} |`);
  }
  const nestedUses = [...uses.values()].filter((u) => u.parent).length;
  console.log(`\nサブエージェント内の tool_use が stream-json に出た数: ${nestedUses}`);

  // 5/6. result（2.1.293 では、バックグラウンドのサブエージェントの完了通知で親が再開するたびに result が出る。
  //  total_cost_usd は累積、permission_denials は result ごとに別の配列なので、全部を見る）
  const results = events.filter((e) => e.type === "result");
  console.log("\n## 結果イベント");
  if (results.length === 0) {
    console.log("result イベントがありません（途中で止まった可能性）");
  } else {
    console.log(`result イベント数: ${results.length}`);
    results.forEach((r, i) => {
      console.log(`- #${i + 1} subtype: ${r.subtype}, is_error: ${r.is_error}, num_turns: ${r.num_turns}, duration_ms: ${r.duration_ms}, total_cost_usd: ${r.total_cost_usd}, permission_denials: ${(r.permission_denials ?? []).length}`);
    });
    const result = results[results.length - 1];
    console.log(`\n最後の result のコスト（累積）: ${result.total_cost_usd}`);
    if (result.usage) console.log(`- usage（最後の result）: ${clip(result.usage, 300)}`);
    const denials = results.flatMap((r) => (Array.isArray(r.permission_denials) ? r.permission_denials : []));
    console.log(`\n## permission_denials（全 result の合計 ${denials.length}）`);
    for (const d of denials) {
      const t = d.tool_input ?? {};
      console.log(`- ${d.tool_name}: ${cell(t.file_path ?? t.command ?? t, 90)} (tool_use ${short(d.tool_use_id)}${uses.get(d.tool_use_id)?.parent ? "、サブエージェント内 " + label(uses.get(d.tool_use_id).parent) : ""})`);
    }
    console.log(`\n## 親の最終返答（先頭）\n${clip(result.result ?? "", 600)}`);
  }

  // 7. hook イベント
  const hooks = events.filter((e) => e.type === "system" && /hook/i.test(e.subtype ?? ""));
  console.log(`\n## hook イベント (${hooks.length})`);
  const byHook = new Map();
  for (const h of hooks) {
    const key = `${h.subtype} ${h.hook_event ?? h.hook_event_name ?? ""} exit=${h.exit_code ?? h.outcome ?? "-"}`;
    byHook.set(key, (byHook.get(key) ?? 0) + 1);
  }
  for (const [k, v] of [...byHook].sort()) console.log(`- ${cell(k, 120)}: ${v}`);
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
