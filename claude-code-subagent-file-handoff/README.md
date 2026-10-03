# サンプル: サブエージェント間のファイル経由の受け渡し

Claude Code の既定では、サブエージェントも `Agent` ツールで別のサブエージェントを起動できます
（`tools` を省略した定義は、`Agent` を含む全ツールを継承します）。
この 3 エージェント（`researcher` / `writer` / `reviewer`）の定義は、いずれも `tools` の許可リストに `Agent` を
含めていないため、互いを直接呼び出すことはできません。そのため、複数のサブエージェントに連携した作業をさせるには、
メインセッションが仲介し、各エージェントの成果物をファイル経由で受け渡す設計にします。

対応する記事: 「Claude Codeのサブエージェント間はファイル経由で受け渡す」

## 構成

```
.claude/agents/
  researcher.md   調査 → research/<slug>.md に出力
  writer.md       research/ を読んで drafts/<slug>.md に執筆
  reviewer.md     drafts/ を research/ と突き合わせて reviews/<slug>.md に判定
demo/
  research/example-topic.md   researcher の成果物（デモ）
  drafts/example-topic.md     writer の成果物（デモ）
  reviews/example-topic.md    reviewer の成果物（デモ）
```

`demo/` 以下は、実際にこの 3 エージェントを順番に動かした場合に生成される成果物の例を、
手作業で再現したものです（同じ内容をメインセッションが 3 エージェントに順番に依頼すれば得られる想定の出力です）。

## セットアップ

1. `.claude/agents/` の 3 ファイルを自分のプロジェクトの `.claude/agents/` にコピーする。
2. プロジェクト直下に `research/`, `drafts/`, `reviews/` ディレクトリを作る。
3. メインセッションで「〇〇について調査して、原稿を書いて、レビューして」のように依頼すると、
   メインセッションが researcher → writer → reviewer の順にサブエージェントを呼び、
   各成果物をファイル経由で受け渡す。

## 受け渡しの流れ

1. メインセッションが researcher を呼び、`research/<slug>.md` を作らせる。
2. メインセッションが writer を呼び、「`research/<slug>.md` を読んで `drafts/<slug>.md` に書いて」と依頼する
   （writer 自身の `tools` に `Agent` は含まれておらず researcher を直接呼べないため、メインセッションが `research/<slug>.md` というファイルパスを渡すことで連携する）。
3. メインセッションが reviewer を呼び、`drafts/<slug>.md` と `research/<slug>.md` を突き合わせて判定させる。

## 動作確認について

`VERIFIED.md` に記載の通り、3 つのエージェント定義の YAML frontmatter が正しく解析できること、
および `demo/` のディレクトリ構成が想定通りであることを確認しています。
Claude Code 本体でこの 3 エージェントを実際に呼び出して連携させる検証は、この記録を取った時点では行っていません。
`demo/` の内容は、その実行を行った場合に得られる想定の出力を手作業で作成したものです。
