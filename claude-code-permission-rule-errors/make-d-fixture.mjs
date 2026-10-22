#!/usr/bin/env node
// make-d-fixture.mjs
// D 群の実行で保存した生の出力（<作業>/raw/<tag>.stdout.txt と <tag>.meta.json）から、
// 判定に使う部分だけを抜き出した最小の JSON を fixtures/<ケース>.json に書く。
//   入れるもの: 版、終了コード、標準エラー出力のバイト数、置いた設定、tool_use の入力、
//               tool_result の is_error と本文の先頭、目印（合言葉・42）の有無、result の subtype とコスト
//   入れないもの: stream-json の全文、init の項目（版以外）、セッション ID、UUID、アカウントの情報
// 文字列は redact.mjs で置換し、作業ディレクトリのパスは <work>\cwd\<case>\ に置き換える。
// 置換の後に残ってはいけない形（トークン、メール、一時ディレクトリ、セッション ID）が残っていれば、書かずに止まる。
//
// 使い方: node make-d-fixture.mjs --work <run-case.mjs に渡した作業ディレクトリ> <tag> [<tag> ...]
//   例:   node make-d-fixture.mjs --work /tmp/perm-rule-run D01 D02
// 依存: Node.js 18 以降の標準モジュールと、同じディレクトリの extract-warnings.mjs、redact.mjs だけ。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractWarnings, loadMarkers } from "./extract-warnings.mjs";
import { buildRedactor, scanResidue } from "./redact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const redact = buildRedactor();
const argv = process.argv.slice(2);
const wi = argv.indexOf("--work");
if (wi < 0 || !argv[wi + 1]) {
  console.error("使い方: node make-d-fixture.mjs --work <作業ディレクトリ> <tag> [<tag> ...]");
  process.exit(2);
}
const work = resolve(argv[wi + 1]);
const tags = argv.filter((_, i) => i !== wi && i !== wi + 1);

const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8")).cases;
const rules = JSON.parse(readFileSync(join(here, "rules.json"), "utf8")).rules;
// 設定の中の "$<ID>" をルール文字列に戻す（run-case.mjs と同じ規則）
const expand = (v) =>
  typeof v === "string" && v.startsWith("$") && rules[v.slice(1)]
    ? rules[v.slice(1)].rule
    : Array.isArray(v)
      ? v.map(expand)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]))
        : v;

const B = "\\";
for (const tag of tags) {
  const id = tag.split("-")[0];
  const c = cases.find((x) => x.id === id);
  if (!c || c.group !== "D") throw new Error(`${tag}: D 群のケースではない`);
  const stdout = readFileSync(join(work, "raw", `${tag}.stdout.txt`), "utf8");
  const meta = JSON.parse(readFileSync(join(work, "raw", `${tag}.meta.json`), "utf8"));
  const x = extractWarnings({ stdout, stderr: "", markers: loadMarkers(c.markers ?? []) });

  // 作業フォルダのパスを <work>\cwd\<case>\ に置き換える（Windows の区切り。/ の区切りも同じように扱う）
  const prefixes = [redact(join(work, "cwd", tag)) + B, redact(join(work, "cwd", tag)).replace(/\\/g, "/") + "/"];
  const fixPath = (s) => prefixes.reduce((t, p) => t.split(p).join(p.endsWith("/") ? "<work>/cwd/<case>/" : `<work>${B}cwd${B}<case>${B}`), s);

  const fixture = {
    _note: "make-d-fixture.mjs で生の stream-json から抜き出した最小の JSON。全文ではない。パスと ID は置換済み",
    id,
    version: x.init?.version ?? null,
    exitCode: meta.exitCode,
    stderrBytes: meta.stderrBytes,
    settings: expand(c.settings),
    prompt: c.args.at(-1),
    tools: x.tools.map((t) => ({
      name: t.name,
      input: JSON.parse(t.input, (k, v) => (typeof v === "string" ? fixPath(v) : v)),
      isError: t.isError,
      head: t.head === null ? null : fixPath(t.head).slice(0, 200),
      markers: t.markersInResult,
    })),
    result: x.result
      ? {
          subtype: x.result.subtype,
          isError: x.result.isError,
          totalCostUsd: x.result.totalCostUsd,
          numTurns: x.result.numTurns,
          permissionDenials: x.result.permissionDenials,
        }
      : null,
  };
  const text = JSON.stringify(fixture, null, 2) + "\n";
  const residue = scanResidue(text);
  if (residue.length) throw new Error(`${tag}: 置換の後に残っている形 ${residue.join(", ")}`);
  if (/<tmp>|<session-id>|<home>|<user>/.test(text)) throw new Error(`${tag}: 作業ディレクトリかセッション ID の置換が残っている`);
  writeFileSync(join(here, "fixtures", `${id}.json`), text);
  console.log(`fixtures/${id}.json（${Buffer.byteLength(text)} B、tool ${fixture.tools.length} 件）`);
}
