#!/usr/bin/env node
// check-fixtures.mjs
// fixtures/ の各ディレクトリ（stdout.jsonl と hook.jsonl）を extract-spawn.mjs に通し、
// fixtures/expected.json の値と部分一致で比べる。モデルは呼ばない。依存なし。
//   node check-fixtures.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNoSubagentType, extractSpawn } from "./extract-spawn.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, "fixtures", "expected.json"), "utf8"));
const token = readFileSync(join(here, "lab", "fixtures", "token.txt"), "utf8").trim();

// expect の各キーが actual に同じ値で含まれるか（配列は同じ長さで、要素ごとに部分一致）
function matches(actual, expect, path, errors) {
  if (Array.isArray(expect)) {
    if (!Array.isArray(actual) || actual.length !== expect.length) {
      errors.push(`${path}: 長さ ${Array.isArray(actual) ? actual.length : "（配列でない）"}、期待 ${expect.length}`);
      return;
    }
    expect.forEach((v, i) => matches(actual[i], v, `${path}[${i}]`, errors));
  } else if (expect && typeof expect === "object") {
    for (const [k, v] of Object.entries(expect)) matches(actual?.[k], v, `${path}.${k}`, errors);
  } else if (actual !== expect) {
    errors.push(`${path}: ${JSON.stringify(actual)}、期待 ${JSON.stringify(expect)}`);
  }
}

let failed = 0;
for (const [name, expect] of Object.entries(expected)) {
  if (name.startsWith("_")) continue;
  const dir = join(here, "fixtures", name);
  const hookFile = join(dir, "hook.jsonl");
  const x = extractSpawn({
    stdout: readFileSync(join(dir, "stdout.jsonl"), "utf8"),
    hookLog: existsSync(hookFile) ? readFileSync(hookFile, "utf8") : "",
    token,
  });
  const errors = [];
  matches({ ...x, noSubagentType: checkNoSubagentType(x) }, expect, name, errors);
  console.log(`${errors.length ? "NG" : "OK"} ${name}${errors.length ? `\n  ${errors.join("\n  ")}` : ""}`);
  if (errors.length) failed++;
}
process.exit(failed ? 1 : 0);
