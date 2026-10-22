// check-fixtures.mjs
// fixtures/ に保存した出力（伏せ字済み）を読み、ケースごとの期待と突き合わせる。
//   1. `claude doctor` の標準出力（<ID>.stdout.txt）… 「Invalid settings」節の有無と各項目の文言（EXPECT）
//   2. D 群の最小の JSON（<ID>.json。make-d-fixture.mjs で作る）… ツールごとの is_error、目印（合言葉・42）、
//      判定（通過 / 拒否）、拒否のときの本文、置いた設定（EXPECT_D）
// 1 件でも食い違えば終了コード 1、すべて一致すれば 0。
//
// 使い方: node check-fixtures.mjs
// 依存: Node.js 18 以降の標準モジュールと、同じディレクトリの extract-warnings.mjs だけ。
// claude は起動しない（保存済みの出力を読むだけ）。
//
// 期待値は Claude Code 2.1.293（Windows 11）の実測（VERIFIED.md の E3・E4・E5）。
// 版が変わると文言が変わることがある。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoctor } from "./extract-warnings.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures");
const VERSION = "2.1.293";

// 伏せ字後のパス（<work> は作業ディレクトリ、<case> はケースごとの作業フォルダ）
const PROJECT = String.raw`<work>\cwd\<case>\.claude\settings.json`;
const LOCAL = String.raw`<work>\cwd\<case>\.claude\settings.local.json`;
const USER = String.raw`<work>\cfg\<case>\settings.json`;

// 文言の部品（2.1.293 の doctor が出したもの）
const MALFORMED =
  'Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal';
const skipped = (file, list, rule, reason) =>
  `${file} › permissions.${list}: Invalid permission rule "${rule}" was skipped: ${reason}`;

// invalid: null は「Invalid settings 節がない」、配列は節の項目（順番どおり・完全一致）
const EXPECT = {
  // E3（M 群。M3b・M7a は doctor ではないので対象外）
  M2a: { invalid: [skipped(PROJECT, "deny", "Bash(npm run *", MALFORMED)] },
  M2b: { invalid: null },

  // E4（W 群。すべて `claude doctor`、CLAUDE_CONFIG_DIR は隔離）
  W01: { rule: "V0 Bash(npm run *)", invalid: null },
  W03: { rule: "B1 Bash(npm run *", invalid: [skipped(PROJECT, "deny", "Bash(npm run *", MALFORMED)] },
  W04: {
    rule: "B2 Bash()",
    invalid: [skipped(PROJECT, "deny", "Bash()", 'Empty parentheses. Either specify a pattern or use just "Bash" without parentheses')],
  },
  W05: {
    rule: "B3 bash(npm run *)",
    invalid: [skipped(PROJECT, "deny", "bash(npm run *)", 'Tool names must start with uppercase. Use "Bash"')],
  },
  W06: { rule: "B4 Bsah(npm run *)", invalid: null },
  W07: { rule: "B5 Bash(npm run:* test)", invalid: null },
  W08: { rule: "B6 全角括弧", invalid: null },
  W09: { rule: 'B7 ""', invalid: [skipped(PROJECT, "deny", "", "Permission rule cannot be empty")] },
  W10: { rule: "B8 Bash(npm run *))", invalid: null },
  W11: {
    rule: "B9 mcp__srv__tool(arg)",
    invalid: [
      skipped(
        PROJECT,
        "deny",
        "mcp__srv__tool(arg)",
        'MCP rules do not support patterns in parentheses. Use "mcp__srv__tool" without parentheses, or use "mcp__srv__*" for all tools',
      ),
    ],
  },
  W16: { rule: "B1（local）", invalid: [skipped(LOCAL, "deny", "Bash(npm run *", MALFORMED)] },
  W19: { rule: "B1（user）", invalid: [skipped(USER, "deny", "Bash(npm run *", MALFORMED)] },
  W22: {
    rule: "B1 + B3",
    invalid: [
      skipped(PROJECT, "deny", "Bash(npm run *", MALFORMED),
      skipped(PROJECT, "deny", "bash(npm run *)", 'Tool names must start with uppercase. Use "Bash"'),
    ],
  },
  W23: { rule: "B1 + V0", invalid: [skipped(PROJECT, "deny", "Bash(npm run *", MALFORMED)] },
  W24: {
    rule: "deny が文字列",
    invalid: [
      `${PROJECT} › permissions.deny: Expected array, but received string\n` +
        '  Suggested fix: Permission rules must be in an array. Format: ["Tool(specifier)"]. Examples: ["Bash(npm run build)", "Edit(docs/**)", "Read(~/.zshrc)"]. Use * for wildcards.',
    ],
  },
  W25: { rule: "JSON の末尾カンマ", invalid: [`${PROJECT}: Invalid or malformed JSON`] },
  W26: { rule: "B10 Bash(ls) x", invalid: [skipped(PROJECT, "deny", "Bash(ls) x", MALFORMED)] },
};

// D 群（E5。claude -p、haiku、--setting-sources project,local）
//   tools: ツールの呼び出しごとの [ツール名, 判定, 目印, 拒否のときの本文]。
//   判定は tool_result から決める（モデルの返答は見ない）:
//     通過 … is_error が false で、目印が本文に入っている
//     拒否 … is_error が true で、目印が本文に入っていない
//   settings: 置いた設定（cases.json と rules.json から組み立てたものと同じであること）
const DENIED_FILE = "<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>";
const ASK_READ = String.raw`Claude requested permissions to read from <work>\cwd\<case>\zone\secret-a.txt, but you haven't granted it yet.`;
const EXPECT_D = {
  D01: { rule: "設定なし（陽性対照）", tools: [["Read", "通過", ["a"]]] },
  D02: { rule: "project deny RV-a（有効）", tools: [["Read", "拒否", [], DENIED_FILE]] },
  D03: { rule: "project deny RB1-a（閉じ忘れ）", tools: [["Read", "通過", ["a"]]] },
  D05: { rule: "project deny RB4-a（綴り違い）", tools: [["Read", "通過", ["a"]]] },
  D06: { rule: "project deny RB6-a（全角括弧）", tools: [["Read", "通過", ["a"]]] },
  D07: { rule: "project deny RB1-a + RV-b", tools: [["Read", "通過", ["a"]], ["Read", "拒否", [], DENIED_FILE]] },
  D08: { rule: "project deny XB5 + RV-b", tools: [["Read", "拒否", [], DENIED_FILE]] },
  D10: { rule: "project deny XB1（Bash の閉じ忘れ）+ --allowedTools", tools: [["Bash", "通過", ["42"]]] },
  D14: { rule: "project ask RV-a（有効）", tools: [["Read", "拒否", [], ASK_READ]] },
  D16: { rule: "local allow XB1（Bash の閉じ忘れ）", tools: [["Bash", "拒否", [], "This command requires approval"]] },
  D17: { rule: "project deny RB10-c（閉じ括弧の後ろに文字）", tools: [["Read", "通過", ["c"]]] },
  D18: { rule: "project deny RB8-a（余分な閉じ括弧）", tools: [["Read", "通過", ["a"]]] },
  D19: { rule: "project が壊れた JSON（有効な deny RV-a）", tools: [["Read", "通過", ["a"]]] },
};

const show = (v) => (v === null ? "（節なし）" : JSON.stringify(v));
let ng = 0;
const fail = (id, msg) => {
  ng++;
  console.log(`NG ${id}: ${msg}`);
};

for (const [id, exp] of Object.entries(EXPECT)) {
  const path = join(FIX, `${id}.stdout.txt`);
  if (!existsSync(path)) {
    fail(id, `${path} がない`);
    continue;
  }
  const d = parseDoctor(readFileSync(path, "utf8"));
  if (!d) {
    fail(id, "doctor の出力ではない（先頭の「Claude Code doctor」がない）");
    continue;
  }
  const before = ng;
  if (d.version !== VERSION) fail(id, `版が ${d.version}（期待 ${VERSION}）`);

  const got = d.invalidSettings;
  if ((got === null) !== (exp.invalid === null)) {
    fail(id, `Invalid settings 節: 実際 ${got === null ? "なし" : "あり"}、期待 ${exp.invalid === null ? "なし" : "あり"}`);
  } else if (got !== null) {
    if (got.length !== exp.invalid.length) fail(id, `項目数: 実際 ${got.length}、期待 ${exp.invalid.length}`);
    exp.invalid.forEach((e, i) => {
      if (got[i] !== e) fail(id, `項目 ${i + 1}\n  実際: ${show(got[i] ?? null)}\n  期待: ${show(e)}`);
    });
  }
  // Invalid settings の項目は「N warnings found」の数に入らない（E3・E4 の実測）
  if (d.warningItems.some((t) => /Invalid permission rule|Invalid settings/.test(t)))
    fail(id, "warnings found の項目に Invalid settings の内容が混ざっている");

  // 対応する stderr の fixture があれば 0 バイトのはず
  const errPath = join(FIX, `${id}.stderr.txt`);
  if (existsSync(errPath) && readFileSync(errPath).length !== 0) fail(id, "stderr の fixture が空ではない");

  if (ng === before) {
    const n = got === null ? "節なし" : `${got.length} 項目`;
    console.log(`OK ${id}${exp.rule ? `（${exp.rule}）` : ""}: ${n}`);
  }
}

// D 群
const defs = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")).cases;
const rules = JSON.parse(readFileSync(join(HERE, "rules.json"), "utf8")).rules;
const expand = (v) =>
  typeof v === "string" && v.startsWith("$") && rules[v.slice(1)]
    ? rules[v.slice(1)].rule
    : Array.isArray(v)
      ? v.map(expand)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]))
        : v;
const verdictOf = (t) => (!t.isError && t.markers.length > 0 ? "通過" : t.isError === true && t.markers.length === 0 ? "拒否" : "判定不能");

for (const [id, exp] of Object.entries(EXPECT_D)) {
  const path = join(FIX, `${id}.json`);
  if (!existsSync(path)) {
    fail(id, `${path} がない`);
    continue;
  }
  const f = JSON.parse(readFileSync(path, "utf8"));
  const before = ng;
  if (f.version !== VERSION) fail(id, `版が ${f.version}（期待 ${VERSION}）`);
  if (f.exitCode !== 0) fail(id, `終了コードが ${f.exitCode}（期待 0）`);
  if (f.stderrBytes !== 0) fail(id, `標準エラー出力が ${f.stderrBytes} バイト（期待 0）`);
  const def = defs.find((c) => c.id === id);
  if (!def) fail(id, "cases.json にない");
  else if (JSON.stringify(f.settings) !== JSON.stringify(expand(def.settings) ?? null))
    fail(id, `置いた設定が cases.json と違う
  実際: ${JSON.stringify(f.settings)}
  期待: ${JSON.stringify(expand(def.settings))}`);
  if (f.tools.length !== exp.tools.length) fail(id, `ツールの呼び出し: 実際 ${f.tools.length} 回、期待 ${exp.tools.length} 回`);
  exp.tools.forEach(([name, verdict, markers, head], i) => {
    const t = f.tools[i];
    if (!t) return;
    const got = verdictOf(t);
    if (t.name !== name) fail(id, `呼び出し ${i + 1} のツール: 実際 ${t.name}、期待 ${name}`);
    if (got !== verdict) fail(id, `呼び出し ${i + 1} の判定: 実際 ${got}（is_error ${t.isError}、目印 [${t.markers}]）、期待 ${verdict}`);
    if (JSON.stringify(t.markers) !== JSON.stringify(markers)) fail(id, `呼び出し ${i + 1} の目印: 実際 [${t.markers}]、期待 [${markers}]`);
    if (head !== undefined && t.head !== head) fail(id, `呼び出し ${i + 1} の本文
  実際: ${show(t.head)}
  期待: ${show(head)}`);
  });
  if (ng === before) console.log(`OK ${id}（${exp.rule}）: ${f.tools.map((t) => `${t.name} ${verdictOf(t)}`).join("、")}`);
}

const total = Object.keys(EXPECT).length + Object.keys(EXPECT_D).length;
if (ng) {
  console.log(`\n食い違い ${ng} 件（${total} 件中）`);
  process.exit(1);
}
console.log(`\nすべて一致（${total} 件）`);
