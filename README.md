# claude-code-zenn-samples

Zenn の記事で紹介している、Claude Code のサブエージェント運用と、Zenn の GitHub 連携の運用のサンプルです。
各ディレクトリの中身を自分のプロジェクトにコピーし、役割名や出力先ディレクトリなどを書き換えて使います。

| ディレクトリ | 内容 | 対応する記事 |
|---|---|---|
| [`claude-code-main-session-as-pm/`](claude-code-main-session-as-pm/) | メインセッションを PM（オーケストレーター）に固定する `CLAUDE.md` テンプレート | [Claude Codeでサブエージェントが増えたら、メインセッションをPMに固定する](https://zenn.dev/yorusuzu/articles/claude-code-main-session-as-pm) |
| [`claude-code-subagent-file-handoff/`](claude-code-subagent-file-handoff/) | researcher / writer / reviewer の 3 つのサブエージェント定義と、ファイル経由の受け渡しの例 | [Claude Codeのサブエージェント間はファイル経由で受け渡す](https://zenn.dev/yorusuzu/articles/claude-code-subagent-file-handoff) |
| [`zenn-github-deploy-rate-limit/`](zenn-github-deploy-rate-limit/) | Zenn の記事を push する前に、直近 24 時間に公開した記事の数を数える Node.js スクリプト（依存なし） | [ZennのGitHub連携で「投稿数の上限に達したためデプロイされませんでした」と通知された記録と、push前の確認スクリプト](https://zenn.dev/yorusuzu/articles/zenn-github-deploy-rate-limit) |
| [`claude-code-subagent-permissions/`](claude-code-subagent-permissions/) | サブエージェントの `tools`・`disallowedTools`・`permissions.deny`・PreToolUse hook が効くかを確かめる検証用プロジェクト（定義、設定、hook、集計スクリプト） | [Claude Codeのサブエージェントの権限設定は効くか。tools・disallowedTools・denyを実行して確かめた](https://zenn.dev/yorusuzu/articles/claude-code-subagent-permissions-test) |
| [`claude-code-subagent-hook-log/`](claude-code-subagent-hook-log/) | サブエージェントの起動と終了を JSON Lines で記録する hook スクリプトと設定例（依存なし） | [Claude Codeのサブエージェントの起動と終了をhookでログに残す（Windows 11で動かした記録）](https://zenn.dev/yorusuzu/articles/claude-code-subagent-hook-log) |

## 動作確認の範囲

確認した内容と、確認していない内容は、各ディレクトリの `VERIFIED.md` に書いています。

- `claude-code-main-session-as-pm/` と `claude-code-subagent-file-handoff/` は、Markdown ファイルだけのサンプルです。Claude Code 本体でこのサンプルをそのまま動かして、サブエージェントを連携させる検証はしていません。
- `zenn-github-deploy-rate-limit/` は、使い捨てのリポジトリでスクリプトを実行して確認しています。数えた結果は Zenn の判定とは一致しません（詳しくは同フォルダの `README.md`）。
- `claude-code-subagent-permissions/` と `claude-code-subagent-hook-log/` は、Windows 11 で Claude Code CLI 2.1.293 を `claude -p`（haiku）で各 1 回実行した結果です。別の版や条件で同じ結果になるとは限りません。

## AI の利用について

このリポジトリのファイルは、Claude Code（AI）が作成し、人間が内容を確認して公開しています。

## ライセンス

[MIT License](LICENSE)
