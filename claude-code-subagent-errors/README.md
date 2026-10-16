# サブエージェントが起動しないときのエラーを確かめる

Claude Code のサブエージェント定義（`.claude/agents/*.md`）を、わざと壊した状態で `claude -p` から起動させます。そのときに

- サブエージェントが本当に起動したか
- Agent ツールの `tool_result` に何が返ったか（`is_error` と本文）
- 最後の `result` イベントと `claude` の終了コード

を、モデルの自己申告ではなく、出力のイベントと hook のログから記録するための道具です。

> **状態**: 2026-10-16 に Claude Code 2.1.293 で、S0（再実行）、Sa1〜Sc1、Sf1、Sd3、Sd2、Sd1、Sf2、Sz1 を各 1 回実行しました。Sz2 は実行していません。結果は `VERIFIED.md` にあります。
>
> 結果の要約（2.1.293、`-p`、haiku、各 1 回。S0 だけ認証エラーのため 2 回。実際の出力の fixture があるのは S0 の失敗、Sa1、Sb1、Sd3、Sf2 だけで、ほかのケースは `VERIFIED.md` の記録のみ）:
> - `tools` が空（Sa1〜Sa3）と、`disallowedTools` で全部外れる（Sc1）は、拒否されずに起動しました（サブエージェントはツールを 1 回も呼ばなかった）。
> - `tools` の全部が解決しない（Sb1 = 存在しない名前、Sb3 = 小文字で書いた `read, grep`、Sz1 = 繋いでいない MCP）は `would be spawned with zero tools — refusing` で拒否されました。ただし、この環境では、この文言は Agent ツールの `tool_result` ではなく、`task_updated` と `task_notification` のイベントに出ました（docs の sub-agents ページは「通常は Agent ツールがエラーを返す」と説明していて、差の原因は未確認。下の「注意」）。
> - `subagent_type` なしの呼び出し（Sd3、Sd2）は `subagent_type is required: ...` が Agent ツールの `tool_result`（`is_error: true`）に出ました。Sd1（`--disallowedTools "Agent(general-purpose)"`）は deny の文言でした。

調べる対象（`cases.json`）:

| 群 | 内容 | 定義 |
|---|---|---|
| S0 | 陽性対照（`tools: Read`） | `s-ok` |
| a | `tools` が空（`tools:`、`tools: ""`、`tools: []`） | `s-tools-blank`、`s-tools-emptystr`、`s-tools-emptylist` |
| b | `tools` の名前の間違い（全部が存在しない名前、一部だけ、小文字） | `s-tools-bogus`、`s-tools-mixed`、`s-tools-lower` |
| c | `disallowedTools` で全部が外れる | `s-disallow-all` |
| d | `subagent_type` を付けずに呼び、general-purpose が使えない | Sd3（環境変数）、Sd2（`--agent s-main`）、Sd1（探索） |
| f | 直したあとの確認 | Sf1（`tools: Read` に直す）、Sf2（Sd3 の構成で `subagent_type: s-ok` を指定） |
| z | 任意の zero tools | Sz1（`tools: mcp__github__*`）、Sz2（`tools: CronCreate`。未実行） |

## 必要なもの

- Node.js 18 以降（依存パッケージなし。Node.js の標準モジュールだけを使います）
- Claude Code（確認した版は 2.1.293）と、ログイン済みのアカウント
- git（使い捨てのディレクトリで `git init` します）

モデルは `haiku` を使い、1 回の実行ごとに `--max-budget-usd 0.2` と `--max-turns 6` を付けます。

## セットアップ

このディレクトリをそのまま使います。インストールは要りません。

```sh
node run-case.mjs --list
```

## 使い方

### 1. 1 ケースを実行する

```sh
node run-case.mjs --cred-stat --label before   # 認証情報ファイルの更新日時とサイズだけを記録（内容は読まない）
node run-case.mjs --case N0                    # claude --version（モデルなし）
node run-case.mjs --case S0                    # 陽性対照。ここで起動しなければ先に進まない
node run-case.mjs --case Sb1
node run-case.mjs --case Sf1 --target s-tools-bogus   # zero tools が出た定義を tools: Read に直して同じ依頼
node run-case.mjs --cred-stat --label after
node run-case.mjs --status                     # 起動回数、モデルの回数、累積コスト、止める条件
```

`run-case.mjs` がすること:

- `lab/` を `os.tmpdir()` の下の使い捨てのディレクトリにコピーし、そこで `claude` を起動します。このリポジトリの `CLAUDE.md` や `.claude/` は混ざりません。`--setting-sources project,local` で、ユーザーレベルの設定も読みません。
- 子プロセスには、許可リストにある環境変数だけを渡します。記録するのは名前だけです。ケースごとに足せるのは `CASE_ENV_ALLOW` に名前と値を書いたもの（今は Sd3 と Sf2 で使う `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` だけ）です。
- 生の出力は使い捨てのディレクトリの `raw/` に保存し、画面には置換済み（`redact.mjs`）の要約だけを出します。
- `ledger.jsonl` に回数とコストを書き、上限（起動 25 回、モデルを使う実行 15 回、0.5 ドル、1 ケースの再実行は 1 回まで）を超える実行を拒否します。
- 認証・利用枠のエラー、版の変化、想定外のエージェント定義、S0 の不成立を見つけたら止めます。原因を確かめてから `node run-case.mjs --resume-after-stop --reason "<理由>"` で再開します。

### 2. 出力からサブエージェントの起動を読み取る

```sh
node extract-spawn.mjs <stream-json の標準出力> --hook <hook のログ> --token-file lab/fixtures/token.txt
```

「起動した」と判断する手がかりは、次のどれかです。モデルの最終回答の文面は使いません。

- `system` の `task_started` イベント
- hook（`SubagentStart`）のログ
- サブエージェント側のメッセージ（`parent_tool_use_id` が付いたもの）
- サブエージェントだけが読める合言葉（`lab/fixtures/token.txt`）が、サブエージェント側の `tool_result`（Read の結果）に含まれる
- `result.subagent_stats.spawned` が 1 以上

2.1.293 では、`system/init` の `tools` でサブエージェントを起動するツールの名前が `Task` でした（モデルが呼んだ `tool_use` の名前は `Agent`）。`extract-spawn.mjs` は `Agent` と `Task` の両方を扱います。

`task_started`、`SubagentStart`、`spawned` は「起動処理が始まった」ことしか示しません。2.1.293 では zero tools の拒否がそのあとに起きるためです。そこで `extract-spawn.mjs` は次の 2 つも出します。

- `taskFailures`: `task_updated`（`patch.status` が `failed`）の `patch.error` と、`task_notification`（`status` が `failed`）の `summary`。zero tools の拒否の文言はここに出ます
- `verdict`: 「Agent の呼び出しなし」「呼び出し時に拒否（Agent の tool_result が is_error）」「起動処理の途中で拒否（task が failed、サブエージェントのメッセージなし）」「起動した（サブエージェントのツール呼び出しなし）」「起動した」「判定できない」のどれか

### 3. 抽出の動作を確かめる（モデルなし）

```sh
node check-fixtures.mjs
```

`fixtures/` の出力を `extract-spawn.mjs` に通し、`fixtures/expected.json` と比べます。`real-` で始まるものは実際の出力を置換・削減したもの、`synth-` で始まるものは分岐を確かめるために手で書いた合成データです（形は想定で、実測ではありません）。

## 分かっていること・注意

- **`claude agents` は定義の一覧ではありません**（2.1.293）。対話式の画面で、標準出力が端末でないと終了コード 1 になります。`claude agents --json` は実行中のセッションの一覧（作業フォルダやセッション名を含む）です。定義が読み込まれたかは、`claude -p --output-format stream-json --verbose` の最初の `system/init` イベントの `agents` 欄で確かめます。`--json` の出力は、ほかのセッションの情報を含むので、そのまま貼らないでください。
- **2.1.293 の `-p` では、Agent ツールはサブエージェントを非同期で起動します。** Agent ツールの `tool_result` は、拒否される場合も `is_error: false` で `Async agent launched successfully. ...` から始まります。zero tools の拒否は、そのあとで `SubagentStart` の hook が出たあとに起き、`SubagentStop` は出ず、`subagent_stats` は `spawned=1, failed=1` でした。Agent ツールの `tool_result` だけを見て「起動した」と判断しないでください。docs の sub-agents ページ（確認日 2026-10-16）は、zero tools の拒否を "the Agent tool returns an error naming the unresolved entries" と説明しており、この観察とは食い違いました。版の差か非同期起動かなど、原因は確かめていません。
- サブエージェントを起動した実行では、`system/init` と `result` が 2 回ずつ出ました（2 回目の `result` は完了通知で親が再開したもの）。このサンプルは、最後の `result` の `total_cost_usd` をその実行の累計と見て数えています（2 回目の値が常に 1 回目以上だったことからの推測で、docs では確かめていません）。
- 複数の Claude Code を同時に動かしていると、`-p` の実行が `Failed to refresh OAuth token: another Claude Code process is refreshing it ...` で、モデルを呼ぶ前に終わることがありました（終了コード 1、`terminal_reason=api_error`、コスト 0）。
- `--dangerously-skip-permissions` と `bypassPermissions` は使いません。`--permission-mode default` で実行します。

## ファイル

| パス | 内容 |
|---|---|
| `run-case.mjs` | 1 ケースを実行し、記録して、上限と止める条件を守る |
| `extract-spawn.mjs` | stream-json の出力から、起動に関わる項目だけを抜き出す |
| `check-fixtures.mjs` | `extract-spawn.mjs` を fixtures で確かめる |
| `redact.mjs` | 置換（`samples/claude-code-exit-codes/` からコピー） |
| `cases.json` | ケースの一覧。`expect` は企画書の仮説、`docsExpect` は docs の予想 |
| `lab/.claude/agents/` | 検証用の定義（`s-*`） |
| `lab/.claude/settings.json`、`lab/hooks/log-subagent.mjs` | `SubagentStart` / `SubagentStop` を `logs/subagent.jsonl` に記録する hook |
| `lab/drafts/agents/` | 必要なケースでだけコピーする定義（`s-main`、任意の `s-tools-mcp`、`s-tools-cron`） |
| `lab/prompts/` | 依頼文（`{agent}` を定義名に置き換える） |
| `fixtures/` | `check-fixtures.mjs` 用の出力 |
| `VERIFIED.md` | 実行した結果と環境 |
| `LICENSES.md` | ライセンス |

このサンプルのコードと記録は、AI（Claude Code）を使って作成し、実行して確かめたものです。
