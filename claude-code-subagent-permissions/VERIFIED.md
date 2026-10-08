# 動作確認の記録（サブエージェントの権限）

最新の確認は **Claude Code 2.1.293** です（2026-10-08 JST）。その前に 2.1.158 で同じ確認をしており、その記録は末尾の「旧版での記録（2.1.158）」に短く残しています。2.1.158 では、サブエージェントの入れ子（孫の起動）の機能そのものがまだなく、孫まわりの結果が 2.1.293 と正反対です。

個人情報は伏せています（`<user>`、`<tmp>`、`<session-id>`）。生のログ（stream-json、hook の全文ログ）は、この記録にも記事にも載せていません。

2.1.293 の実行（モデルを呼ぶ `claude -p` の 2 回の実行と集計）は、このリポジトリの builder サブエージェント（Claude Code）が行いました。記録の転記と確認も Claude Code で行っています。

## 要点（2.1.293）

- サブエージェントから孫を起動できた。陽性対照（`tools: Read, Agent` の t-control）と、`tools` を省略した t-inherit が、どちらも t-echo を起動し、echo ファイルが書かれた。`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` は設定していない（hook から見える環境変数にも無かった）。
- `tools` に `Agent` を書かない定義（t-nest-b）と、`disallowedTools: Agent` の定義（t-nest）は、孫を起動しなかった。2 回とも、定義に `Agent` が無いと自分で報告した。
- 親の `permissions.deny` の `Edit(...)`、CLI の `--disallowedTools`、PreToolUse hook（exit 2）は、サブエージェントの呼び出しも止めた。`Write(...)` の deny は、親にもサブエージェントにも効かなかった（公式ドキュメントの記述と一致）。
- 未信頼のフォルダの `claude -p` では、プロジェクトの `permissions.allow` は使われなかった（stderr に警告が出る。ドキュメントと一致）。2.1.158 では使われていた。
- コスト: 2 回の実行の合計は約 0.059 ドル（2.1.158 では約 0.43 ドル）。

## 既発表の記述との差分（先に読む部分）

2.1.293 で確認した結果です。記事・本・`CLAUDE.md` は編集していません。

| 対象 | 既発表の記述 | 2.1.293 での結果 |
|---|---|---|
| `CLAUDE.md` の「組織」 | 「既定ではサブエージェントも `Agent` ツールで孫エージェントを起動できる（最大 3 階層）」 | 矛盾なし。2 階層目（孫）の起動は確認できた（A-6 陽性対照、A-6d、A-2 の対応する行）。「最大 3 階層」の上限は、深さ 2 までしか試していないため未確認 |
| 本 `guardrails.md` 24、36、757 行目付近: `Agent` を使えなくした設定が、実行時に効くか（未確認） | 未確認 | 確認できた（この環境で）。`tools` に `Agent` を書かない定義と `disallowedTools: Agent` の定義は、孫を起動しなかった。ただし拒否されたのではなく、サブエージェントの手元に `Agent` ツールが無かった（証拠の等級が違う。t-nest は ToolSearch を呼んで見つからなかったという実行記録＝機械的な証拠。t-nest-b は呼び出し 0 回で「関数一覧に Agent が含まれていない」という自己申告のみ）。「実行時に呼び出しが拒否される」という形ではなく、「ツールが渡されない」形 |
| 同: `permissions.deny` と hook はサブエージェントにも効くか（未確認） | 未確認 | 確認できた。`Edit(...)` の deny、`--disallowedTools`、PreToolUse hook（exit 2）は、サブエージェントの呼び出しも止めた。`Write(...)` の deny は効かない（ドキュメントどおり） |
| 記事③（`claude-code-how-many-subagents.md` の 84、110、112、133 行目付近）: qa-reviewer は Write / Edit がなくても Bash で書ける | 書ける | 確認できた。`tools: Read, Bash` の定義（t-bash）が、リダイレクトでファイルを書いた（A-7）。親が `default` のときは、書き込み先に `Edit(...)` の許可が必要で、`Bash(echo *)` の許可だけでは書けなかった |
| 記事③: `tools` を省略すると `Agent` も継承され、`disallowedTools: Agent` で打ち消せる | そのとおり | 確認できた。`tools` を省略した t-inherit は孫を起動し、`disallowedTools: Agent` を付けた t-nest は起動しなかった |
| 記事③: `Agent` を持たない定義は孫を起動できない | 起動できない | 確認できた（t-nest-b）。ただし、t-nest-b は 2 回とも Agent を呼ぼうとせず、「持っていない」と自己申告して終わった。拒否の記録ではなく、陽性対照が書けたことと、ツール一覧の自己申告を合わせた根拠 |

矛盾する記述は、見つかりませんでした。ただし、既発表の記述は「実行時の拒否は未確認」と書いているため、この結果で「未確認」を外すときは、「拒否」ではなく「ツールが渡されない」と書くのが正確です。

## ドキュメントとの一致

| 項目 | ドキュメントの記述 | この確認 | 出典 |
|---|---|---|---|
| 入れ子の既定 | メインの下に 3 階層まで（v2.1.219 以降）。定義の `tools` に `Agent` を書くと起動でき、書かないと起動できない | docs と一致した（深さ 2 まで） | https://code.claude.com/docs/en/sub-agents |
| `permissions.deny` の範囲 | セッション全体（サブエージェントを含む）に効く | docs と一致した（`Edit(...)` の deny、`--disallowedTools`） | https://code.claude.com/docs/en/sub-agents |
| サブエージェントの `permissionMode` | 親が `acceptEdits` / `auto` / `bypassPermissions` のときは無視され、`default` / `dontAsk` / `plan` のときは適用される | docs と一致した（t-plan は、`acceptEdits` の親で書け、`default` の親で止まった） | https://code.claude.com/docs/en/sub-agents |
| `Write(path)` の deny | 受け付けられるが参照されない。パス規則は `Edit` と `Read` だけが参照される（v2.1.210 以降） | docs と一致した（A-3w、P3 は deny が効かず書けた） | https://code.claude.com/docs/en/permissions |
| Bash のリダイレクト | 書き込み先に `Edit` の deny / allow が適用される | docs と整合する（A-7b は deny の拒否。A-2 の a7n は `Edit` の allow が無く、承認が必要な状態で止まった。両者は親のモードも違うので、原因の切り分けは推論） | https://code.claude.com/docs/en/permissions |
| 未信頼フォルダの `-p` | プロジェクトの `permissions.allow` と `additionalDirectories` は使われない（stderr に警告）。hook、`env`、`.mcp.json` は使われる | docs と一致した（A-9b は書けず、警告が出た。A-1 では、同じく settings に書いた hook が動いた） | https://code.claude.com/docs/en/permissions |
| `--forward-subagent-text` | サブエージェントの本文を stream に流す（v2.1.211 以降）。流れたメッセージには `parent_tool_use_id` が付く | docs と矛盾しない（`parent_tool_use_id` つきのイベントが出た）。このフラグの効果は、付けなかった実行との比較をしていないため検証していない | https://code.claude.com/docs/en/headless |

## 環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200（Git Bash あり） |
| Node.js | v24.18.0 |
| git | 2.54.0.windows.1 |
| Claude Code | 2.1.293（`claude --version`、init の `claude_code_version` も 2.1.293） |
| モデル | `--model haiku`（init の表示は `claude-haiku-5-5`。2.1.158 では `claude-haiku-4-5-20251001` だった）。定義 11 個も `model: haiku` |
| 実行方式 | `claude -p`（非対話）、`--output-format stream-json --verbose --include-hook-events --forward-subagent-text`、`--setting-sources project,local` |
| 実行日 | 2026-10-08（JST）。A-1 は 2026-10-07T23:42Z〜23:43Z、A-2 は 23:44Z〜23:45Z（JST 08:42 と 08:44） |

- 実行の直前に、`ANTHROPIC_`、`CLAUDE`、`USE_LOCAL_OAUTH`、`USE_STAGING_OAUTH` で始まる名前の環境変数を unset しました（値は読んでいません）。認証ファイルの中身も読んでいません。
- ユーザーレベルの設定（`~/.claude/settings.json`）は存在します。中身は読んでいません。`--setting-sources project,local` のため、この実行では読み込まれていません。init の `agents` は、組み込み 5 つ（claude、Explore、general-purpose、Plan、statusline-setup）と検証用の `t-*` 11 個の計 16 で、ユーザーレベルのエージェント定義は出ていません。
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` は設定していません。hook に環境変数の「名前」だけを記録させたところ（`lab/hooks/probe-env.mjs`）、この変数は hook の環境にありませんでした（hook から見えた範囲の確認で、親プロセスの環境全体の確認ではありません）。
- 検証用ディレクトリは `os.tmpdir()` の下に作り、実行後に削除しました。
- モデルを呼ぶ実行は、2.1.293 で合計 2 回（A-1、A-2）です。3 回目はしていません。

## 実行したコマンド

```
node setup-lab.mjs --run a1        # 検証用ディレクトリを作る（モデルは呼ばない）
cd <tmp>/claude-subagent-lab-a1
claude -p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --forward-subagent-text --output-format stream-json --verbose --include-hook-events --max-budget-usd 2 --permission-mode acceptEdits --disallowedTools "Edit(/zones/a4-cli/**)" --allowedTools "Bash(echo *)" < prompt.txt > run-a1.jsonl 2> run-a1.stderr

node setup-lab.mjs --run a2
cd <tmp>/claude-subagent-lab-a2
claude -p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --forward-subagent-text --output-format stream-json --verbose --include-hook-events --max-budget-usd 2 --permission-mode default --allowedTools "Edit(/zones/a0-allow/**)" "Edit(/zones/a5-plan/**)" "Edit(/zones/a6-nest/**)" "Edit(/zones/a7-bash/**)" "Bash(echo *)" < prompt.txt > run-a2.jsonl 2> run-a2.stderr

node check-zones.mjs <tmp>/claude-subagent-lab-a1 --run a1
node check-zones.mjs <tmp>/claude-subagent-lab-a2 --run a2
node summarize-run.mjs <tmp>/claude-subagent-lab-a1/run-a1.jsonl
node summarize-run.mjs <tmp>/claude-subagent-lab-a2/run-a2.jsonl
```

実行は Git Bash で行いました（`<` と `>` のリダイレクトを使うため。PowerShell では `<` が使えません）。

プロジェクト設定（`lab/.claude/settings.a1.json`、`settings.a2.json`）は、検証用ディレクトリの `.claude/settings.json` として置きました。A-1 は `permissions.deny` に `Edit(/zones/a3-deny/**)` と `Write(/zones/a3w-deny/**)`、PreToolUse hook、SubagentStart / SubagentStop hook。A-2 は `permissions.allow` に `Edit(/zones/a9-projallow/**)`、`deny` は A-1 と同じ（hook なし）。

2 回とも、終了は正常で、401、429、クォータのエラーは出ませんでした。`rate_limit_event` は各 1 件でした。

### 設計からの変更（M3）

当初の設計では、A-2 の許可を「プロジェクト設定の `permissions.allow`」で渡す想定でした。2.1.293 の `claude -p` は、未信頼のフォルダではプロジェクトの `permissions.allow` を使いません。そのため A-2 の許可は `--allowedTools`（コマンドライン）で渡し、プロジェクトの allow は A-9b の「使われないこと」の確認だけに使いました。

## 判定の方法

優先順位は、(1) ファイルができたか（`check-zones.mjs`）、(2) tool_result、(3) `permission_denials`、(4) hook のログ、(5) モデルの自己申告、です。「効かなかった」と言うのは、同じ書き方が別の場所で効いている（対照が通った）ときだけにしました。

2.1.293 の stream-json は、バックグラウンドで動くサブエージェントの完了通知で親が再開するたびに、`result` イベントを出します（A-1 は 3 件、A-2 は 2 件）。`total_cost_usd` は累積ですが、`permission_denials` は `result` ごとに別の配列です。最後の `result` だけを見ると、拒否の数を少なく数えます。

| 実行 | `result` の件数 | `permission_denials` の総数 | 最後の `result` の拒否数 |
|---|---|---|---|
| A-1 | 3 | 7 | 1 |
| A-2 | 2 | 6（実行直後の集計値。生ログは削除済みで、再確認できない） | 記録なし |

A-1 の総数 7 は、下の A-1 の節に書いた、Write の拒否 6 件（P2、P4、P5 と A-3、A-4、A-8）と A-7b の Bash 1 件の数と合います（内訳を生ログで再確認はしていません）。`summarize-run.mjs` は、全 `result` の合計を出すようにしました。

## 結果: 実行 A-1（親が `acceptEdits`）

| ケース | 設定 | 結果 | 根拠 |
|---|---|---|---|
| P1 | 対照: 許可ゾーン、親が直接 Write | 書けた | ファイルあり |
| A-0 | 対照: t-allow（`tools: Read, Write, Glob`）が許可ゾーンに Write | 書けた | ファイルあり。陽性対照として成立 |
| A-1 | t-readonly（`tools` に Write なし） | 書けなかった | ファイルなし |
| A-2 | t-disallow-write（`tools` に Write、`disallowedTools` にも Write） | 書けなかった | ファイルなし。「No such tool available」で Write が使えなかった |
| A-2' | t-disallow-inherit（`tools` 省略、`disallowedTools: Write, Edit`） | 書けなかった | ファイルなし。Write は「No such tool available」 |
| P2 | 対照: `Edit(/zones/a3-deny/**)` の deny、親が Write | 拒否 | tool_result が「denied by your permission settings」。ファイルなし |
| A-3 | 同じ deny、サブエージェントが Write | 拒否 | 同じ tool_result。ファイルなし。**親の deny はサブエージェントにも効いた** |
| P3 | 対照: `Write(/zones/a3w-deny/**)` の deny、親が Write | 書けた（deny は効かなかった） | ファイルあり |
| A-3w | 同じ deny、サブエージェントが Write | 書けた（deny は効かなかった） | ファイルあり |
| P4 | 対照: `--disallowedTools "Edit(/zones/a4-cli/**)"`、親が Write | 拒否 | ファイルなし |
| A-4 | 同じ、サブエージェントが Write | 拒否 | ファイルなし。**CLI の disallowedTools はサブエージェントにも効いた** |
| A-5(acceptEdits) | t-plan（`permissionMode: plan`）、親が `acceptEdits` | 書けた（plan は無視された） | ファイルあり |
| A-6 陽性対照 | t-control（`tools: Read, Agent`）が t-echo を呼ぶ | **孫が起動した** | `echo-control.txt` あり（内容: `written-by-t-echo caller=control`） |
| A-6d | t-inherit（`tools` 省略）が t-echo を呼ぶ | **孫が起動した** | `echo-inherit.txt` あり |
| A-6 | t-nest（`disallowedTools: Agent`）が t-echo を呼ぶ | 孫は起動せず | echo ファイルなし。ToolSearch を 1 回呼び、「No matching deferred tools found」。Agent が無いと報告 |
| A-6b | t-nest-b（`tools` に Agent なし）が t-echo を呼ぶ | 孫は起動せず | echo ファイルなし。ツール呼び出しは 0 回。「関数一覧に Agent が含まれていない」と報告 |
| A-7 | t-bash（`tools: Read, Bash`）が許可ゾーンにリダイレクトで書く | 書けた | ファイルあり |
| A-7b | t-bash が `Edit(/zones/a3-deny/**)` の deny ゾーンにリダイレクトで書く | 書けなかった（deny による拒否） | ファイルなし。`system/permission_denied` イベントと、`permission_denials` に 1 件（「Permission to use Bash with command ... has been denied」） |
| P5 | 対照: PreToolUse hook（exit 2）、親が Write | 止まった | hook のエラーが tool_result に出た。ファイルなし |
| A-8 hook | 同じ hook、サブエージェントが Write | 止まった | ファイルなし。pretool のログに、サブエージェントの呼び出しとして記録（`agent_type` に定義名） |

- 親の Write が deny / hook で止められたとき、`permission_denials` には、その Write が入っていました（P2、P4、P5 と A-3、A-4、A-8 の 6 件）。
- deny で先に止められた呼び出しは、PreToolUse hook のログに出ません（a3-deny、a4-cli の親の Write は pretool のログに無い）。

## 結果: 実行 A-2（親が `default`）

| ケース | 設定 | 結果 | 根拠 |
|---|---|---|---|
| P1 / A-0 | 許可ゾーン（`--allowedTools "Edit(/zones/a0-allow/**)"`） | 書けた | 親も t-allow もファイルあり |
| P2 / A-5 基準 | 許可なしゾーン（a5b-noallow）への Write | 拒否 | 親も t-allow も「許可されていない」で拒否。ファイルなし |
| A-5(default) | t-plan が、Edit 許可のあるゾーンに Write | 止まった | tool_result が「Cannot write ... while in plan mode」。ファイルなし。**親が default のときは、`permissionMode: plan` が効いた** |
| A-9b | プロジェクト設定の `permissions.allow`（`Edit(/zones/a9-projallow/**)`） | 書けなかった | 親も t-allow もファイルなし。stderr に「Ignoring 1 permissions.allow entry from .claude/settings.json: this workspace has not been trusted ...」。**2.1.158 とは逆の結果** |
| A-6 陽性対照 1 | t-echo を親が直接呼ぶ | 書けた | `echo-direct.txt` あり |
| A-6 陽性対照 2 | t-control（`tools: Read, Agent`）が t-echo を呼ぶ | **孫が起動した** | `echo-control.txt` あり。`--allowedTools` の Edit 許可は、孫にも届いた |
| A-6d | t-inherit が t-echo を呼ぶ | **孫が起動した** | `echo-inherit.txt` あり |
| A-6 | t-nest（`disallowedTools: Agent`）が t-echo を呼ぶ | 孫は起動せず | echo ファイルなし。使えるツールの一覧を挙げ、Agent が無いと報告 |
| A-6b | t-nest-b（`tools` に Agent なし）が t-echo を呼ぶ | 孫は起動せず | echo ファイルなし。使えるのは Read と Glob だけと報告 |
| A-7 default | t-bash が、`Edit(/zones/a7-bash/**)` の許可ゾーンに相対パスのリダイレクトで書く | 書けた | ファイルあり |
| A-7 円記号 | 同じゾーンに、円記号（バックスラッシュ）区切りの絶対パスで書く | 書けた | ファイルあり |
| A-7 許可なし | `Bash(echo *)` の許可だけで、`Edit` の許可がないゾーン（a7n-bash）に書く | 止まった（deny ではなく、承認が必要な状態。非対話なので承認されず書けなかった） | ファイルなし。「Output redirection ... needs approval」。`permission_denials` に 1 件 |

## 孫エージェントの起動回数

| 実行 | Agent 呼び出し（合計） | 親から | サブエージェントの中から |
|---|---|---|---|
| A-1 | 17 | 15 | 2（t-control と t-inherit が、それぞれ t-echo を起動） |
| A-2 | 14 | 12 | 2（同上） |

- 孫の起動では、SubagentStart / SubagentStop と PreToolUse hook が動きました（PreToolUse のログに `agent_type: t-echo`）。stream-json では、孫のイベントにも `parent_tool_use_id` が付きました。
- サブエージェントの `Agent` 呼び出しは、どれも非同期で（「Async agent launched successfully」）、孫の結果は、起動した側が終わった後に届きました。
- A-2 で、親が SendMessage を 1 回呼んで失敗しました。ファイルは書かれていません（観察のみ）。
- init のツール一覧では、Agent ツールの名前が `Task` と表示され、tool_use の `name` は `Agent` でした。同じツールの別名と見られます（2.1.158 と同じ）。

### hook のログ（A-1）

- SubagentStart 17 件、SubagentStop 17 件（v1 と v2 の形はそれぞれ 34 行。時刻以外同じ内容）。v3 の `%CLAUDE_PROJECT_DIR%` の形は 34 件すべて失敗（終了コード 1、セッションは止まらない）。
- SubagentStop の `permission_mode` は、17 件すべて `acceptEdits`（親のモードと同じ値）でした。これが親（セッション）側の値なのか、サブエージェントの有効なモードなのかは区別できていません。サブエージェントの有効モードの証拠にはせず、参考値として扱います（モードの効き方は、書き込みの成否で判定しています）。
- 入力の項目（2.1.158 からの増減を含む）と、hook を実行するシェルは、`../claude-code-subagent-hook-log/VERIFIED.md` にまとめています。

## コスト

| 実行 | コスト（最後の `result` の `total_cost_usd`、累積） | 2.1.158 での値 |
|---|---|---|
| A-1 | 0.02873091 ドル | 0.2808926 ドル |
| A-2 | 0.03030498 ドル | 0.148267 ドル |
| 合計 | 0.05903589 ドル | 0.4291596 ドル |

- 2.1.293 でのモデルは `claude-haiku-5-5` です。コストが下がった理由（モデルの単価、キャッシュ、手順書の長さの違いなど）は、切り分けていません。

## 確認していないこと

- 入れ子の深さ 3 以上。「最大 3 階層」の上限そのものは試していません（超えたときの挙動も未確認）。孫の中から曾孫を起動する確認はしていません。
- 親の `permissions.deny` や hook が、孫にも届くか（孫は許可ゾーンにしか書いていない。`--allowedTools` の許可が孫に届くことだけ確認した）。
- 対話モード（許可ダイアログ）、`auto`、`bypassPermissions`、`dontAsk`。
- ユーザーレベルのエージェント定義と設定、プラグインの定義。
- haiku 以外のモデル。macOS / Linux。2.1.293 以外のバージョン。
- `Agent(type)` のように、呼べる定義を制限する書き方。
- 親が `default` のときの `permissions.deny` の効き方（deny は A-1 の `acceptEdits` でだけ確認した）。
- 信頼済みのフォルダで、プロジェクトの `permissions.allow` が使われること（実行の追加が要るため、していない）。
- `--forward-subagent-text` の影響を切り分けた比較（付けない実行との比較）。
- A-7b と a7n は、別の現象として分けて読んでください。A-7b（親 `acceptEdits`）は、`Edit` の deny による拒否（`permission_denied` イベントあり）。a7n（親 `default`）は、`Edit` の allow が無く、承認が必要な状態で止まった（非対話のため承認されず書けない）。どちらも docs の記述と整合しますが、止まった原因は、親のモードが違う 2 回の実行からの推論で、同じ条件で deny の有無だけを変えた比較はしていません。
- t-nest-b は、Agent を呼ぼうとせずに「持っていない」と答えました。ツールが無かったことの直接の証拠は、モデルの自己申告です（陽性対照が書けたことで補強）。
- 1 ケース 1 回の実行です。モデルの振る舞いのばらつきは見ていません。

## 計画からの変更

- 2.1.158 の記録をもとに、手順書 a2.txt に S9（t-nest-b が孫を呼ぶ手順）を足しました。bash の手順は S10〜S12 になっています。
- `check-zones.mjs` の期待表を、2.1.293 の結果に合わせました（孫の陽性対照は「あり」、A-9b の 2 行は「なし」）。実行ログ（`run-<run>.jsonl`）が無いときは警告を出します。
- `settings.a1.json` に、環境変数の名前だけを記録する hook（`probe-env.mjs`）を足しました。
- 実行は 2 回までと決めており、3 回目はしていません。

---

# 旧版での記録（2.1.158）

2026-10-08（JST）の早い時刻に、Claude Code 2.1.158（モデル `claude-haiku-4-5-20251001`）で同じ実行をした結果です。2.1.293 と結果が違う点を中心に残します。

| 項目 | 2.1.158 | 2.1.293 |
|---|---|---|
| サブエージェントの `Agent` ツール | どの定義にも渡されず、孫の起動は 0 回。陽性対照（`tools: Read, Agent`）も失敗した | 渡される。陽性対照も `tools` 省略の定義も孫を起動した |
| 入れ子の対照 | 判定不能（対照が成立しなかった） | 判定できた（`Agent` を書かない定義と `disallowedTools: Agent` の定義は起動しない） |
| プロジェクトの `permissions.allow`（`-p`、`--setting-sources project,local`） | 使われた（A-9b で書けた） | 使われない（警告が出る） |
| `Edit(...)` の deny、`--disallowedTools`、PreToolUse hook | サブエージェントにも効いた | 同じ |
| `Write(...)` の deny | 効かなかった | 同じ |
| t-plan | 親 `acceptEdits` で無視、親 `default` で効いた | 同じ |
| A-2' の書き込み失敗の様子 | ToolSearch で Write が見つからなかった | 「No such tool available: Write」 |
| SubagentStart の入力項目 | `agent_id`, `agent_type`, `cwd`, `hook_event_name`, `session_id`, `transcript_path` | 上に `prompt_id` が増えた |
| SubagentStop の入力項目 | 上に `agent_transcript_path`, `background_tasks`, `last_assistant_message`, `permission_mode`, `session_crons`, `stop_hook_active` | 上に `prompt_id` と `effort` が増えた |
| `%CLAUDE_PROJECT_DIR%` の hook | 終了コード 1（非ブロッキング） | 同じ |
| Agent 呼び出しの数 | A-1 15（入れ子 0）、A-2 11（入れ子 0） | A-1 17（入れ子 2）、A-2 14（入れ子 2） |
| コスト | 合計 0.4291596 ドル | 合計 0.05903589 ドル |

- 2.1.158 の記録では、`CLAUDE.md` の「最大 3 階層」を「食い違い」と書いていました。原因は、その版に入れ子の機能が無かったことで、記述の誤りではありませんでした（上の差分表で訂正済み）。
- 2.1.158 の A-1 は、2026-10-07T15:23:40Z〜15:25:55Z、A-2 は 15:28:40Z〜15:29:55Z。疎通確認（Run 0、PM が実施）のコストは 0.00902675 ドルでした。
- 2.1.158 では、親が `default` のとき、Bash のリダイレクトに書き込み先の `Edit` 許可が必要でした。円記号区切りの絶対パスも書けました。2.1.293 でも同じです。
- 2.1.158 の hook は、SubagentStart 15 件、SubagentStop 15 件でした。
