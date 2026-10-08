#!/usr/bin/env node
// check-zones.mjs
// zone（<dir>/zones/<名前>/）ごとに、ファイルが実際にできたかを表示する。これが「正解の根拠」の第 1 位。
// --run a1|a2 を付けると、公式ドキュメントや公開済みの記述から見込まれる結果（期待）と並べて表示する。
//   期待 "あり" / "なし" / "不明"（公式に記載がない、または版による）
// 使い方: node check-zones.mjs <検証用ディレクトリ> [--run a1|a2] [--json]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// [zone, ファイル名, 期待, ケース, 説明]
const EXPECT = {
  a1: [
    ["a0-allow", "parent.txt", "あり", "P1", "親が許可した zone に直接書ける（親の対照）"],
    ["a0-allow", "sub-t-allow.txt", "あり", "A-0", "t-allow が書ける（陽性対照）"],
    ["a1-readonly", "sub-t-readonly.txt", "なし", "A-1", "tools に Write がない"],
    ["a2-disallow", "sub-t-disallow-write.txt", "なし", "A-2", "disallowedTools: Write"],
    ["a2-disallow", "sub-t-disallow-inherit.txt", "なし", "A-2'", "tools 省略 + disallowedTools: Write, Edit"],
    ["a3-deny", "parent.txt", "なし", "P2", "親が deny に当たる（deny 構文の対照）"],
    ["a3-deny", "sub-t-allow.txt", "なし", "A-3", "settings の Edit(...) deny がサブエージェントにも届く"],
    ["a3-deny", "sub-t-bash.txt", "なし", "A-7b", "Edit deny は Bash のリダイレクトにも届く（公式）"],
    ["a3w-deny", "parent.txt", "あり", "P3", "Write(...) の deny は参照されない（公式 v2.1.210 以降）ので親は書ける"],
    ["a3w-deny", "sub-t-allow.txt", "あり", "A-3w", "Write(...) の deny はサブエージェントにも効かない（同上）"],
    ["a4-cli", "parent.txt", "なし", "P4", "親が CLI の --disallowedTools に当たる（構文の対照）"],
    ["a4-cli", "sub-t-allow.txt", "なし", "A-4", "CLI の --disallowedTools がサブエージェントにも届く"],
    ["a5-plan", "sub-t-plan.txt", "あり", "A-5(acceptEdits)", "親が acceptEdits なら permissionMode: plan は無視される"],
    ["a6-nest", "echo-control.txt", "あり", "A-6(陽性対照)", "tools に Agent を含む t-control が t-echo を呼べる"],
    ["a6-nest", "echo-nest.txt", "なし", "A-6", "disallowedTools: Agent では呼べない"],
    ["a6-nest", "echo-nestb.txt", "なし", "A-6b", "tools の許可リストに Agent がなければ呼べない"],
    ["a6-nest", "echo-inherit.txt", "不明", "A-6d", "tools 省略（全継承）の定義が孫を呼べるか（公式の記述からは断定できない）"],
    ["a7-bash", "sub-t-bash.txt", "あり", "A-7", "Write・Edit がなくても Bash のリダイレクトで書ける（記事③）"],
    ["a8-hook", "parent.txt", "なし", "P5", "PreToolUse hook（exit 2）が親に効く（構文の対照）"],
    ["a8-hook", "sub-t-allow.txt", "なし", "hook", "PreToolUse hook がサブエージェントにも効く"],
  ],
  a2: [
    ["a0-allow", "parent.txt", "あり", "P1", "CLI の許可で親が書ける"],
    ["a0-allow", "sub-t-allow.txt", "あり", "A-0", "default でも許可した zone には書ける（陽性対照）"],
    ["a5b-noallow", "parent.txt", "なし", "P2", "許可がなければ default の -p では書けない（親のベースライン）"],
    ["a5b-noallow", "sub-t-allow.txt", "なし", "A-5 基準", "許可がなければサブエージェントも書けない"],
    ["a5-plan", "sub-t-plan.txt", "なし", "A-5(default)", "default の親では permissionMode: plan が効く（許可があるのに書けない）"],
    ["a6-nest", "echo-direct.txt", "あり", "A-6 陽性対照 1", "親が t-echo を直接呼べば書ける（許可と t-echo 自体の確認）"],
    ["a6-nest", "echo-control.txt", "あり", "A-6 陽性対照 2", "tools に Agent を含めた定義は孫を呼べる（公式: v2.1.219 以降は既定で 3 階層）"],
    ["a6-nest", "echo-inherit.txt", "不明", "A-6d", "tools 省略の定義が孫を呼べるか"],
    ["a6-nest", "echo-nest.txt", "なし", "A-6", "disallowedTools: Agent の定義は孫を呼べない"],
    ["a6-nest", "echo-nestb.txt", "なし", "A-6b", "tools の許可リストに Agent がない定義は孫を呼べない"],
    ["a7-bash", "sub-t-bash.txt", "あり", "A-7 default", "Edit 許可があれば Bash のリダイレクトで書ける（相対パス・スラッシュ）"],
    ["a7-bash", "sub-t-bash-bs.txt", "不明", "A-7 円記号", "絶対パス・円記号区切りでも書けるか（A-7b の拒否の原因切り分け）"],
    ["a7n-bash", "sub-t-bash.txt", "不明", "A-7 許可なし", "Edit 許可がなく Bash(echo *) だけのときのリダイレクト"],
    ["a9-projallow", "parent.txt", "なし", "A-9b", "未信頼フォルダの -p ではプロジェクト settings の allow は使われない（公式）"],
    ["a9-projallow", "sub-t-allow.txt", "なし", "A-9b", "同上（サブエージェント）"],
  ],
};

function parseArgs(argv) {
  const out = { dir: null, run: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") out.run = argv[++i];
    else if (argv[i] === "--json") out.json = true;
    else if (!out.dir) out.dir = argv[i];
    else throw new Error(`知らない引数: ${argv[i]}`);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) throw new Error("使い方: node check-zones.mjs <検証用ディレクトリ> [--run a1|a2] [--json]");
  if (args.run && !EXPECT[args.run]) throw new Error("--run には a1 か a2 を指定してください");
  const root = resolve(args.dir);
  const zonesDir = join(root, "zones");
  if (!existsSync(zonesDir)) throw new Error("zones/ が見つかりません");

  if (args.run && !existsSync(join(root, `run-${args.run}.jsonl`))) {
    console.error(`警告: run-${args.run}.jsonl がありません。実行前の zone だと、期待 "なし" がすべて「一致」と表示されますが、意味はありません。
`);
  }
  const found = new Map(); // "zone/file" -> {size, content}
  const zoneNames = readdirSync(zonesDir).filter((n) => statSync(join(zonesDir, n)).isDirectory()).sort();
  for (const z of zoneNames) {
    for (const f of readdirSync(join(zonesDir, z))) {
      if (f === ".keep") continue;
      const p = join(zonesDir, z, f);
      const st = statSync(p);
      found.set(`${z}/${f}`, { size: st.size, text: st.isFile() ? readFileSync(p, "utf8").trim().slice(0, 80) : "(ディレクトリ)" });
    }
  }

  const rows = [];
  const expected = args.run ? EXPECT[args.run] : [];
  const seen = new Set();
  for (const [zone, file, exp, kase, note] of expected) {
    const key = `${zone}/${file}`;
    seen.add(key);
    const hit = found.get(key);
    const actual = hit ? "あり" : "なし";
    const verdict = exp === "不明" ? "(期待なし)" : actual === exp ? "一致" : "食い違い";
    rows.push({ case: kase, path: key, expected: exp, actual, verdict, content: hit?.text ?? "", note });
  }
  for (const [key, hit] of found) {
    if (!seen.has(key)) rows.push({ case: "-", path: key, expected: "-", actual: "あり", verdict: "(想定外のファイル)", content: hit.text, note: "" });
  }

  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(`zones: ${zoneNames.join(", ") || "(なし)"}`);
  console.log("");
  console.log("| ケース | ファイル | 期待 | 実際 | 判定 | 内容 |");
  console.log("|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(`| ${r.case} | zones/${r.path} | ${r.expected} | ${r.actual} | ${r.verdict} | ${r.content.replace(/\|/g, "\\|")} |`);
  }
  if (!args.run) {
    console.log("");
    console.log("(--run を付けると、期待と並べて表示します)");
  }
}

try {
  main();
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
