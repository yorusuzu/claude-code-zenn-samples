#!/usr/bin/env node
// check-publish-count.mjs -- 直近 N 時間に公開した Zenn の記事を数える（依存なし。Node v24 で確認）
// 使い方: node check-publish-count.mjs [--repo <dir>] [--hours <n>] [--limit <n>] [--now <ISO8601>]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---- 引数 ----
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const repo = opt("--repo", process.cwd());
const hours = Number(opt("--hours", "24"));
const limit = Number(opt("--limit", "1"));
const now = new Date(opt("--now", new Date().toISOString()));
if (!(hours > 0) || !(limit >= 1) || Number.isNaN(now.getTime())) {
  console.error("引数が正しくありません（--hours と --limit は正の数、--now は ISO 8601 の日時）");
  process.exit(2);
}
const from = new Date(now.getTime() - hours * 3600 * 1000);

// ---- 小さな道具 ----
// stdio を指定して、git の警告（LF will be replaced by CRLF など）を画面に混ぜない
const git = (a) =>
  execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const show = (rev, path) => { try { return git(["show", `${rev}:${path}`]); } catch { return ""; } };
const isPublished = (text) => {
  const fm = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(fm && /^published:\s*true\s*$/m.test(fm[1]));
};
const isArticle = (p) => /^articles\/[^/]+\.md$/.test(p);
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => {
  const o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    ` ${o >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`;
};

// ---- 窓の中で published が true になった記事を集める（同じ記事は 1 本。時刻は新しいほう）----
const found = new Map(); // slug -> { time, label }
const add = (path, time, label) => {
  const slug = path.slice("articles/".length, -".md".length);
  if (!found.has(slug) || time > found.get(slug).time) found.set(slug, { time, label });
};
try {
  // コミット済み: 今のブランチを first-parent でたどる（マージで入った記事は、マージの時刻で数える）
  const log = git(["log", "--first-parent", "-m", "--name-only", "--format=%x01%H %P%x09%cI", "--", "articles"]);
  for (const block of log.split("\x01").slice(1)) {
    const [head, ...files] = block.split("\n");
    const [ids, iso] = head.split("\t");
    const [hash, parent] = ids.split(" ");
    const time = new Date(iso);
    if (time <= from || time > now) continue;
    for (const f of files.filter(isArticle))
      if (isPublished(show(hash, f)) && !(parent && isPublished(show(parent, f)))) add(f, time, fmt(time));
  }
  // 未コミット: 変更したファイルと、まだ追跡していない新しいファイル
  const pending = [
    ...git(["diff", "HEAD", "--name-only", "--", "articles"]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard", "--", "articles"]).split("\n"),
  ];
  for (const f of pending.filter(isArticle)) {
    const p = join(repo, f);
    if (existsSync(p) && isPublished(readFileSync(p, "utf8")) && !isPublished(show("HEAD", f))) add(f, now, "未コミット");
  }
} catch (e) {
  console.error(`git の履歴を読めませんでした: ${String(e.stderr || e.message).trim().split("\n")[0]}`);
  process.exit(2);
}
// 今の作業ツリーで published: true でなくなった記事（false に戻した、削除した）は数えない
for (const slug of [...found.keys()]) {
  const p = join(repo, "articles", `${slug}.md`);
  if (!existsSync(p) || !isPublished(readFileSync(p, "utf8"))) found.delete(slug);
}

// ---- 出力 ----
const list = [...found].sort((a, b) => a[1].time - b[1].time);
console.log(`直近 ${hours} 時間（${fmt(from)} から ${fmt(now)} まで）に公開した記事: ${list.length} 本`);
for (const [slug, v] of list) console.log(`  - ${slug}（${v.label}）`);
if (list.length < limit) {
  console.log(`OK: 運用値（${hours} 時間に ${limit} 本）まで、あと ${limit - list.length} 本です`);
  process.exit(0);
}
// 件数が運用値を下回る（古い公開が窓から外れる）時刻
const next = new Date(list[list.length - limit][1].time.getTime() + hours * 3600 * 1000);
if (list.length > limit) console.log(`NG: 運用値（${hours} 時間に ${limit} 本）を ${list.length - limit} 本超えています`);
else console.log(`NG: もう 1 本公開すると、運用値（${hours} 時間に ${limit} 本）を超えます`);
console.log(`次に push してよい目安: ${fmt(next)} 以降`);
process.exit(1);
