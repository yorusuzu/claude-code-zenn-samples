#!/usr/bin/env node
// extract-spawn.mjs
// claude -p --output-format stream-json --verbose の出力（1 行 1 JSON）から、
// サブエージェントの起動に関わる項目だけを抜き出して表にする。モデルは呼ばない。依存なし。
//
//   1. Agent ツールの tool_use の入力: キーの一覧と subagent_type の値
//   2. その tool_result: is_error と本文（置換済み、先頭 400 文字）
//   3. 起動したかどうかの手がかり: task_* の system イベント、hook のログ（SubagentStart）、
//      サブエージェント側のメッセージ（parent_tool_use_id 付き）、合言葉が tool_result に含まれるか
//      （2.1.293 の -p では Agent ツールは非同期で起動し、tool_result は「Async agent launched successfully」。
//       合言葉はサブエージェント側の Read の tool_result に出る）
//   3b. task_updated の patch.error と task_notification の summary（status が failed のもの）。
//      非同期の起動で、ツール解決の段階で拒否されたとき（zero tools）の原文はここに出る
//   3c. 判定（verdict）: 呼び出し時に拒否 / 起動処理の途中で拒否 / 起動した（ツール呼び出しなし） / 起動した
//   4. 最後の result イベント: is_error、subtype、num_turns、total_cost_usd
//   5. system/init の agents と tools の名前
//
// 「起動した」の判断にモデルの自己申告（最終回答の文面）は使わない。
//
// 使い方:
//   node extract-spawn.mjs <stream-json の標準出力ファイル> [--hook <hook ログ JSONL>] [--token-file <合言葉のファイル>] [--json]
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRedactor } from "./redact.mjs";

const AGENT_TOOL_NAMES = new Set(["Agent", "Task"]); // 版によって Task と呼ばれていた

function parseLines(text) {
  const events = [];
  let bad = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      bad++;
    }
  }
  return { events, bad };
}

function blockText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : b && typeof b.text === "string" ? b.text : ""))
      .join("\n");
  }
  return "";
}

export function extractSpawn({ stdout, hookLog = "", token = "" }) {
  const redact = buildRedactor();
  const clip = (s, n = 400) => redact(s).replace(/\s+/g, " ").trim().slice(0, n);
  const { events, bad } = parseLines(stdout);

  const out = {
    eventCount: events.length,
    unparsableLines: bad,
    init: null,
    agentCalls: [],
    agentResults: [],
    mainToolUses: [],
    subagentToolUses: [],
    subagentToolResults: [],
    subagentMessages: 0,
    taskEvents: {},
    taskFailures: [],
    hookEvents: [],
    hookLog: [],
    result: null,
    started: false,
    startEvidence: [],
  };

  const agentCallIds = new Set();
  for (const e of events) {
    if (e.type === "system" && e.subtype === "init" && !out.init) {
      out.init = {
        version: e.claude_code_version ?? null,
        model: e.model ?? null,
        permissionMode: e.permissionMode ?? null,
        agents: Array.isArray(e.agents) ? e.agents.map(String) : null,
        tools: Array.isArray(e.tools) ? e.tools.map(String) : null,
      };
      continue;
    }
    if (e.type === "system" && typeof e.subtype === "string" && e.subtype.startsWith("task_")) {
      out.taskEvents[e.subtype] = (out.taskEvents[e.subtype] ?? 0) + 1;
      // 失敗の原文（CLI が出した文。モデルの言い換えではない）。output_file などのパスは記録しない
      if (e.subtype === "task_updated" && e.patch?.status === "failed") {
        out.taskFailures.push({ source: "task_updated.patch.error", text: clip(String(e.patch.error ?? ""), 600) });
      } else if (e.subtype === "task_notification" && e.status === "failed") {
        out.taskFailures.push({ source: "task_notification.summary", text: clip(String(e.summary ?? ""), 600) });
      }
      continue;
    }
    if (e.type === "system" && typeof e.subtype === "string" && e.subtype.startsWith("hook_")) {
      out.hookEvents.push({ subtype: e.subtype, hook_event: e.hook_event ?? e.hook_event_name ?? null, exit_code: e.exit_code ?? null, outcome: e.outcome ?? null });
      continue;
    }
    const fromSub = typeof e.parent_tool_use_id === "string" && e.parent_tool_use_id.length > 0;
    if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      if (fromSub) out.subagentMessages++;
      for (const b of e.message.content) {
        if (b?.type !== "tool_use") continue;
        if (fromSub) {
          out.subagentToolUses.push(b.name);
        } else {
          out.mainToolUses.push(b.name);
          if (AGENT_TOOL_NAMES.has(b.name)) {
            agentCallIds.add(b.id);
            const input = b.input && typeof b.input === "object" ? b.input : {};
            out.agentCalls.push({
              tool: b.name,
              inputKeys: Object.keys(input).sort(),
              subagent_type: "subagent_type" in input ? input.subagent_type : "(なし)",
              promptLength: typeof input.prompt === "string" ? input.prompt.length : null,
            });
          }
        }
      }
      continue;
    }
    if (e.type === "user" && Array.isArray(e.message?.content)) {
      if (fromSub) out.subagentMessages++;
      for (const b of e.message.content) {
        if (b?.type !== "tool_result") continue;
        const text = blockText(b.content);
        if (fromSub) {
          out.subagentToolResults.push({ is_error: b.is_error === true, text: clip(text, 200), tokenSeen: token ? text.includes(token) : null });
        } else if (agentCallIds.has(b.tool_use_id)) {
          out.agentResults.push({
            is_error: b.is_error === true,
            text: clip(text, 400),
            // 本文はそのまま（置換前）で照合する。合言葉は秘密ではないので本文に残ってよい
            tokenSeen: token ? text.includes(token) : null,
          });
        }
      }
      continue;
    }
    if (e.type === "result") {
      out.result = {
        subtype: e.subtype ?? null,
        is_error: e.is_error ?? null,
        num_turns: e.num_turns ?? null,
        total_cost_usd: e.total_cost_usd ?? null,
        api_error_status: e.api_error_status ?? null,
        terminal_reason: e.terminal_reason ?? null,
        // 版によってはない項目。あれば起動の手がかりとして記録する（モデルの自己申告ではなく、CLI が数えた値）
        subagent_stats: e.subagent_stats && typeof e.subagent_stats === "object"
          ? { spawned: e.subagent_stats.spawned ?? null, completed: e.subagent_stats.completed ?? null, failed: e.subagent_stats.failed ?? null, refused: e.subagent_stats.refused ?? null, by_type: e.subagent_stats.by_type ?? null }
          : null,
        permission_denials: Array.isArray(e.permission_denials) ? e.permission_denials.map((d) => d?.tool_name ?? "?") : null,
        text: typeof e.result === "string" ? clip(e.result, 300) : null,
      };
    }
  }

  for (const line of String(hookLog).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const h = JSON.parse(line);
      out.hookLog.push({ event: h.event, agent_type: h.agent_type ?? null });
    } catch {
      out.hookLog.push({ event: "unparsable" });
    }
  }

  // 起動したかの手がかり（どれか 1 つでもあれば「起動した」。根拠を並べる）
  if (out.taskEvents.task_started) out.startEvidence.push(`task_started x${out.taskEvents.task_started}`);
  const starts = out.hookLog.filter((h) => h.event === "SubagentStart");
  if (starts.length) out.startEvidence.push(`hook SubagentStart x${starts.length} (${starts.map((h) => h.agent_type).join(", ")})`);
  if (out.subagentMessages) out.startEvidence.push(`subagent messages x${out.subagentMessages}`);
  if (out.agentResults.some((r) => r.tokenSeen)) out.startEvidence.push("token in Agent tool_result");
  if (out.subagentToolResults.some((r) => r.tokenSeen)) out.startEvidence.push("token in subagent tool_result");
  if ((out.result?.subagent_stats?.spawned ?? 0) > 0) out.startEvidence.push(`result.subagent_stats.spawned=${out.result.subagent_stats.spawned}`);
  out.started = out.startEvidence.length > 0;
  // started は「起動の処理が始まった」の意味。SubagentStart や spawned=1 は、ツール解決で拒否される前にも記録される（2.1.293 で確認）。
  // そのため、拒否と起動を分けて verdict に書く
  if (out.agentCalls.length === 0) out.verdict = "Agent の呼び出しなし";
  else if (!out.started && out.agentResults.length > 0 && out.agentResults.every((r) => r.is_error)) out.verdict = "呼び出し時に拒否（Agent の tool_result が is_error）";
  else if (out.taskFailures.length > 0 && out.subagentMessages === 0) out.verdict = "起動処理の途中で拒否（task が failed、サブエージェントのメッセージなし）";
  else if (out.started && out.subagentToolUses.length === 0) out.verdict = "起動した（サブエージェントのツール呼び出しなし）";
  else if (out.started) out.verdict = "起動した";
  else out.verdict = "判定できない";
  return out;
}

// (d) の前提: Agent ツールの tool_use の input に subagent_type が入っていないこと。入っていたらケースは不成立
export function checkNoSubagentType(x) {
  if (x.agentCalls.length === 0) return "不成立（Agent ツールの呼び出しがない）";
  if (x.agentCalls.some((a) => a.subagent_type !== "(なし)")) return "不成立（tool_use の input に subagent_type が入っていた）";
  return "成立（すべての Agent 呼び出しで subagent_type なし）";
}

function formatTable(x) {
  const lines = [];
  const i = x.init;
  lines.push(`init: version=${i?.version} model=${i?.model} permissionMode=${i?.permissionMode}`);
  lines.push(`init.agents: ${i?.agents ? i.agents.join(", ") : "(なし)"}`);
  lines.push(`init.tools: ${i?.tools ? i.tools.join(", ") : "(なし)"}`);
  lines.push(`main tool_use: ${x.mainToolUses.join(", ") || "(なし)"}`);
  x.agentCalls.forEach((c, n) => lines.push(`Agent call #${n + 1}: tool=${c.tool} keys=[${c.inputKeys.join(", ")}] subagent_type=${JSON.stringify(c.subagent_type)}`));
  x.agentResults.forEach((r, n) => lines.push(`Agent tool_result #${n + 1}: is_error=${r.is_error} tokenSeen=${r.tokenSeen} text=${JSON.stringify(r.text)}`));
  lines.push(`subagent tool_use: ${x.subagentToolUses.join(", ") || "(なし)"}`);
  x.subagentToolResults.forEach((r, n) => lines.push(`subagent tool_result #${n + 1}: is_error=${r.is_error} tokenSeen=${r.tokenSeen} text=${JSON.stringify(r.text)}`));
  lines.push(`task events: ${JSON.stringify(x.taskEvents)}`);
  x.taskFailures.forEach((f) => lines.push(`task failed (${f.source}): ${JSON.stringify(f.text)}`));
  lines.push(`hook events (stream): ${x.hookEvents.map((h) => `${h.subtype}:${h.hook_event}`).join(", ") || "(なし)"}`);
  lines.push(`hook log: ${x.hookLog.map((h) => `${h.event}:${h.agent_type}`).join(", ") || "(なし)"}`);
  const r = x.result;
  if (r) {
    lines.push(`result: subtype=${r.subtype} is_error=${r.is_error} num_turns=${r.num_turns} total_cost_usd=${r.total_cost_usd} api_error_status=${r.api_error_status} terminal_reason=${r.terminal_reason} permission_denials=[${(r.permission_denials ?? []).join(", ")}]`);
    if (r.subagent_stats) lines.push(`result.subagent_stats: ${JSON.stringify(r.subagent_stats)}`);
    if (r.text) lines.push(`result.result: ${JSON.stringify(r.text)}`);
  }
  else lines.push("result: (なし)");
  lines.push(`started: ${x.started} (${x.startEvidence.join(" / ") || "手がかりなし"})`);
  lines.push(`verdict: ${x.verdict}`);
  if (x.unparsableLines) lines.push(`解析できない行: ${x.unparsableLines}`);
  return lines.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find((a, k) => !a.startsWith("--") && !["--hook", "--token-file"].includes(args[k - 1]));
  if (!file) {
    console.error("使い方: node extract-spawn.mjs <stdout ファイル> [--hook <JSONL>] [--token-file <ファイル>] [--json]");
    process.exit(2);
  }
  const opt = (name) => {
    const k = args.indexOf(name);
    return k >= 0 ? args[k + 1] : null;
  };
  const hookFile = opt("--hook");
  const tokenFile = opt("--token-file");
  const x = extractSpawn({
    stdout: readFileSync(file, "utf8"),
    hookLog: hookFile && existsSync(hookFile) ? readFileSync(hookFile, "utf8") : "",
    token: tokenFile ? readFileSync(tokenFile, "utf8").trim() : "",
  });
  console.log(args.includes("--json") ? JSON.stringify(x, null, 1) : formatTable(x));
}

export { formatTable };
