# 動作確認の記録（サブエージェントの hook ログ）

最新の確認は Claude Code 2.1.293 です（旧版 2.1.158 の記録は末尾に短く残しています）。

この記録の実行は、`../claude-code-subagent-permissions/` の Run A-1 の中で行いました（hook の確認用に別のモデル実行はしていません）。実行の全体、コスト、環境は `../claude-code-subagent-permissions/VERIFIED.md` を参照してください。

2.1.293 の実行（モデルを呼ぶ `claude -p` の 2 回の実行と集計）は、このリポジトリの builder サブエージェント（Claude Code）が行いました。記録の転記と確認も Claude Code で行っています。

## 環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Node.js | v24.18.0 |
| git | 2.54.0.windows.1 |
| Claude Code | 2.1.293（`claude -p`、非対話。モデルは haiku） |
| 実行日 | 2026-10-08（JST） |
| `~/.claude/settings.json` | 存在する（中身は見ていない。`--setting-sources project,local` で読み込まなかった） |

## 確認した内容（2.1.293）

Run A-1 の設定には、`SubagentStart` と `SubagentStop` の両方に、コマンドの書き方が違う 3 つの hook を並べました。

| 形 | command の書き方 | 結果 |
|---|---|---|
| v1 | `node "$CLAUDE_PROJECT_DIR/hooks/log-subagent.mjs" logs/v1.jsonl --raw` | 動いた（34 行 = 開始 17 + 終了 17） |
| v2 | `node hooks/log-subagent.mjs logs/v2.jsonl`（相対パス） | 動いた（34 行。v1 と、時刻を除いて同じ内容） |
| v3 | `node "%CLAUDE_PROJECT_DIR%\hooks\log-subagent.mjs" logs/v3.jsonl` | 失敗（34 回すべて終了コード 1）。出力は「モジュールが見つからない」で、パスが `<作業ディレクトリ>\%CLAUDE_PROJECT_DIR%\hooks\...` になっていた（変数が展開されていない）。ログファイルはできなかった。セッションは止まらず、最後まで進んだ |

- `settings.example.json` の形は v1 から `--raw` を除いたものです。`--raw` なしの出力（v2）が v1 と同じ内容だったこと、`settings.example.json` が正しい JSON であることを確認しました。
- v2 の相対パスは、`claude -p` の作業ディレクトリがプロジェクトのルートだったので動きました。作業ディレクトリが変わる場合は `$CLAUDE_PROJECT_DIR` の形のほうが安全です（変わった場合は確認していません）。
- 17 件の開始・終了は、サブエージェントの起動 17 回と一致しました。このうち 2 回は、サブエージェントの中から起動された孫です（t-control から t-echo、t-inherit から t-echo。各 1 回）。孫の開始・終了も、親から起動された場合と同じ形で記録されました。
- セッションを表す値（`session`）は、17 件の開始・終了すべてで同じ 1 種類でした（孫も同じ）。
- 定義名（`agent_type`）の内訳: t-allow 10 件、t-echo 4 件、t-bash 4 件、その他は各 2 件ずつ（開始と終了の合計）。

### hook の入力に含まれていた項目（`keys` から）

| イベント | 項目 |
|---|---|
| SubagentStart | `agent_id`, `agent_type`, `cwd`, `hook_event_name`, `prompt_id`, `session_id`, `transcript_path` |
| SubagentStop | 上に加えて `agent_transcript_path`, `background_tasks`, `effort`, `last_assistant_message`, `permission_mode`, `session_crons`, `stop_hook_active` |

- 入力に、起動した側を示す項目（親の `agent_id` など）はありません。このため、ログだけでは入れ子の関係は分かりません。
- SubagentStop の `permission_mode` は、17 件すべて `acceptEdits` でした。`permissionMode: plan` を書いた定義（t-plan）でも同じでした。同じ実行で、t-plan は書き込みできました（親が `acceptEdits` のため `plan` は無視されたと見られる）。一方、親が `default` の Run A-2 では t-plan の書き込みが止まりました。この値が親のモードなのかサブエージェント自身のモードなのかは区別できていないため、参考値として扱ってください（Run A-2 の hook ログは取っていません）。
- 秘密情報（トークン、API キーなど）に当たる項目は、入力のどこにもありませんでした。全文（`--raw`）には、作業ディレクトリ、transcript のパス（ユーザー名を含む）、セッション ID が入っていたため、`--raw` のログは記録にも記事にも使わず、一時ディレクトリごと削除しました。
- PreToolUse の hook の入力には、サブエージェントの中の呼び出しだけに `agent_id` と `agent_type` が含まれていました（`../claude-code-subagent-permissions/lab/hooks/deny-zone.mjs` のログで、親の呼び出しは `agent_type: null`（18 件）、サブエージェントの呼び出しは定義名が入っていた（11 件。孫の t-echo の 2 件を含む））。deny ルールで先に止まった呼び出しは、PreToolUse のログに出ませんでした。

### hook を実行するシェル（Windows）

hook に環境の手がかりだけを記録するスクリプト（`lab/hooks/probe-env.mjs`。環境変数の名前だけを残し、値は記録しない）を SubagentStart に追加し、17 回分を確認しました。

| 手がかり | 結果（17 回すべて同じ） |
|---|---|
| `MSYSTEM` | あり（Git Bash の環境） |
| 環境変数 `SHELL` の実行ファイル名 | `bash.exe` |
| `BASH_VERSION` | なし（エクスポートされていないだけで、bash でないことの根拠にはならない） |
| `PSModulePath` | あり（呼び出し元の環境から引き継いだもの） |
| `CLAUDE_PROJECT_DIR` | あり |
| `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | なし（設定していない） |

- `MSYSTEM`、`SHELL`、`PSModulePath` は、呼び出し元（このセッションを起動した Git Bash）から引き継がれる値です。そのため、hook がどのシェルで動いたかの証拠としては弱く、Git Bash で動いたというのは推定です。
- 結論: この環境では、hook の command は Git Bash で実行されたと見られます。docs には、Windows で Git Bash が無ければ PowerShell に切り替わると書かれています（https://code.claude.com/docs/en/hooks ）。`$CLAUDE_PROJECT_DIR` の形が動き、`%CLAUDE_PROJECT_DIR%` の形が展開されなかったことと矛盾しません。ただし、シェルの種類を直接取得したわけではない推定です。
- Git Bash が無い Windows で、hook が PowerShell で実行される場合は確認していません（その場合は `$env:CLAUDE_PROJECT_DIR` が必要になる可能性があります）。

### スクリプト単体の確認（モデルを呼ばない）

- 通常の入力、JSON として読めない入力、空の入力、書き込めない出力先のいずれでも、終了コードは 0 でした。
- 実際の項目名を使った入力を `$CLAUDE_PROJECT_DIR` つきの command の形で渡し、README の出力例と同じ形の行が出ることを確認しました。

## 確認していないこと

- 対話モード、macOS / Linux、Claude Code 2.1.293 以外のバージョン（2.1.158 は下記）。
- 深さ 3 以上の入れ子でのログ（深さ 2 まで確認）。
- バックグラウンドで動くサブエージェント、並列に動くサブエージェントでの記録の順序（2.1.293 のサブエージェントは非同期に起動される様子が見えたが、順序は検証していない）。
- 入力が非常に大きい場合の挙動。
- hook が PowerShell で実行される環境。
- 親が `default` のときの `permission_mode`。

## 計画からの変更

- 計画では「SubagentStart と SubagentStop の hook を 1 つ」でしたが、Windows での書き方の違いを確かめるため、1 回の実行の中に 3 つの形を並べました。
- 確認用の実行は、サブエージェント権限の検証（A-1）と同じ実行に相乗りしました。独立したモデル実行はしていません。
- 2.1.293 での再確認では、シェルの手がかりを記録する hook（probe-env）を追加しました。

## 旧版での記録（2.1.158）

同じ構成で Run A-1 を実行した結果です。2.1.293 との違いだけを書きます。

| 項目 | 2.1.158 | 2.1.293 |
|---|---|---|
| 開始・終了の件数 | 各 15 件 | 各 17 件（うち孫が各 2 件） |
| 孫の起動 | なし（記録できる例が無かった） | あり。同じ形で記録された |
| SubagentStart の項目 | `prompt_id` なし | `prompt_id` あり |
| SubagentStop の項目 | `prompt_id`, `effort` なし | `prompt_id`, `effort` あり |
| `%CLAUDE_PROJECT_DIR%` の形 | 失敗（終了コード 1） | 失敗（終了コード 1、34 回） |
| `$CLAUDE_PROJECT_DIR` の形、相対パス | 動いた | 動いた |
| v1 と v2 の内容 | 時刻を除いて同じ | 時刻を除いて同じ |
