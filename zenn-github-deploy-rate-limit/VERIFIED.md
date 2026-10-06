# 動作確認の記録

確認日: 2026-10-04

## 環境

| 項目 | バージョン |
|---|---|
| OS | Windows 11 Home（Microsoft Windows 10.0.26200） |
| Node.js | v24.18.0 |
| git | 2.54.0.windows.1（`core.autocrlf=true` の既定の設定） |
| シェル | Git Bash（`bash --version` の表示は 5.3.9(1)-release）、Windows PowerShell 5.1 |
| タイムゾーン | +09:00（日本時間） |

確認したスクリプトは、このフォルダの `check-publish-count.mjs`（91 行）です。記事に載せる全文は、このファイルと一致させます。

## ケース A〜G と補足ケース（使い捨てのリポジトリ）

### 手順

次の `cases.sh` を、`check-publish-count.mjs` と同じフォルダに置き、空の作業フォルダ（`<tmp>/work`）で `bash ../cases.sh` と実行しました。
ケースごとに、`demo-<ケース名>/` の下に新しいリポジトリを作ります。

- 作成者はダミー（`demo` / `demo@example.com`）です。
- コミットの日時は `GIT_AUTHOR_DATE` と `GIT_COMMITTER_DATE` で指定し、「今」は `--now 2026-10-03T12:00:00+09:00` で固定しています。
- 最初のコミット（`published: false` の記事 2 本）は 2026-09-28 です。
- `fresh` の中の `git add` が、`LF will be replaced by CRLF` の警告を標準エラー出力に出します。下の出力は標準出力だけを載せています（警告はスクリプトの出力ではありません）。

```sh
# cases.sh -- check-publish-count.mjs のケース A〜G と補足ケース I〜L（使い捨てのリポジトリで実行）
# 使い方: check-publish-count.mjs と同じフォルダに置き、空の作業フォルダで bash <このファイル> と実行する
S="$(cd "$(dirname "$0")" && pwd)/check-publish-count.mjs"
NOW=2026-10-03T12:00:00+09:00
W="$PWD"
g() { git -c user.name=demo -c user.email=demo@example.com "$@"; }
commit() { git add -A && GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" g commit -qm "$2"; }
mk() { printf -- '---\ntitle: "%s"\nemoji: "📝"\ntype: "tech"\ntopics: []\npublished: false\n---\n\n本文\n' "$1" > "articles/$1.md"; }
pub() { sed -i 's/^published: false/published: true/' "articles/$1.md"; }
unpub() { sed -i 's/^published: true/published: false/' "articles/$1.md"; }
fresh() {
  cd "$W" && rm -rf "demo-$1" && mkdir "demo-$1" && cd "demo-$1" && git init -q -b main && mkdir articles
  mk first-article; mk second-article; commit 2026-09-28T09:00:00+09:00 init
}
run() { node "$S" --now "$NOW" "$@" 2>&1; echo "exit=$?"; }

echo "## A: 公開 0 本"; fresh A; run
echo "## B: 2 時間前に 1 本公開"; fresh B; pub first-article; commit 2026-10-03T10:00:00+09:00 b; run
echo "## C: 同じコミットで 2 本公開"; fresh C; pub first-article; pub second-article; commit 2026-10-03T10:00:00+09:00 c; run
echo "## C2: 4 時間前と 2 時間前に 1 本ずつ公開"; fresh C2; pub first-article; commit 2026-10-03T08:00:00+09:00 c1; pub second-article; commit 2026-10-03T10:00:00+09:00 c2; run
echo "## D: 25 時間前に公開"; fresh D; pub first-article; commit 2026-10-02T11:00:00+09:00 d; run
echo "## E: 未コミットで published: true に変更"; fresh E; pub first-article; run
echo "## E2: E と同じ状態で --limit 2"; run --limit 2
echo "## F: 公開後に published: false へ戻した"; fresh F; pub first-article; commit 2026-10-03T09:00:00+09:00 f1; unpub first-article; commit 2026-10-03T10:00:00+09:00 f2; run
echo "## G: 24 時間 1 分前と 23 時間 59 分前"; fresh G
pub second-article; commit 2026-10-02T11:59:00+09:00 g1; pub first-article; commit 2026-10-02T12:01:00+09:00 g2; run
echo "## G2: G と同じリポジトリで、--now を 1 分進める（ちょうど 24 時間前）"; node "$S" --now 2026-10-03T12:01:00+09:00; echo "exit=$?"
echo "## I: 同じ記事を窓の中で 2 回 true にした"; fresh I
pub first-article; commit 2026-10-03T08:00:00+09:00 i1; unpub first-article; commit 2026-10-03T09:00:00+09:00 i2
pub first-article; commit 2026-10-03T10:00:00+09:00 i3; run
echo "## J: 2 日前のブランチのコミットを、2 時間前にマージした"; fresh J
git checkout -q -b feature; pub first-article; commit 2026-10-01T10:00:00+09:00 j1; git checkout -q main
GIT_AUTHOR_DATE=2026-10-03T10:00:00+09:00 GIT_COMMITTER_DATE=2026-10-03T10:00:00+09:00 g merge -q --no-ff -m merge feature; run
echo "## K: 本文のコードブロックにだけ published: true の行がある"; fresh K
printf '\n```yaml\npublished: true\n```\n' >> articles/first-article.md; commit 2026-10-03T10:00:00+09:00 k; run
echo "## L: git のリポジトリではないフォルダ"; cd "$W" && rm -rf not-a-repo && mkdir not-a-repo; run --repo not-a-repo
echo "## L2: --now の書式が誤り"; node "$S" --now yesterday 2>&1; echo "exit=$?"
```

### 出力（そのまま）

```text
## A: 公開 0 本
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## B: 2 時間前に 1 本公開
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（2026-10-03 10:00:00 +09:00）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
## C: 同じコミットで 2 本公開
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 2 本
  - first-article（2026-10-03 10:00:00 +09:00）
  - second-article（2026-10-03 10:00:00 +09:00）
NG: 運用値（24 時間に 1 本）を 1 本超えています
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
## C2: 4 時間前と 2 時間前に 1 本ずつ公開
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 2 本
  - first-article（2026-10-03 08:00:00 +09:00）
  - second-article（2026-10-03 10:00:00 +09:00）
NG: 運用値（24 時間に 1 本）を 1 本超えています
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
## D: 25 時間前に公開
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## E: 未コミットで published: true に変更
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（未コミット）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 12:00:00 +09:00 以降
exit=1
## E2: E と同じ状態で --limit 2
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（未コミット）
OK: 運用値（24 時間に 2 本）まで、あと 1 本です
exit=0
## F: 公開後に published: false へ戻した
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## G: 24 時間 1 分前と 23 時間 59 分前
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（2026-10-02 12:01:00 +09:00）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-03 12:01:00 +09:00 以降
exit=1
## G2: G と同じリポジトリで、--now を 1 分進める（ちょうど 24 時間前）
直近 24 時間（2026-10-02 12:01:00 +09:00 から 2026-10-03 12:01:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## I: 同じ記事を窓の中で 2 回 true にした
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（2026-10-03 10:00:00 +09:00）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
## J: 2 日前のブランチのコミットを、2 時間前にマージした
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（2026-10-03 10:00:00 +09:00）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
## K: 本文のコードブロックにだけ published: true の行がある
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## L: git のリポジトリではないフォルダ
git の履歴を読めませんでした: fatal: not a git repository (or any of the parent directories): .git
exit=2
## L2: --now の書式が誤り
引数が正しくありません（--hours と --limit は正の数、--now は ISO 8601 の日時）
exit=2
```

### 結果の判定

| ケース | 内容 | 期待 | 結果 |
|---|---|---|---|
| A | 公開 0 本 | 0 本、終了コード 0 | 期待どおり |
| B | 2 時間前に 1 本公開 | 1 本、終了コード 1、目安が 22 時間後（2026-10-04 10:00） | 期待どおり |
| C | 同じコミットで 2 本公開 | 2 本、終了コード 1 | 期待どおり |
| C2（補足） | 4 時間前と 2 時間前に 1 本ずつ | 2 本、終了コード 1、目安は新しいほうの 24 時間後（2026-10-04 10:00） | 期待どおり |
| D | 25 時間前に公開 | 0 本、終了コード 0 | 期待どおり |
| E | 未コミットで `published: true` に変更 | 数える（1 本、「未コミット」） | 期待どおり |
| E2（補足） | E と同じ状態で `--limit 2` | 1 本、終了コード 0 | 期待どおり |
| F | 公開後に `published: false` へ戻した | 数えない（0 本） | 期待どおり |
| G | 24 時間 1 分前と 23 時間 59 分前 | 23 時間 59 分前の 1 本だけ数える | 期待どおり |
| G2（補足） | G と同じリポジトリで、ちょうど 24 時間前になる `--now` | 数えない（0 本） | 期待どおり |
| I（補足） | 同じ記事を窓の中で 2 回 `true` にした | 1 本、時刻は新しいほう | 期待どおり |
| J（補足） | 2 日前のブランチのコミットを 2 時間前にマージ | マージの時刻で 1 本 | 期待どおり |
| K（補足） | 本文のコードブロックにだけ `published: true` の行 | 数えない（0 本） | 期待どおり |
| L（補足） | git のリポジトリではないフォルダ | 終了コード 2 | 期待どおり |
| L2（補足） | `--now` の書式が誤り | 終了コード 2 | 期待どおり |
| M（補足） | コミットが 1 つもないリポジトリ | 終了コード 2 | 期待どおり（下の「補足ケース M・N」） |
| N（補足） | E のリポジトリで `core.autocrlf=false` | E と同じ結果 | 期待どおり（同上） |

### 補足ケース M・N

`cases.sh` を実行した後の `<tmp>/work` で、続けて実行しました。

```sh
mkdir empty-repo && git -C empty-repo init -q -b main && echo "## M: コミットが 1 つもないリポジトリ" && node ../check-publish-count.mjs --repo empty-repo --now 2026-10-03T12:00:00+09:00 2>&1; echo "exit=$?"
cd demo-E && git config core.autocrlf false && echo "## N: E のリポジトリで core.autocrlf=false" && node ../../check-publish-count.mjs --now 2026-10-03T12:00:00+09:00 2>&1; echo "exit=$?"
```

```text
## M: コミットが 1 つもないリポジトリ
git の履歴を読めませんでした: fatal: your current branch 'main' does not have any commits yet
exit=2
## N: E のリポジトリで core.autocrlf=false
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（未コミット）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 12:00:00 +09:00 以降
exit=1
```

## 標準エラー出力が混ざらないことの確認

ケース E のリポジトリ（未コミットの変更があり、`git diff HEAD` が警告を出す状態）で、スクリプトの標準エラー出力だけをファイルに取りました。

```sh
cd demo-E
node ../../check-publish-count.mjs --now 2026-10-03T12:00:00+09:00 >/dev/null 2>../../e.txt; echo "E stderr bytes: $(wc -c < ../../e.txt)"
```

```text
E stderr bytes: 0
```

比較のため、`git` を呼ぶ関数から `stdio: ["ignore", "pipe", "pipe"]` を消した版（`sed 's/, stdio: \["ignore", "pipe", "pipe"\]//' check-publish-count.mjs > nostdio.mjs` で作ったもの）を、同じリポジトリで同じ引数で実行すると、次の 1 行が標準エラー出力に出ました。リダイレクトせずに実行した場合は、この行が画面のスクリプトの出力の前に表示されました。

```text
warning: in the working copy of 'articles/first-article.md', LF will be replaced by CRLF the next time Git touches it
```

## PowerShell からの実行

Windows PowerShell 5.1 で、`<tmp>/work` から、ケース B・E・L のリポジトリに `--repo` を付けて実行しました。

```powershell
node ..\check-publish-count.mjs --repo demo-B --now 2026-10-03T12:00:00+09:00; "exit=$LASTEXITCODE"
node ..\check-publish-count.mjs --repo demo-E --now 2026-10-03T12:00:00+09:00 --limit 2; "exit=$LASTEXITCODE"
node ..\check-publish-count.mjs --repo not-a-repo; "exit=$LASTEXITCODE"
```

```text
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（2026-10-03 10:00:00 +09:00）
NG: もう 1 本公開すると、運用値（24 時間に 1 本）を超えます
次に push してよい目安: 2026-10-04 10:00:00 +09:00 以降
exit=1
直近 24 時間（2026-10-02 12:00:00 +09:00 から 2026-10-03 12:00:00 +09:00 まで）に公開した記事: 1 本
  - first-article（未コミット）
OK: 運用値（24 時間に 2 本）まで、あと 1 本です
exit=0
git の履歴を読めませんでした: fatal: not a git repository (or any of the parent directories): .git
exit=2
```

Git Bash の結果と同じでした（文字化けなし）。

## ケース H（筆者の Zenn 連携リポジトリの複製）

筆者が 2026-10-01 に記事 2 本を 1 つのコミットで公開し、1 本がデプロイされなかったときの状態を、事後に再現しました。
リポジトリを使い捨ての場所（`<tmp>/h-clone`）に `git clone` し、その公開のコミットを `git checkout` して実行しました。確認が終わった後、複製は削除しました。
コミットのハッシュは載せません（リポジトリが非公開で、読者が確かめられないため）。

### H: 公開のコミットの時点で、2026-10-01 13:30 に実行

`<tmp>` で次のように実行しました（`<リポジトリ>` は複製元のリポジトリ、`<公開のコミット>` はそのコミットのハッシュです）。

```sh
git clone -q <リポジトリ> h-clone && git -C h-clone checkout -q <公開のコミット>
node check-publish-count.mjs --repo h-clone --now 2026-10-01T13:30:00+09:00 2>&1; echo "exit=$?"
```

```text
直近 24 時間（2026-09-30 13:30:00 +09:00 から 2026-10-01 13:30:00 +09:00 まで）に公開した記事: 2 本
  - claude-code-how-many-subagents（2026-10-01 13:00:17 +09:00）
  - claude-code-zenn-github-publish（2026-10-01 13:00:17 +09:00）
NG: 運用値（24 時間に 1 本）を 1 本超えています
次に push してよい目安: 2026-10-02 13:00:17 +09:00 以降
exit=1
```

記事③（`claude-code-how-many-subagents`）と記事⑤（`claude-code-zenn-github-publish`）の 2 本が数えられました。期待どおりです。

### 補足 H0・H2: 公開のコミットの直前の状態で、2026-10-01 12:59 に実行

H0 は、公開のコミットの 1 つ前のコミットを checkout した状態です。
H2 は、その状態に、公開のコミットの 2 本のファイルだけを `git checkout <公開のコミット> -- <2 本のファイル>` で戻した状態（コミット前に 2 本を `published: true` にした状態の再現）です。

```sh
git -C h-clone checkout -q <公開のコミット>^
node check-publish-count.mjs --repo h-clone --now 2026-10-01T12:59:00+09:00 2>&1; echo "exit=$?"   # H0
git -C h-clone checkout -q <公開のコミット> -- articles/claude-code-how-many-subagents.md articles/claude-code-zenn-github-publish.md
node check-publish-count.mjs --repo h-clone --now 2026-10-01T12:59:00+09:00 2>&1; echo "exit=$?"   # H2
```

```text
## H0
直近 24 時間（2026-09-30 12:59:00 +09:00 から 2026-10-01 12:59:00 +09:00 まで）に公開した記事: 0 本
OK: 運用値（24 時間に 1 本）まで、あと 1 本です
exit=0
## H2
直近 24 時間（2026-09-30 12:59:00 +09:00 から 2026-10-01 12:59:00 +09:00 まで）に公開した記事: 2 本
  - claude-code-how-many-subagents（未コミット）
  - claude-code-zenn-github-publish（未コミット）
NG: 運用値（24 時間に 1 本）を 1 本超えています
次に push してよい目安: 2026-10-02 12:59:00 +09:00 以降
exit=1
```

これは事後の再現です。当時このスクリプトを実行していれば push を止められた、というのは推測です。

## 不具合の修正と再実行

- 最初の版では、件数が運用値を超えている場合（ケース C、H）にも「もう 1 本公開すると、運用値を超えます」と表示していました。すでに超えているときは「運用値を N 本超えています」と表示するように直し、上のケース（A〜L、PowerShell、H・H0・H2）をすべて再実行しました。上の出力は、直した後のものです。

## 確認していないこと

- macOS と Linux での動作（確認していない）
- Node.js v24 より前のバージョンでの動作（確認していない）
- git 2.54.0 より前のバージョンでの動作（確認していない）
- `core.autocrlf=false` の環境での動作（ケース N の 1 ケースだけ確認した。ほかのケースは確認していない）
- 日本時間以外のタイムゾーンでの表示（確認していない）
- `--repo` にリポジトリの直下以外（サブフォルダ）を指定した場合の動作（確認していない）
- コミット数が多い（数千以上の）リポジトリでの実行時間（確認していない）
- ファイル名に ASCII 以外の文字を含む記事（Zenn の slug の規則では使えないため、確認していない）
- このスクリプトの件数と、Zenn が実際に数える投稿数が一致するかどうか（Zenn は判定のロジックを公開していないため、確認できない）
