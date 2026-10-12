// redact.mjs
// 保存・表示する抜粋に通す置換と、置換後の検査。
//   1. 一時ディレクトリ、ホーム、ユーザー名、セッション ID の置換（summarize-run.mjs と同じ考え方）
//   2. 追加の置換: sk-ant- で始まる文字列、Bearer に続く文字列、メールアドレスの形、eyJ で始まる長い文字列
//   3. scanResidue(): 置換後にこれらの形が残っていないかを調べる（残っている「種類」だけを返し、値は返さない）
import { homedir, tmpdir, userInfo } from "node:os";

export function buildRedactor() {
  const pairs = [];
  const add = (value, label) => {
    if (typeof value === "string" && value.length >= 3) {
      pairs.push([value, label]);
      pairs.push([value.replace(/\\/g, "/"), label]);
      pairs.push([value.replace(/\\/g, "\\\\"), label]);
    }
  };
  add(tmpdir(), "<tmp>");
  add(homedir(), "<home>");
  let name = "";
  try {
    name = userInfo().username;
  } catch {
    // 取れなければ飛ばす
  }
  add(name, "<user>");
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let s = String(text);
    for (const [from, to] of pairs) s = s.split(from).join(to);
    s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<session-id>");
    s = s.replace(/sk-ant-[A-Za-z0-9_-]*/g, "<api-key>");
    s = s.replace(/Bearer\s+[^\s"',;]+/gi, "Bearer <token>");
    s = s.replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)*/g, "<jwt>");
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
    return s;
  };
}

// 置換後の文字列に、まだ残っていてはいけない形。見つかった種類の名前だけを返す。
export function scanResidue(text) {
  const s = String(text);
  const found = [];
  if (/sk-ant-/i.test(s)) found.push("sk-ant-");
  if (/Bearer\s+(?!<token>)\S/i.test(s)) found.push("Bearer");
  if (/eyJ[A-Za-z0-9_-]{8,}/.test(s)) found.push("eyJ");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) found.push("email");
  return found;
}
