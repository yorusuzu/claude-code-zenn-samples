#!/usr/bin/env node
// extract-warnings.mjs
// 保存した標準出力・標準エラー出力（と、あればデバッグ出力）を読み、権限ルールの警告がどこに出たかを表にする。
// 依存パッケージなし。モデルは呼ばない。表に出す文字列は redact.mjs の置換を通す。
//   (1) 標準エラー出力のうち、警告らしい語を含む行（置換済み）と件数
//   (2) 標準出力の stream-json の全イベントの type / subtype の集計と、警告らしい文字列を含むイベントの有無
//   (3) system/init の項目名の一覧
//   (4) result の is_error、subtype、total_cost_usd
//   (5) D 群: tool_use の入力、対応する tool_result の is_error と本文の先頭 400 文字（置換済み）、目印の語が入っているか
//   (6) claude doctor の標準出力: 節の見出し、「Invalid settings」節の項目、末尾の N warnings found（parseDoctor）
//
// 使い方:
//   node extract-warnings.mjs <raw の接頭辞> [--markers a,b,42]
//     例: node extract-warnings.mjs <作業>/raw/M5   … M5.stdout.txt、M5.stderr.txt、（あれば）M5.debug.txt を読む
//   import { extractWarnings, formatReport } from "./extract-warnings.mjs" でも使える
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRedactor } from "./redact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redact = buildRedactor();

// 警告らしい語（計画 6-1 節の 5 語に、旧文言 Mismatched と、未知ツール名・trust の警告の候補を足した）
export const WARN_RE = /Invalid permission rule|Malformed|Mismatched|Ignoring|skipped|settings|unknown tool|not a known tool|invalid|warn/i;
// stream-json のイベントの中で「警告らしい」とみなす語（init の tools などに普通に入る語は避ける）
const EVENT_RE = /Invalid permission rule|Malformed|Mismatched|was skipped|Ignoring \d+|invalid settings|settings error|settings warning/i;

// 目印: lab/zone の合言葉（a / b / c）と、node -p "6*7" の出力（42）
export function loadMarkers(keys) {
  const out = {};
  for (const k of keys) {
    if (k === "42") out["42"] = "42";
    else {
      const f = join(here, "lab", "zone", `secret-${k}.txt`);
      if (existsSync(f)) out[k] = readFileSync(f, "utf8").trim();
    }
  }
  return out;
}

// claude doctor の標準出力を節に分ける（2.1.293 の形。見出しは空行の直後の、"-" や空白で始まらない行）。
//   doctor の出力でなければ null。
//   invalidSettings: 「Invalid settings」節の項目（"- " で始まる行。続きの字下げ行は前の項目につなぐ）。節がなければ null
//   warningsFound: 末尾の「N warnings found」の N（なければ null）
export function parseDoctor(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  if (!lines.some((l) => /^Claude Code doctor\s*$/.test(l))) return null;
  const sections = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (!l.trim()) {
      cur = null;
      return;
    }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    if (prevBlank && !/^[-\s]/.test(l)) {
      cur = { title: l.trim(), items: [], lines: [] };
      sections.push(cur);
      return;
    }
    if (!cur) return;
    cur.lines.push(l);
    if (l.startsWith("- ")) cur.items.push(l.slice(2));
    else if (/^\s/.test(l) && cur.items.length) cur.items[cur.items.length - 1] += `\n${l}`;
  });
  const inv = sections.find((s) => s.title === "Invalid settings");
  const wf = sections.find((s) => /^\d+ warnings? found$/.test(s.title));
  const ver = String(stdout).match(/^Running: .*\((\d+\.\d+\.\d+)\)/m);
  return {
    version: ver ? ver[1] : null,
    sections: sections.map((s) => s.title),
    invalidSettings: inv ? inv.items : null,
    warningsFound: wf ? Number(wf.title.match(/^\d+/)[0]) : null,
    warningItems: wf ? wf.items.map((t) => t.split("\n")[0]) : [],
  };
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b === "string" ? b : b?.text ?? JSON.stringify(b))).join("\n");
  return content == null ? "" : JSON.stringify(content);
}

export function extractWarnings({ stdout = "", stderr = "", debug = null, markers = {} }) {
  const clip = (s, n) => redact(s).replace(/\s+/g, " ").trim().slice(0, n);

  // (1) 標準エラー出力
  const stderrLines = stderr.split(/\r?\n/).filter((l) => l.trim());
  const stderrHits = stderrLines.filter((l) => WARN_RE.test(l)).map((l) => redact(l));
  const invalidRuleCount = (stderr.match(/Invalid permission rule/g) ?? []).length;
  const malformedCount = (stderr.match(/Malformed/g) ?? []).length;

  // (2)〜(5) 標準出力（stream-json なら 1 行 1 イベント）
  const events = [];
  let nonJsonLines = 0;
  for (const l of stdout.split(/\r?\n/)) {
    if (!l.trim()) continue;
    try {
      events.push(JSON.parse(l));
    } catch {
      nonJsonLines++;
    }
  }
  const isStreamJson = events.length > 0 && nonJsonLines === 0;
  // text 出力（claude doctor や --output-format text）のときは、標準出力の行も警告らしい語で拾う
  const stdoutHits = isStreamJson ? [] : stdout.split(/\r?\n/).filter((l) => l.trim() && EVENT_RE.test(l)).map((l) => redact(l));
  const typeCounts = {};
  const warnEvents = [];
  let init = null;
  let result = null;
  const toolUses = [];
  const toolResults = new Map();
  events.forEach((e, i) => {
    const key = `${e.type ?? "?"}/${e.subtype ?? "-"}`;
    typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    const s = JSON.stringify(e);
    // モデルの返答（assistant）は警告の経路に数えない。init・system・result などを見る
    if (e.type !== "assistant" && e.type !== "user") {
      const m = s.match(EVENT_RE);
      if (m) warnEvents.push({ index: i, type: key, word: m[0], excerpt: clip(s.slice(Math.max(0, m.index - 120), m.index + 200), 320) });
    }
    if (e.type === "system" && e.subtype === "init" && !init) init = e;
    if (e.type === "result") result = e;
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
    for (const b of blocks) {
      if (e.type === "assistant" && b.type === "tool_use") toolUses.push({ id: b.id, name: b.name, input: b.input });
      if (e.type === "user" && b.type === "tool_result") toolResults.set(b.tool_use_id, { isError: b.is_error === true, text: textOf(b.content) });
    }
  });

  const tools = toolUses.map((u) => {
    const r = toolResults.get(u.id);
    const text = r?.text ?? "";
    const found = Object.entries(markers).filter(([, v]) => (v === "42" ? /(^|\D)42(\D|$)/.test(text) : text.includes(v))).map(([k]) => k);
    return {
      name: u.name,
      input: redact(JSON.stringify(u.input)),
      hasResult: Boolean(r),
      isError: r ? r.isError : null,
      head: r ? clip(text, 400) : null,
      markersInResult: found,
    };
  });

  // デバッグ出力（あれば）
  let debugHits = null;
  if (debug != null) {
    const lines = debug.split(/\r?\n/).filter((l) => l.trim());
    const hits = lines.filter((l) => /Invalid permission rule|Malformed|Mismatched|was skipped|permission rule|invalid settings/i.test(l));
    debugHits = { lines: lines.length, count: hits.length, first: hits.slice(0, 20).map((l) => clip(l, 400)) };
  }

  return {
    stderr: { bytes: Buffer.byteLength(stderr), lines: stderrLines.length, hits: stderrHits, invalidRuleCount, malformedCount },
    stdout: {
      bytes: Buffer.byteLength(stdout),
      isStreamJson,
      events: events.length,
      nonJsonLines,
      typeCounts,
      warnEvents,
      hits: stdoutHits,
      invalidRuleCount: (stdout.match(/Invalid permission rule/g) ?? []).length,
      textHead: isStreamJson ? null : clip(stdout, 600),
    },
    init: init
      ? {
          keys: Object.keys(init),
          version: init.claude_code_version ?? init.version ?? null,
          permissionMode: init.permissionMode ?? null,
          tools: Array.isArray(init.tools) ? init.tools : null,
        }
      : null,
    result: result
      ? {
          subtype: result.subtype ?? null,
          isError: result.is_error ?? null,
          totalCostUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : null,
          numTurns: result.num_turns ?? null,
          terminalReason: result.terminal_reason ?? null,
          apiErrorStatus: result.api_error_status ?? null,
          permissionDenials: Array.isArray(result.permission_denials) ? result.permission_denials.map((d) => d.tool_name ?? "?") : null,
          text: typeof result.result === "string" ? clip(result.result, 300) : null,
        }
      : null,
    tools,
    debug: debugHits,
    doctor: isStreamJson ? null : parseDoctor(stdout),
  };
}

export function formatReport(x) {
  const out = [];
  out.push(`- 標準エラー出力: ${x.stderr.bytes} バイト、${x.stderr.lines} 行。警告らしい行 ${x.stderr.hits.length} 件（Invalid permission rule ${x.stderr.invalidRuleCount} 回、Malformed ${x.stderr.malformedCount} 回）`);
  for (const h of x.stderr.hits.slice(0, 20)) out.push(`    stderr> ${h}`);
  if (x.stdout.isStreamJson) {
    out.push(`- 標準出力: stream-json ${x.stdout.events} イベント。type/subtype: ${Object.entries(x.stdout.typeCounts).map(([k, v]) => `${k}×${v}`).join(", ")}`);
    out.push(`- 警告らしいイベント: ${x.stdout.warnEvents.length ? x.stdout.warnEvents.map((w) => `#${w.index} ${w.type}「${w.word}」`).join(", ") : "なし"}`);
    for (const w of x.stdout.warnEvents.slice(0, 5)) out.push(`    event> ${w.excerpt}`);
  } else {
    out.push(`- 標準出力: ${x.stdout.bytes} バイト（stream-json ではない）。警告らしい行 ${x.stdout.hits.length} 件（Invalid permission rule ${x.stdout.invalidRuleCount} 回）。先頭: ${x.stdout.textHead || "（空）"}`);
    for (const h of x.stdout.hits.slice(0, 20)) out.push(`    stdout> ${h}`);
  }
  if (x.doctor) {
    const d = x.doctor;
    out.push(`- doctor: 版 ${d.version}。節: ${d.sections.join(" / ")}`);
    out.push(`- doctor の「Invalid settings」節: ${d.invalidSettings === null ? "なし" : `${d.invalidSettings.length} 項目`}。末尾の warnings found: ${d.warningsFound ?? "-"}`);
    for (const it of d.invalidSettings ?? []) out.push(`    invalid> ${redact(it)}`);
  }
  if (x.init) out.push(`- init: version ${x.init.version}、permissionMode ${x.init.permissionMode}、tools ${x.init.tools ? `[${x.init.tools.join(", ")}]` : "-"}。項目名: ${x.init.keys.join(", ")}`);
  if (x.result) {
    const r = x.result;
    out.push(`- result: subtype ${r.subtype}、is_error ${r.isError}、total_cost_usd ${r.totalCostUsd}、num_turns ${r.numTurns}${r.terminalReason ? `、terminal_reason ${r.terminalReason}` : ""}${r.apiErrorStatus ? `、api_error_status ${r.apiErrorStatus}` : ""}、permission_denials ${r.permissionDenials ? `[${r.permissionDenials.join(", ")}]` : "-"}`);
    if (r.text) out.push(`    result> ${r.text}`);
  }
  for (const t of x.tools) out.push(`- tool_use ${t.name} ${t.input} → ${t.hasResult ? `is_error ${t.isError}、目印 [${t.markersInResult.join(", ")}]、本文: ${t.head}` : "tool_result なし"}`);
  if (x.debug) {
    out.push(`- デバッグ出力: ${x.debug.lines} 行。警告らしい行 ${x.debug.count} 件`);
    for (const l of x.debug.first) out.push(`    debug> ${l}`);
  }
  return out.join("\n");
}

// コマンドとして実行したとき
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("使い方: node extract-warnings.mjs <raw の接頭辞> [--markers a,b,42]");
    process.exit(2);
  }
  const mi = process.argv.indexOf("--markers");
  const keys = mi > 0 ? process.argv[mi + 1].split(",") : [];
  const read = (suffix) => (existsSync(`${prefix}.${suffix}`) ? readFileSync(`${prefix}.${suffix}`, "utf8") : null);
  const x = extractWarnings({ stdout: read("stdout.txt") ?? "", stderr: read("stderr.txt") ?? "", debug: read("debug.txt"), markers: loadMarkers(keys) });
  console.log(formatReport(x));
}
