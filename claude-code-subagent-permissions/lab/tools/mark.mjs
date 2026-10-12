#!/usr/bin/env node
// mark.mjs（実行 X-1 用）
// `node mark.mjs <proj|local|cli|none>` で、zones/x-<名前>/bash-mark.txt を書く。
// Claude Code から見ると「node を実行する Bash」で、書き込み先のパスはコマンドに現れない。
// そのため、書けたかどうかは Bash(...) の許可だけで決まり、Edit(...) の許可は関係しない。
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ZONE = { proj: "x-proj", local: "x-local", cli: "x-cli", none: "x-none" };
const name = process.argv[2];
if (!ZONE[name]) {
  console.error("使い方: node mark.mjs <proj|local|cli|none>");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "zones", ZONE[name], "bash-mark.txt"), `bash-${name}\n`);
console.log(`MARKED zones/${ZONE[name]}/bash-mark.txt`);
