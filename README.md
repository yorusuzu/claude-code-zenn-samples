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
| [`claude-code-exit-codes/`](claude-code-exit-codes/) | `claude -p` の終了コード・`is_error`・`subtype`・`permission_denials` を条件別に記録する検証用スクリプトと、実測の出力（fixtures）、判定スクリプト（依存なし） | [claude -p の失敗は終了コードで分かるか: is_error・subtype・permission_denials を条件別に実測](https://zenn.dev/yorusuzu/articles/claude-code-p-exit-code-is-error-subtype) |
| [`claude-code-subagent-errors/`](claude-code-subagent-errors/) | サブエージェント定義の `tools` と Agent ツールの `subagent_type` による起動エラーを再現・判定する検証用スクリプトと、実測の出力（fixtures）、判定スクリプト（依存なし） | [Claude Code のサブエージェントが起動しない: zero tools と subagent_type is required](https://zenn.dev/yorusuzu/articles/claude-code-subagent-spawn-errors) |
| [`claude-code-permission-rule-errors/`](claude-code-permission-rule-errors/) | 書式の壊れた権限ルールを設定ファイルに書き、警告の出方と deny が効くかを記録する検証用スクリプトと、実測の出力（fixtures）、判定スクリプト（依存なし） | [Claude Codeの Invalid permission rule was skipped を実測: 書式ミスのdenyは効かない](https://zenn.dev/yorusuzu/articles/claude-code-invalid-permission-rule-skipped) |

## 動作確認の範囲

確認した内容と、確認していない内容は、各ディレクトリの `VERIFIED.md` に書いています。

- `claude-code-main-session-as-pm/` と `claude-code-subagent-file-handoff/` は、Markdown ファイルだけのサンプルです。Claude Code 本体でこのサンプルをそのまま動かして、サブエージェントを連携させる検証はしていません。
- `zenn-github-deploy-rate-limit/` は、使い捨てのリポジトリでスクリプトを実行して確認しています。数えた結果は Zenn の判定とは一致しません（詳しくは同フォルダの `README.md`）。
- `claude-code-subagent-permissions/` と `claude-code-subagent-hook-log/` は、Windows 11 で Claude Code CLI 2.1.293 を `claude -p`（haiku）で各 1 回実行した結果です。別の版や条件で同じ結果になるとは限りません。
- `claude-code-exit-codes/` は、Windows 11 で Claude Code CLI 2.1.293 を 25 回起動した結果です（モデルを呼んだのは 14 回、haiku）。どの起動も 1 回ずつで、別の版や条件で同じ結果になるとは限りません。
- `claude-code-subagent-errors/` は、Windows 11 で Claude Code CLI 2.1.293 を `claude -p`（haiku）で 14 ケース実行した結果です（S0 だけ 2 回、モデルを使う実行は 15 回。それ以外は各 1 回）。別の版や条件で同じ結果になるとは限りません。
- `claude-code-permission-rule-errors/` は、Windows 11 で Claude Code CLI 2.1.293 を 59 回起動した結果です（`claude doctor` と `claude -p`。モデルを呼んだのは 21 回、haiku）。どのケースも 1 回ずつで、別の版や条件で同じ結果になるとは限りません。

## AI の利用について

このリポジトリのファイルは、Claude Code（AI）が作成し、人間が内容を確認して公開しています。

## ライセンス

[MIT License](LICENSE)
