#!/usr/bin/env node
// classify-run.mjs
// `claude -p` の 1 回の実行結果（終了コード、標準出力、標準エラー出力）から、判定を出す。依存パッケージなし。
//
// 判定（この README の定義。Claude Code の公式の分類ではない）:
//   FAILED   終了コードが 0 以外（タイムアウト、シグナルによる終了を含む）。
//            または終了コードは 0 だが、result の is_error が true、あるいは subtype が success でない。
//   DEGRADED 終了コード 0、is_error が false、subtype が success。だが permission_denials が 1 以上
//            （ツールの実行が拒否されている。依頼の仕事が済んでいない可能性がある）。
//   WARN     失敗とも拒否とも言えないが、成功と言い切れない。例: text 形式で result が見えない、
//            標準エラー出力に出力がある、result イベントが複数ある、出力が JSON として読めない。
//   OK       終了コード 0、is_error が false、subtype が success、拒否 0、標準エラー出力が空。
//
// 判定の根拠の優先順: 終了コード → result の is_error / subtype / permission_denials → 標準エラー出力。
// （ファイルができたか、モデルの返答の内容は、この判定には使わない。）
//
// 使い方:
//   node classify-run.mjs --exit <数字|timeout> --format <text|json|stream-json> --stdout <ファイル> [--stderr <ファイル>]
//   node classify-run.mjs --check-fixtures <fixtures のディレクトリ>
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 標準出力を読む。format が json なら単一の JSON（オブジェクトか配列）、stream-json なら 1 行 1 イベント。
export function parseOutput(stdout, format) {
  const out = { shape: "none", results: [], eventCount: 0, parseError: false };
  const text = String(stdout ?? "");
  if (format === "text" || !text.trim()) return out;
  if (format === "json") {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) {
        out.shape = "array";
        out.eventCount = v.length;
        out.results = v.filter((e) => e && e.type === "result");
      } else if (v && typeof v === "object") {
        out.shape = "object";
        out.eventCount = 1;
        if (v.type === "result" || "is_error" in v || "subtype" in v) out.results = [v];
      } else {
        out.parseError = true;
      }
    } catch {
      out.parseError = true;
    }
    return out;
  }
  // stream-json
  out.shape = "lines";
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      out.eventCount++;
      if (e && e.type === "result") out.results.push(e);
    } catch {
      out.parseError = true;
    }
  }
  return out;
}

export function classify({ exitCode, timedOut = false, signal = null, format = "text", stdout = "", stderr = "" }) {
  const reasons = [];
  const parsed = parseOutput(stdout, format);
  const results = parsed.results;
  const last = results[results.length - 1] ?? null;
  const denials = results.reduce((n, r) => n + (Array.isArray(r.permission_denials) ? r.permission_denials.length : 0), 0);
  const stderrLines = String(stderr ?? "").split(/\r?\n/).filter((l) => l.trim()).length;
  const facts = {
    exitCode: timedOut ? "timeout" : exitCode,
    format,
    shape: parsed.shape,
    resultEvents: results.length,
    is_error: last ? last.is_error ?? null : null,
    subtype: last ? last.subtype ?? null : null,
    terminal_reason: last ? last.terminal_reason ?? null : null,
    api_error_status: last ? last.api_error_status ?? null : null,
    permission_denials: denials,
    stderrLines,
  };

  // 1. 終了コード
  if (timedOut) return { verdict: "FAILED", reasons: ["タイムアウトで強制終了した"], facts };
  if (signal) return { verdict: "FAILED", reasons: [`シグナルで終了した (${signal})`], facts };
  if (exitCode !== 0) return { verdict: "FAILED", reasons: [`終了コードが ${exitCode}`], facts };

  // 2. 終了コード 0 のとき: result のフィールド
  if (format === "text") {
    reasons.push("text 形式のため、is_error / subtype / permission_denials を見られない");
    if (stderrLines > 0) reasons.push(`標準エラー出力に ${stderrLines} 行`);
    return { verdict: "WARN", reasons, facts };
  }
  if (parsed.parseError && results.length === 0) {
    return { verdict: "WARN", reasons: ["標準出力が JSON として読めず、result も見つからない"], facts };
  }
  if (!last) return { verdict: "WARN", reasons: ["終了コード 0 だが、result が標準出力にない"], facts };

  if (last.is_error === true) return { verdict: "FAILED", reasons: ["終了コードは 0 だが、result の is_error が true"], facts };
  if (last.subtype && last.subtype !== "success") {
    return { verdict: "FAILED", reasons: [`終了コードは 0 だが、subtype が ${last.subtype}`], facts };
  }
  if (denials > 0) {
    return { verdict: "DEGRADED", reasons: [`終了コード 0、is_error ${last.is_error}、subtype ${last.subtype} だが、permission_denials が ${denials} 件`], facts };
  }

  // 3. 成功の形。ただし気になる点があれば WARN
  if (stderrLines > 0) reasons.push(`標準エラー出力に ${stderrLines} 行`);
  if (results.length > 1) reasons.push(`result イベントが ${results.length} 個（最後だけを見ている）`);
  if (parsed.parseError) reasons.push("JSON として読めない行がある");
  if (reasons.length > 0) return { verdict: "WARN", reasons, facts };
  return { verdict: "OK", reasons: ["終了コード 0、is_error false、subtype success、拒否 0、標準エラー出力なし"], facts };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

function readOptional(file) {
  return file && existsSync(file) ? readFileSync(file, "utf8") : "";
}

// fixtures/<名前>/ に exit-code.txt（数字か timeout）、format.txt、stdout.txt、stderr.txt があり、
// fixtures/expected.json が { "<名前>": { "verdict": "...", "synthetic": true|false, "note": "..." } } を持つ。
function checkFixtures(dir) {
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
  let bad = 0;
  console.log("| fixture | 由来 | 期待 | 実際 | 一致 |");
  console.log("|---|---|---|---|---|");
  for (const name of Object.keys(expected).sort()) {
    const d = join(dir, name);
    const codeText = readFileSync(join(d, "exit-code.txt"), "utf8").trim();
    const timedOut = codeText === "timeout";
    const r = classify({
      exitCode: timedOut ? null : Number(codeText),
      timedOut,
      format: readFileSync(join(d, "format.txt"), "utf8").trim(),
      stdout: readOptional(join(d, "stdout.txt")),
      stderr: readOptional(join(d, "stderr.txt")),
    });
    const ok = r.verdict === expected[name].verdict;
    if (!ok) bad++;
    console.log(`| ${name} | ${expected[name].synthetic ? "合成" : "実測"} | ${expected[name].verdict} | ${r.verdict} | ${ok ? "はい" : "いいえ"} |`);
  }
  console.log(`\n不一致: ${bad} 件`);
  return bad === 0;
}

function main() {
  const argv = process.argv.slice(2);
  const fx = arg(argv, "--check-fixtures");
  if (fx) {
    process.exit(checkFixtures(resolve(fx)) ? 0 : 1);
  }
  const code = arg(argv, "--exit");
  const format = arg(argv, "--format") ?? "text";
  if (code === null || !["text", "json", "stream-json"].includes(format)) {
    throw new Error("使い方: node classify-run.mjs --exit <数字|timeout> --format <text|json|stream-json> --stdout <ファイル> [--stderr <ファイル>]");
  }
  const timedOut = code === "timeout";
  const r = classify({
    exitCode: timedOut ? null : Number(code),
    timedOut,
    format,
    stdout: readOptional(arg(argv, "--stdout")),
    stderr: readOptional(arg(argv, "--stderr")),
  });
  console.log(`判定: ${r.verdict}`);
  for (const x of r.reasons) console.log(`- ${x}`);
  console.log(`根拠の値: ${JSON.stringify(r.facts)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    process.exit(1);
  }
}
