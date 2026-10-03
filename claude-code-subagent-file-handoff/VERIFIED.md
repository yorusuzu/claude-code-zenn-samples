# 動作確認記録

> この記録は、このリポジトリに移す前の作業用リポジトリ（`samples/` 以下）で取ったものです。記録内のパス（`samples/...`）は当時のものです。公開にあたり、`README.md` の冒頭の説明（`Agent` ツールの既定の扱い）を正確な書き方に直しています。

- 確認日: 2026-09-27
- 環境: Windows 11 Home 10.0.26200, Git Bash (PowerShell 併用), Node.js v24.18.0

## 確認したこと

### 1. YAML frontmatter の解析確認

依存ライブラリなしの簡易パーススクリプト（`node` 標準ライブラリのみ使用）を書き、
3 つのサブエージェント定義（`researcher.md`, `writer.md`, `reviewer.md`）の frontmatter が
`---` で囲まれた領域として正しく取り出せること、および `name` / `description` が必須項目として
存在し、`tools` / `model` が任意項目として存在することを検証した。

検証スクリプト（要旨。スクリプト本体 `verify-frontmatter.js` は作業時の一時フォルダに置いたもので、このリポジトリには同梱していません）:

```js
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
// body を1行ずつ "key: value" として読み取り、
// name / description の必須項目が空でないことを確認する
```

実行コマンドと結果:

```
$ node verify-frontmatter.js \
    samples/claude-code-subagent-file-handoff/.claude/agents/researcher.md \
    samples/claude-code-subagent-file-handoff/.claude/agents/writer.md \
    samples/claude-code-subagent-file-handoff/.claude/agents/reviewer.md

[OK]   researcher.md: name="researcher" description="あるテーマについて Web 調査を行い、出典付きの調査結果を..." optional-fields-present=[tools, model]
[OK]   writer.md: name="writer" description="research/ の調査結果をもとに、読者向けの原稿を d..." optional-fields-present=[tools, model]
[OK]   reviewer.md: name="reviewer" description="drafts/ の原稿を research/ の調査結果と突..." optional-fields-present=[tools, model]
exit=0
```

3 ファイルすべてで `name`, `description`, `tools`, `model` が想定通りに解析できることを確認した。

### 2. ディレクトリ構成の確認

```
$ find samples/claude-code-subagent-file-handoff -type f | sort
samples/claude-code-subagent-file-handoff/.claude/agents/researcher.md
samples/claude-code-subagent-file-handoff/.claude/agents/reviewer.md
samples/claude-code-subagent-file-handoff/.claude/agents/writer.md
samples/claude-code-subagent-file-handoff/LICENSES.md
samples/claude-code-subagent-file-handoff/README.md
samples/claude-code-subagent-file-handoff/demo/drafts/example-topic.md
samples/claude-code-subagent-file-handoff/demo/research/example-topic.md
samples/claude-code-subagent-file-handoff/demo/reviews/example-topic.md
```

`research/` → `drafts/` → `reviews/` という受け渡し順に対応するファイルが揃っていることを確認した。

### 3. 内容の一貫性確認（目視）

`demo/drafts/example-topic.md` に書かれている主張が `demo/research/example-topic.md` の範囲を
超えていないこと（writer が調査結果にない事実を創作していないこと）を目視で確認した。

## 確認していないこと（正直な申告）

- **Claude Code 本体でこの 3 つのサブエージェントを実際に登録し、メインセッションから
  researcher → writer → reviewer の順に呼び出して連携させる実行検証は、この記録を取った時点では行っていない。**
  `demo/` 以下のファイルは、その実行を行った場合に得られる想定の出力を、手作業により
  作成したものであり、Claude Code のサブエージェント機能を実際に起動して生成したものではない。
- frontmatter パーススクリプトは Claude Code が内部で使う YAML パーサーそのものではなく、
  このサンプルの frontmatter 構文（単純な `key: value` の並び）に限定した簡易実装である。
  複雑な YAML（ネストしたリスト、複数行文字列など）には対応していない。
