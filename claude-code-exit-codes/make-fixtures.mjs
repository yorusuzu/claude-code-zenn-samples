#!/usr/bin/env node
// make-fixtures.mjs
// run-case.mjs が一時ディレクトリに残した生の出力から、fixtures/ を作る。依存パッケージなし。
//   - 実測の fixture: 生の出力を置換（redact.mjs）に通し、必要な項目だけ残して保存する。
//       json 形式        … 最後の result オブジェクトから、判定に使う項目だけ残す
//       stream-json 形式 … result イベントだけ残す（ほかのイベントは捨てる）
//       text 形式        … 標準出力をそのまま（置換のみ）
//   - 合成の fixture: 実測では起きなかった形（タイムアウト、終了コード 0 なのに is_error など）を、手で小さく作る。
//       expected.json の synthetic が true のもの。実測ではない。
//   - 保存前に scanResidue() で sk-ant-、Bearer、eyJ、メールアドレスの形が残っていないか調べ、残っていれば保存せず止まる。
// 使い方: node make-fixtures.mjs [--work <run-case.mjs の作業ディレクトリ>] [--out fixtures]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildRedactor, scanResidue } from "./redact.mjs";
import { parseOutput } from "./classify-run.mjs";

// 実測の fixture 名 → 元になった実行の tag、期待する判定、メモ
const REAL = {
  "real-ok-m0": ["M0", "OK", "ツールを使わない短い依頼。モデルは OK と返した"],
  "real-ok-m7": ["M7", "OK", "Write を許可して実行。ファイルができた（陽性対照）"],
  "real-ok-n5b-broken-settings": ["N5b", "OK", "壊れた JSON の --settings を渡しても、無視されて普通に成功した"],
  "real-degraded-m3-default-mode": ["M3", "DEGRADED", "Write が許可されず拒否。終了コード 0、is_error false、subtype success、permission_denials 1"],
  "real-degraded-m4-dontask": ["M4", "DEGRADED", "dontAsk で Write が拒否。終了コードは 0"],
  "real-degraded-v2-stream-json": ["V2", "DEGRADED", "M4 を stream-json で。result イベントだけ残した"],
  "real-failed-m1-max-turns": ["M1", "FAILED", "--max-turns 1 を超えた。終了コード 1、subtype error_max_turns、is_error true"],
  "real-failed-m2-budget": ["M2", "FAILED", "--max-budget-usd を超えた。終了コード 1、subtype error_max_budget_usd"],
  "real-failed-v1-stream-json-max-turns": ["V1", "FAILED", "M1 を stream-json で。result イベントだけ残した"],
  "real-failed-a1-not-logged-in": ["A1", "FAILED", "認証情報なし。終了コード 1、subtype は success のまま is_error が true"],
  "real-failed-a2-invalid-key": ["A2", "FAILED", "無効な API キー。終了コード 1、api_error_status 401、subtype は success のまま"],
  "real-failed-r1-unknown-model": ["R1", "FAILED", "存在しないモデル名。終了コード 1、api_error_status 404、標準エラー出力に 1 行"],
  "real-failed-n1-unknown-flag": ["N1", "FAILED", "知らないオプション。終了コード 1、標準エラー出力にエラー、標準出力は空"],
  "real-failed-n2-no-prompt": ["N2", "FAILED", "プロンプトなし。終了コード 1"],
  "real-failed-n3-bad-format": ["N3", "FAILED", "--output-format に不正な値。終了コード 1"],
  "real-failed-n4-resume-missing": ["N4", "FAILED", "存在しない会話の --resume。終了コード 1"],
  "real-failed-n5a-settings-missing": ["N5a", "FAILED", "存在しない --settings ファイル。終了コード 1"],
  "real-warn-v3-text": ["V3", "WARN", "text 形式。拒否が起きていても、標準出力は短い文だけで、判定に使う項目がない"],
  "real-warn-n0-version": ["N0", "WARN", "--version は終了コード 0 の text 出力。判定に使う項目がない"],
};

// 合成の fixture（実測ではない。classify-run.mjs の規則を確かめるためだけに作った）
const resultObj = (o) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  api_error_status: null,
  stop_reason: "end_turn",
  terminal_reason: "completed",
  num_turns: 2,
  total_cost_usd: 0.001,
  permission_denials: [],
  result: "synthetic",
  ...o,
});
const SYNTH = {
  "synth-failed-timeout": {
    exit: "timeout", format: "json", stdout: "", stderr: "", verdict: "FAILED",
    note: "合成。子プロセスを時間切れで強制終了した場合（出力なし）",
  },
  "synth-failed-exit0-is-error": {
    exit: "0", format: "json", stdout: JSON.stringify(resultObj({ is_error: true })), stderr: "", verdict: "FAILED",
    note: "合成。終了コード 0 なのに is_error が true。2.1.293 の実測では起きなかった（is_error true は常に終了コード 1）",
  },
  "synth-failed-exit0-error-subtype": {
    exit: "0", format: "json", stdout: JSON.stringify(resultObj({ subtype: "error_during_execution" })), stderr: "", verdict: "FAILED",
    note: "合成。終了コード 0 なのに subtype が success でない。実測では起きなかった",
  },
  "synth-warn-stderr-on-success": {
    exit: "0", format: "json", stdout: JSON.stringify(resultObj({})), stderr: "warning: synthetic\n", verdict: "WARN",
    note: "合成。成功の形だが標準エラー出力に 1 行ある",
  },
  "synth-warn-two-results": {
    exit: "0", format: "stream-json",
    stdout: [resultObj({ result: "first" }), resultObj({ result: "last" })].map((e) => JSON.stringify(e)).join("\n") + "\n",
    stderr: "", verdict: "WARN",
    note: "合成。stream-json で result イベントが 2 個（最後だけを見ている）。実測（M6）では 1 個だった",
  },
  "synth-warn-unparsable-json": {
    exit: "0", format: "json", stdout: "{ not json", stderr: "", verdict: "WARN",
    note: "合成。終了コード 0 だが標準出力が JSON として読めない",
  },
  "synth-degraded-stream-json": {
    exit: "0", format: "stream-json",
    stdout: JSON.stringify(resultObj({ permission_denials: [{ tool_name: "Write", tool_input: { file_path: "<tmp>/out.txt" } }] })) + "\n",
    stderr: "", verdict: "DEGRADED",
    note: "合成。stream-json の result に permission_denials が 1 件",
  },
};

function arg(argv, name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
}

function pruneResult(r, redact) {
  const keep = {};
  for (const k of ["type", "subtype", "is_error", "api_error_status", "stop_reason", "terminal_reason", "num_turns", "total_cost_usd"]) {
    if (k in r) keep[k] = r[k];
  }
  if (Array.isArray(r.permission_denials)) {
    keep.permission_denials = r.permission_denials.map((d) => ({ tool_name: d.tool_name, tool_input: d.tool_input }));
  }
  if (typeof r.result === "string") keep.result = r.result;
  return JSON.parse(redact(JSON.stringify(keep)));
}

function main() {
  const argv = process.argv.slice(2);
  const work = resolve(arg(argv, "--work", join(tmpdir(), "claude-exit-codes-run")));
  const out = resolve(arg(argv, "--out", "fixtures"));
  const redact = buildRedactor();
  const expected = {};
  const residue = [];
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const save = (name, { exit, format, stdout, stderr }, meta) => {
    const dir = join(out, name);
    mkdirSync(dir, { recursive: true });
    const files = { "exit-code.txt": `${exit}\n`, "format.txt": `${format}\n`, "stdout.txt": stdout, "stderr.txt": stderr };
    for (const [f, text] of Object.entries(files)) {
      const hits = scanResidue(text);
      if (hits.length > 0) residue.push(`${name}/${f}: ${hits.join(", ")}`);
      writeFileSync(join(dir, f), text);
    }
    expected[name] = meta;
  };

  for (const [name, [tag, verdict, note]] of Object.entries(REAL)) {
    const meta = JSON.parse(readFileSync(join(work, "raw", `${tag}.meta.json`), "utf8"));
    const rawOut = readFileSync(join(work, "raw", `${tag}.stdout.txt`), "utf8");
    const rawErr = readFileSync(join(work, "raw", `${tag}.stderr.txt`), "utf8");
    let stdout;
    if (meta.format === "text" || !rawOut.trim()) {
      stdout = redact(rawOut);
    } else {
      const parsed = parseOutput(rawOut, meta.format);
      const last = parsed.results[parsed.results.length - 1];
      if (!last) throw new Error(`${tag}: result が見つからない`);
      stdout = JSON.stringify(pruneResult(last, redact), null, meta.format === "json" ? 1 : 0) + "\n";
    }
    save(name, { exit: meta.timedOut ? "timeout" : meta.exitCode, format: meta.format, stdout, stderr: redact(rawErr) }, { verdict, synthetic: false, note: `${note}（元: ${tag}）` });
  }
  for (const [name, s] of Object.entries(SYNTH)) {
    save(name, s, { verdict: s.verdict, synthetic: true, note: s.note });
  }

  if (residue.length > 0) {
    console.error("置換後にも token らしい形が残っている。保存した fixtures を消して止める:");
    for (const r of residue) console.error(`- ${r}`);
    rmSync(out, { recursive: true, force: true });
    process.exit(2);
  }
  writeFileSync(join(out, "expected.json"), JSON.stringify(expected, null, 1) + "\n");
  console.log(`fixtures を ${Object.keys(expected).length} 個作った（実測 ${Object.keys(REAL).length}、合成 ${Object.keys(SYNTH).length}）。残留検査: 問題なし`);
}

main();
