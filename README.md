# claude-code-zenn-samples

Zenn の記事で紹介している、Claude Code のサブエージェント運用のサンプルです。
各ディレクトリの中身を自分のプロジェクトにコピーし、役割名や出力先ディレクトリを書き換えて使います。

| ディレクトリ | 内容 | 対応する記事 |
|---|---|---|
| [`claude-code-main-session-as-pm/`](claude-code-main-session-as-pm/) | メインセッションを PM（オーケストレーター）に固定する `CLAUDE.md` テンプレート | [Claude Codeでサブエージェントが増えたら、メインセッションをPMに固定する](https://zenn.dev/yorusuzu/articles/claude-code-main-session-as-pm) |
| [`claude-code-subagent-file-handoff/`](claude-code-subagent-file-handoff/) | researcher / writer / reviewer の 3 つのサブエージェント定義と、ファイル経由の受け渡しの例 | [Claude Codeのサブエージェント間はファイル経由で受け渡す](https://zenn.dev/yorusuzu/articles/claude-code-subagent-file-handoff) |

## 動作確認の範囲

どちらも Markdown ファイルだけのサンプルです。確認した内容と、確認していない内容は、各ディレクトリの `VERIFIED.md` に書いています。
Claude Code 本体でこのサンプルをそのまま動かして、サブエージェントを連携させる検証はしていません。

## AI の利用について

このリポジトリのファイルは、Claude Code（AI）が作成し、人間が内容を確認して公開しています。

## ライセンス

[MIT License](LICENSE)
