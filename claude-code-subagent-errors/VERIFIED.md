# 動作確認の記録（サブエージェントが起動しないときのエラー）

確認日: 2026-10-16（JST）。Claude Code **2.1.293**（実行前の N0 と実行後の N0e で同じ）。各ケース 1 回ずつ、順番に実行しました（並列実行なし、再実行は S0 の 1 回だけ）。

docs（code.claude.com の sub-agents と errors のページ）は 2.1.301 時点のもので、検証は 2.1.293 です。docs と照らした結果は「docs の予想」列に書きました。2.1.293 と 2.1.301 で挙動が違う可能性は残ります。

個人情報は伏せています（`<tmp>`、`<home>`、`<session-id>`、`<toolu-N>`、`<agent-N>`）。生の出力は、この記録にも `fixtures/` にも載せていません。環境変数と認証情報の値は、どこにも出していません。

実行（`claude` の起動、集計、fixtures の作成）は、このリポジトリの builder サブエージェント（Claude Code）が行いました。

## 要点

1. **2.1.293 の `-p` では、Agent ツールはサブエージェントを非同期で起動しました。** Agent ツールの `tool_result` は、あとで拒否されたケースも含めて `is_error: false` で、本文は `Async agent launched successfully. ...` から始まりました。
2. **zero tools の拒否（Sb1、Sb3、Sz1）は、Agent ツールの `tool_result` には出ませんでした。** 文言は `system` の `task_updated`（`patch.status: failed` の `patch.error`）と `task_notification`（`status: failed` の `summary`）に、同じものが出ました。`task_started` と `SubagentStart` の hook は出たあとで、`SubagentStop` は出ず、サブエージェントのメッセージは 0、`result.subagent_stats` は `spawned=1, completed=0, failed=1` でした。docs の sub-agents ページ（確認日 2026-10-16）には "the Agent tool returns an error naming the unresolved entries" とあり、2.1.293 の `-p` での観察とは食い違いました。差の原因（版、非同期起動、ほか）は確かめていません。
3. **`subagent_type` なしの呼び出し（Sd3、Sd2、Sd1）は、呼び出しの時点で拒否されました。** Agent ツールの `tool_result` が `is_error: true` で、`spawned=0`、hook のログは空でした。
4. `tools` が空（Sa1〜Sa3）と、`disallowedTools` で全部外れる（Sc1）は、拒否されずに起動しました。サブエージェントは `tool_use` を 1 つも出しませんでした。docs の予想どおりで、企画書の Sc1 の仮説（zero tools で拒否）とは違いました。
5. 小文字のツール名（Sb3 の `tools: read, grep`）は認識されず、`unrecognized [read, grep]` として拒否されました。docs には大文字小文字の扱いが書かれていません。
6. `--agent s-main`（`tools: Agent(s-ok), Read`）では、`Available agents: s-ok` だけが示されました。メインスレッドの定義の `Agent(種類)` は 2.1.293 でも効きました（init の `tools` は `Task, Read`）。

## 環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200（Git Bash） |
| Node.js | v24.18.0 |
| Claude Code | 2.1.293 (Claude Code)（N0、各ケースの init、N0e） |
| 認証 | サブスクリプション（OAuth）。ダミーキーや `CLAUDE_CONFIG_DIR` の隔離は使っていない |
| モデル | `--model haiku`（init の model は claude-haiku-5-5）。定義側も `model: haiku` |
| 共通の引数（S 群） | `-p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --output-format stream-json --verbose --include-hook-events --permission-mode default --max-budget-usd 0.2 --max-turns 6` |
| 実行場所 | `os.tmpdir()` の下の使い捨てディレクトリ（ケースごとに `lab/` のコピー + `git init`。`lab/prompts/` と `lab/drafts/` はコピーしない） |
| 起動方法 | `spawnSync`（シェルを介さない）。プロンプトは標準入力で渡す。タイムアウトはモデルなし 30 秒、モデルあり 120 秒 |

## 実行した回数とコスト（実数）

| 項目 | 実数 | 上限 |
|---|---|---|
| 起動（`claude` と H0 の `node` を含む） | 20（H0、N0、N1、N1j、S0、S0 の再実行、Sa1〜Sa3、Sb1〜Sb3、Sc1、Sf1、Sd3、Sd2、Sd1、Sf2、Sz1、N0e） | 25 |
| モデルを使う実行 | 15（S0 を含む。S0 は API エラーで推論なし） | 15 |
| 累積コスト | 0.0372 ドル | 0.5 ドル |
| 再実行 | 1（S0） | 1 ケース 1 回まで |

累積コストは、各実行の最後の `result` の `total_cost_usd` の合計です。サブエージェントを起動した実行では `result` が 2 件出ました（2 件目は `origin.kind=task-notification`、完了通知で親が再開したもの）。2 件目の値が常に 1 件目以上だったため、最後の値を実行の累計と見ました。これは推測で、docs では確かめていません。全 `result` を足した場合でも 0.0656 ドルで、上限の内側です。

## ケースごとの結果

終了コードはすべて 0、`result.terminal_reason` はすべて `completed`、`permission_denials` はすべて空でした（S0 の 1 回目を除く。下の「S0 の 1 回目」）。

| ID | 定義（`tools` / `disallowedTools`） | 判定（`extract-spawn.mjs` の verdict） | 根拠 | 企画書の仮説（`expect`） | docs の予想（`docsExpect`） |
|---|---|---|---|---|---|
| S0（再実行） | `s-ok`（`Read`） | 起動した | task_started、SubagentStart / SubagentStop、サブエージェントの Read の `tool_result` に合言葉、spawned=1 completed=1 | 一致 | - |
| Sa1 | `s-tools-blank`（`tools:`） | 起動した（ツール呼び出しなし） | task_started、SubagentStart / SubagentStop、サブエージェントのメッセージ 1、`tool_use` 0、合言葉なし、completed=1 | どちらかの片方（起動） | 一致（拒否されず起動）。`No such tool available` での確認はできなかった（呼び出し自体がない） |
| Sa2 | `s-tools-emptystr`（`tools: ""`） | 起動した（ツール呼び出しなし） | 同上（メッセージ 2） | 同上 | 同上 |
| Sa3 | `s-tools-emptylist`（`tools: []`） | 起動した（ツール呼び出しなし） | 同上（メッセージ 1） | 同上 | 同上 |
| Sb1 | `s-tools-bogus`（`NoSuchTool, AnotherFake`） | 起動処理の途中で拒否 | task_started、SubagentStart のみ（Stop なし）、サブエージェントのメッセージ 0、task が failed、spawned=1 failed=1 | 一致（zero tools で拒否） | 一致（文言も一致。ダッシュは U+2014） |
| Sb2 | `s-tools-mixed`（`Read, NoSuchTool`） | 起動した | 合言葉あり、completed=1 | 一致 | 一致 |
| Sb3 | `s-tools-lower`（`read, grep`） | 起動処理の途中で拒否 | Sb1 と同じ | （仮説なし） | docs に記述なし |
| Sc1 | `s-disallow-all`（`Read` / `Read`） | 起動した（ツール呼び出しなし） | task_started、SubagentStart / SubagentStop、`tool_use` 0、completed=1 | **不一致**（仮説は zero tools で拒否） | 一致（拒否されず起動） |
| Sf1 | `s-tools-bogus` を使い捨て側で `tools: Read` に直す | 起動した | 合言葉あり、completed=1 | 一致 | - |
| Sd3 | 環境変数 `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` | 呼び出し時に拒否 | Agent の `tool_result` が `is_error: true`、spawned=0、hook なし。前提（`subagent_type` なし）は成立 | 一致 | 一致（docs の条件 1。文言も一致） |
| Sd2 | `--agent s-main`（`Agent(s-ok), Read`） | 呼び出し時に拒否 | 同上。前提は成立。モデルは選び直さなかった | 一致（`subagent_type is required`） | 一致（docs の条件 2） |
| Sd1 | `--disallowedTools "Agent(general-purpose)"` | 呼び出し時に拒否 | 同上。前提は成立 | 片方（deny の文言） | docs に根拠なし（探索） |
| Sf2 | Sd3 と同じ構成で `subagent_type: s-ok` を指定 | 起動した | 合言葉あり、completed=1 | 一致 | 一致（docs の直し方） |
| Sz1 | `s-tools-mcp`（`mcp__github__*`、MCP は繋がない） | 起動処理の途中で拒否 | Sb1 と同じ | （仮説なし） | 一致（matched no tools） |
| Sz2 | `s-tools-cron`（`CronCreate`） | 未実行 | モデルの実行回数の上限に達したため | - | - |

### エラーの文言（一字一句。出た場所）

Sb1（`task_updated` の `patch.error` と `task_notification` の `summary` に同じ文）:

```text
Agent 's-tools-bogus' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [NoSuchTool, AnotherFake]. Fix the agent's tools frontmatter or pass a different subagent_type.
```

Sb3（同上）:

```text
Agent 's-tools-lower' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [read, grep]. Fix the agent's tools frontmatter or pass a different subagent_type.
```

Sz1（同上）:

```text
Agent 's-tools-mcp' would be spawned with zero tools — refusing. Its tools list resolved to nothing: recognized but matched no tools in this session [mcp__github__*]. Fix the agent's tools frontmatter or pass a different subagent_type.
```

Sd3（Agent ツールの `tool_result`、`is_error: true`）:

```text
subagent_type is required: the general-purpose agent is not available in this session. Available agents: s-disallow-all, s-ok, s-tools-blank, s-tools-bogus, s-tools-emptylist, s-tools-emptystr, s-tools-lower, s-tools-mixed
```

Sd2（同上）:

```text
subagent_type is required: the general-purpose agent is not available in this session. Available agents: s-ok
```

Sd1（同上。`permission_denials` は空）:

```text
Agent type 'general-purpose' has been denied by permission rule 'Agent(general-purpose)' from cliArg.
```

Sa1〜Sa3、Sc1 には、エラーの文言はありませんでした（`taskFailures` は空、Agent の `tool_result` は `is_error: false`）。

### init の `tools` と `agents`

| ケース | `tools` | `agents` |
|---|---|---|
| S0〜Sc1、Sf1、Sd1、Sz1 | 27 個（起動のツールは `Task`） | 組み込み 5 種類（claude、Explore、general-purpose、Plan、statusline-setup）と lab の `s-*` 8 本。Sz1 は `s-tools-mcp` を足して 9 本 |
| Sd3、Sf2（`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`） | 27 個 | lab の `s-*` 8 本だけ。組み込みはすべて消えた |
| Sd2（`--agent s-main`） | `Task, Read` の 2 個 | 組み込み 5 種類、`s-main`、lab の 8 本（`Agent(s-ok)` の制限は init の一覧には表れず、エラーの `Available agents` で表れた） |

`tools` には `Task` と出ますが、モデルが出した `tool_use` の名前は `Agent` でした。

### (d) の前提の確認

Sd3、Sd2、Sd1 は、`run-case.mjs` が `checkNoSubagentType()` で `Agent`/`Task` の `tool_use` の input を確かめ、3 ケースとも「成立（すべての Agent 呼び出しで subagent_type なし）」でした。どのケースも Agent の呼び出しは 1 回で、エラーのあとに呼び直していません。

## S0 の 1 回目（認証のエラー）と再開

- 1 回目の S0 は、モデルを呼ぶ前に終わりました。終了コード 1、`terminal_reason=api_error`、コスト 0、Agent の呼び出しなし。`result.result` は次の 1 行でした（CLI が作ったメッセージ）。
  `Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute, and if it persists close other Claude Code processes or sign in again`
- 計画の止める条件に従って一度止め、PM の指示で、`node run-case.mjs --resume-after-stop --reason "<理由>"` で ledger に理由を残し、S0 を 1 回だけ再実行しました。再実行は成功し、認証のエラーはその後 1 度も出ていません。
- 1 回目の実際の出力は `fixtures/real-s0-oauth-refresh-failed/` に削って残しています。

## 認証情報ファイルのメタデータ

`~/.claude/.credentials.json` の内容は読まず、更新日時とサイズだけを比べました。

| 記録 | サイズ | 更新日時（UTC） |
|---|---|---|
| 実行前（baseline） | 519 | 2026-10-12T09:14:29Z |
| S0 の 1 回目のあと | 519 | 同じ |
| 再開の前 | 519 | 同じ |
| すべての実行のあと | 519 | **2026-10-16T08:38:34Z** |

更新日時が変わったのは、S0 の再実行（08:38:33Z ごろ開始、約 10 秒）の最中です。子プロセスの `claude` が OAuth のトークンを更新したためと見ています（中身は見ていないので推測です）。`run-case.mjs` は最後の比較でこれを検出し、ledger に stop を記録しました。この時点ですべての実行は終わっていました。

## 子プロセスに渡した環境変数の名前

APPDATA, CLAUDE_CODE_GIT_BASH_PATH, ComSpec, DISABLE_AUTOUPDATER, HOME, HOMEDRIVE, HOMEPATH, LOCALAPPDATA, PATH, PATHEXT, ProgramData, ProgramFiles, ProgramFiles(x86), SystemRoot, TEMP, TMP, USERPROFILE, windir（値は記録していません。`DISABLE_AUTOUPDATER` は `run-case.mjs` が 1 を設定）

Sd3 と Sf2 だけは、これに `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`（値は 1。秘密ではない）を足しました（ledger の `envNames` で確認）。`run-case.mjs` の `CASE_ENV_ALLOW` に名前と値の両方を固定してあり、`cases.json` の `env` にそれ以外の名前や値を書くと実行を拒否します。

## fixtures の確認

`node check-fixtures.mjs` で 8 件とも OK、終了コード 0（2026-10-16）。期待値を 1 つわざと変えると 1 件 NG、終了コード 1 になり、戻すと再び全件 OK になることも確かめました。

| ディレクトリ | 出所 |
|---|---|
| `fixtures/real-s0-oauth-refresh-failed/` | S0 の 1 回目の実際の出力 |
| `fixtures/real-sa1-started-no-tool-calls/` | Sa1 の実際の出力 |
| `fixtures/real-sb1-zero-tools-after-launch/` | Sb1 の実際の出力 |
| `fixtures/real-sd3-subagent-type-required/` | Sd3 の実際の出力 |
| `fixtures/real-sf2-started/` | Sf2 の実際の出力 |
| `fixtures/synth-spawn-ok/`、`fixtures/synth-spawn-refused/`、`fixtures/synth-no-type-refused/` | **合成**。分岐を確かめるために手で書いたもの。形は想定で、エラーの本文は `<synthetic error text>` です。記事の根拠にしないでください |

`real-` は、判定に使う項目（init、task_*、hook_*、`tool_use`、`tool_result`、text、result）だけに削り、`thinking` と `usage` を消し、`toolu_` の ID と agentId を `<toolu-N>`、`<agent-N>` に置き換え、`redact.mjs` を通して `scanResidue()` で残りがないことを確かめました。hook のログは `event` と `agent_type` だけです。

## 確認していないこと

- Sz2（`tools: CronCreate` だけ。docs の「Not available to subagents」）。モデルの実行回数の上限に達したため実行していません。
- `Task(s-ok)` と書いた `s-main`。`Agent(s-ok)` が効いたため試していません。
- Sa1〜Sa3、Sc1 で、サブエージェントに本当にツールが 1 つも渡っていないこと。stream-json にサブエージェントのツール一覧は出ないため、確かめたのは「`tool_use` が 0 件だった」ことだけです（サブエージェントは、Read を呼ぶつもりの文面を本文のテキストとして書いていました）。
- 対話モードでの表示、`--agent` 以外の方法でのメインスレッドの制限、2.1.294 以降の版での挙動。
- 各ケース 1 回ずつなので、モデルの振る舞い（エラーのあとに呼び直すかなど）のばらつきは分かりません。

## 計画からの変更点

- **N1**: `claude agents` は 2.1.293 では TTY が必要（終了コード 1、`'claude agents' requires an interactive terminal (stdout is not a TTY) — use 'claude agents --json' for a machine-readable listing.`）で、`--json`（N1j、計画にない 1 回の起動）は実行中のセッションの一覧でした。定義の一覧には `system/init` の `agents` を使いました。
- **起動の判定**: 計画の 3 つの手がかり（task_* イベント、hook のログ、合言葉）だけでは、2.1.293 の「起動処理が始まってから拒否」を「起動した」と誤って読むため、実行後に `extract-spawn.mjs` に `taskFailures` と `verdict` を足しました。判定は実行後に出力を読み直して付けましたが、企画書の仮説（`expect`）と docs の予想（`docsExpect`）は書き換えていません。
- **合言葉の位置**: 合言葉は Agent ツールの `tool_result` ではなく、サブエージェント側の Read の `tool_result` に出ました（非同期のため）。`extract-spawn.mjs` はサブエージェント側の結果も見ます。
- **s-main.md**: `lab/drafts/agents/` に置き、Sd2 の実行時だけ使い捨てのディレクトリにコピーしました（`cases.json` の `extraAgents`）。
- **Sf1 の直し方**: `run-case.mjs --case Sf1 --target s-tools-bogus` で、使い捨てのディレクトリの中の定義だけを `tools: Read` に書き換えました。`lab/` の定義は変えていません。
- **(d)**: E1 の結果で Sd3 を足し、順番を Sd3、Sd2、Sd1 にしました。3 ケースとも依頼文は `spawn-no-type.txt` です。Sf2 は Sd3 と Sd2 の結果を見てから構成を決めました（`cases.json` の `_note`）。
- **Sz1**: 下書きのまま `--include-draft` で 1 回実行し、そのあとで下書きの印を外しました。
- **実行後の description の修正**: `s-main.md` と `s-tools-mcp.md` の `description` から「まだ実行していない」などの下書きの文面を、実行後に外しました（PM）。`name`、`tools`、`model`、本文は実行時のままです。
- **ケースごとの環境変数**、**止める条件の検出**（`terminal_reason=api_error`、「OAuth」「sign in again」）、**`--resume-after-stop --reason`** を `run-case.mjs` に足しました（S0 の 1 回目のあと）。

## 後始末

- 使い捨ての作業ディレクトリのうち、`cwd/`（lab のコピー）と `raw/`（生の出力）は削除しました。
- `<tmp>/claude-subagent-errors-run/ledger.jsonl`（起動の回数、終了コード、コスト、環境変数の名前、止めた理由、認証情報ファイルの更新日時とサイズだけ。生の出力や値は入っていない）は、PM の確認のために残しています。確認が終わったら削除します。
