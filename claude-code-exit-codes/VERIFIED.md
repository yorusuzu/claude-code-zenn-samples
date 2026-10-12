# 動作確認の記録（`claude -p` の終了コード）

確認日: 2026-10-12（JST）。Claude Code **2.1.293** で、25 回の起動を 1 回ずつ順に実行しました（並列実行、リトライはなし）。

個人情報は伏せています（`<user>`、`<tmp>`、`<session-id>`）。生の出力（標準出力・標準エラー出力）は、この記録にも `fixtures/` にも載せていません。`fixtures/` は置換を通し、`result` の判定に使う項目だけを残したものです。環境変数と認証情報の値は、どこにも出していません。

実行（モデルを呼ぶ `claude -p` を含む 25 回の起動、集計、fixtures の作成）は、このリポジトリの builder サブエージェント（Claude Code）が行いました。

## 要点（2.1.293、Windows 11）

- **失敗でも、終了コードは 0 になることがある。** ツールの実行が拒否された 4 回（M3、M4、V2、D2）は、すべて終了コード 0、`is_error` が `false`、`subtype` が `success` でした。頼んだファイルは、4 回ともできていません。`permission_denials` が 1 件ありました。
- **`is_error` が `true` だった 7 回（A1、A2、R1、M1、M2、V1、D1）は、すべて終了コード 1** でした。終了コード 0 で `is_error` が `true` になる実行は、観測していません。
- **`subtype` が `success` でも、失敗はありえる。** 認証なし（A1）、無効なキー（A2）、存在しないモデル（R1）は、終了コード 1、`is_error` が `true` ですが、`subtype` は `success` のままでした。`subtype` だけを見て成功と判断すると、見逃します。
- **`--output-format text`（既定）では、拒否が見えない。** V3 は M3 と同じ条件の `text` 形式で、終了コード 0、標準出力は「エラー」の 1 語（モデルの返答）、標準エラー出力は空、ファイルは無しでした。終了コードにも標準出力にも、拒否を機械的に知る手がかりがありませんでした。
- `--max-turns` の超過（M1）と `--max-budget-usd` の超過（M2）は、終了コード 1。`subtype` は、それぞれ `error_max_turns`、`error_max_budget_usd` でした。
- `--permission-mode dontAsk`（M4、V2、D2）でも、拒否は終了コード 0 でした（issue #76867 の報告と同じ向き）。
- 引数の誤り、プロンプトなし、不正な `--output-format`、存在しない `--resume`、存在しない `--settings` ファイルは、終了コード 1 で、標準エラー出力に 1 行のメッセージが出て、標準出力は空でした。
- 壊れた JSON の `--settings` ファイル（N5b）は、**黙って無視されて**、終了コード 0 の普通の成功でした（標準エラー出力も空）。
- モデルが実行した Bash コマンドが終了コード 3 で失敗しても（M5）、`claude` の終了コードは 0、拒否は 0 でした。`claude` の終了コードは、中でモデルが動かしたコマンドの成否を表しません。
- 同じ条件の繰り返しは、結果が揃いました。M1、V1、D1 はすべて `error_max_turns`（終了コード 1）、M4、V2、D2 はすべて拒否 1 件（終了コード 0）です。回数は各 3 回なので、傾向としてお読みください。

## 環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200（シェルは Git Bash。`uname` は MINGW64_NT-10.0-26200） |
| Node.js | v24.18.0 |
| Claude Code（実行前） | 2.1.293 (Claude Code)（N0） |
| Claude Code（実行後） | 2.1.293 (Claude Code)（N0e）。版は変わっていません |
| 認証 | サブスクリプション（`/login` の OAuth）。A1、A2 は `CLAUDE_CONFIG_DIR` に空のディレクトリを指定して隔離 |
| モデル | `--model haiku`（init の model は claude-haiku-5-5） |
| 共通の引数 | `-p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --max-budget-usd 0.2 --max-turns N`（M2 だけ予算 0.0001） |
| 実行場所 | `os.tmpdir()` の下の使い捨てディレクトリ（ケースごとに `lab/` のコピー + `git init`） |
| 起動方法 | `spawnSync`（シェルを介さない）。プロンプトは標準入力で渡す |
| 自動更新 | 子プロセスに `DISABLE_AUTOUPDATER=1` を渡した（版が変わらなかったので、少なくとも 2.1.293 のままだった） |

## 実行した回数とコスト（実数）

| 項目 | 実数 | 上限 |
|---|---|---|
| 起動（`claude` と H0 の `node` を含む） | 25 | 25 |
| モデルの推論を伴う実行 | 14 | 15 |
| 累積コスト（`total_cost_usd` の合計） | 約 0.0230 ドル | 0.5 ドル |

モデルの推論を伴う 14 回は、N5b（壊れた設定が無視されて、普通に成功した）、M0、M1、M2、M3、M4、M5、M6、M7、V1、V2、V3、D1、D2 です。コストは 1 回あたり約 0.0015〜0.0024 ドルでした。A1、A2、R1 は API エラーで、コストは 0 でした。

## ケースごとの結果

「判定」は `classify-run.mjs` のものです（定義は README）。「拒否」は `permission_denials` の件数、「ファイル」は確認対象のファイルが終了時にあったか（○ あり、× なし）。`-` は該当なし、または text 形式で見えないことを表します。

| ID | 内容 | 形式 | 終了コード | subtype | is_error | 拒否 | terminal_reason | ファイル | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| H0 | 記録の確認。`node -e "process.exit(3)"` | text | 3 | - | - | - | - | - | FAILED |
| N0 | `claude --version`（実行前） | text | 0 | - | - | - | - | - | WARN |
| N1 | 知らないオプション `--no-such-flag` | text | 1 | - | - | - | - | - | FAILED |
| N2 | `-p` でプロンプトなし | text | 1 | - | - | - | - | - | FAILED |
| N3 | `--output-format` に不正な値 | text | 1 | - | - | - | - | - | FAILED |
| N4 | 存在しない会話の `--resume` | text | 1 | - | - | - | - | - | FAILED |
| N5a | 存在しない `--settings` ファイル | json | 1 | - | - | - | - | - | FAILED |
| N5b | 壊れた JSON の `--settings` ファイル | json | 0 | success | false | 0 | completed | - | OK |
| A1 | 認証なし（隔離した設定ディレクトリ） | json | 1 | success | true | 0 | api_error | - | FAILED |
| A2 | 無効な API キー（ダミー、隔離） | json | 1 | success | true | 0 | api_error | - | FAILED |
| R1 | 存在しないモデル名 | json | 1 | success | true | 0 | api_error | - | FAILED |
| M0 | 「OK とだけ返して」（陽性対照） | json | 0 | success | false | 0 | completed | - | OK |
| M1 | `--max-turns 1` で 2 ステップの依頼 | json | 1 | error_max_turns | true | 0 | max_turns | - | FAILED |
| M2 | `--max-budget-usd 0.0001` | json | 1 | error_max_budget_usd | true | 0 | budget_exhausted | - | FAILED |
| M7 | Write を許可して書かせる（陽性対照） | json | 0 | success | false | 0 | completed | ○ | OK |
| M3 | 許可なし（`default`）で Write を依頼 | json | 0 | success | false | 1 | completed | × | DEGRADED |
| M4 | `dontAsk` で Write を依頼 | json | 0 | success | false | 1 | completed | × | DEGRADED |
| M5 | モデルに `node -e "process.exit(3)"` を実行させる | json | 0 | success | false | 0 | completed | - | OK |
| M6 | サブエージェント t-echo を 1 回呼ぶ | stream-json | 0 | success | false | 0 | completed | ○（終了時、5 秒後とも） | OK |
| V1 | M1 を stream-json で | stream-json | 1 | error_max_turns | true | 0 | max_turns | - | FAILED |
| V2 | M4 を stream-json で | stream-json | 0 | success | false | 1 | completed | × | DEGRADED |
| V3 | M3 を text（既定）で | text | 0 | - | - | - | - | × | WARN |
| D1 | M1 をもう 1 回 | json | 1 | error_max_turns | true | 0 | max_turns | - | FAILED |
| D2 | M4 をもう 1 回 | json | 0 | success | false | 1 | completed | × | DEGRADED |
| N0e | `claude --version`（実行後） | text | 0 | - | - | - | - | - | WARN |

補足:

- H0 は、記録の仕組みが終了コードを正しく拾えることの確認です（`node` が 3 で終わり、3 と記録されました）。
- N0、N0e の WARN は、text 形式で `result` が見えないための判定です。`--version` は正常です。
- N1〜N5a の標準エラー出力（先頭、置換済み）:
  - N1: `error: unknown option '--no-such-flag'`
  - N2: `Error: Input must be provided either through stdin or as a prompt argument when using --print`
  - N3: `error: option '--output-format <format>' argument 'xml-no-such-format' is invalid. Allowed choices are text, json, stream-json.`
  - N4: `No conversation found with session ID: <ゼロ埋めの UUID>`
  - N5a: `Error: Settings file not found: <tmp>\...\no-such-settings.json`
  - R1: `[claude-code:unrecognized_model] {"model":"no-such-model-xyz","query_source":"sdk"}`（標準出力の JSON の `result` は、モデルに問題があるという文）
- A1 の `result` は `Not logged in · Please run /login`、A2 は `Invalid API key · Fix external API key`（`api_error_status` は 401）、R1 は `api_error_status` が 404 でした。A1、A2 のコストは 0 で、モデルの返答はありません。
- M2 は、予算 0.0001 ドルに対して、1 回分（約 0.0015 ドル）を使い切ったあとに止まりました（予算を超えた分の呼び出しは起きた）。
- M3 と M4 のモデルの返答は、どちらも「拒否された」という趣旨でした。ただし、判定の根拠は返答ではなく、`permission_denials` とファイルの有無です。
- M5 は、モデルが `node -e "process.exit(3)"` を実行し、「終了コード: 3」と報告しました。`claude` 自体は 0 で、`Bash(node -e *)` を許可していたので拒否も 0 でした。そのため `classify-run.mjs` は OK と判定します。**OK は仕事の成功を意味しません**（README）。
- M6 は、`run_in_background` が `false` のサブエージェント呼び出しで、`result` イベントは 1 個でした（`system/task_started`、`task_progress`、`task_updated`、`task_notification` のイベントは出ています）。実行前の想定「`result` イベントが複数」は、**この条件では起きませんでした**。記事 A、X が観察した「バックグラウンドのサブエージェントの完了通知で親が再開するたびに `result` が出る」ケースは、この検証では再現していません（バックグラウンドの起動は試していないため、矛盾でも否定でもありません）。
- stream-json の V2 には、`system/permission_denied` イベントが 1 個ありました（`tool_result` は `is_error` が `true`）。

## 実行前の想定との対応

想定（`cases.json` の `expect`）は、結果を見てから書き換えていません。

| ID | 想定 | 結果 |
|---|---|---|
| H0、N0、N0e | 3、0、0（2.1.293） | 一致 |
| N1、N3、N4 | 非ゼロ | 一致（1） |
| N2 | 非ゼロか、待ち続ける | 非ゼロ（1）。待ち続けなかった |
| N5a、N5b | 不明（警告か、失敗か） | N5a は失敗（1）、N5b は**黙って無視**（0）。想定した「警告」も出なかった |
| A1 | 未ログインのエラー、返答なし | 一致。ただし `subtype` は `success`、`is_error` が `true` |
| A2 | 401 | 一致（`api_error_status` 401、終了コード 1） |
| R1 | API のエラー（終了コードは不明） | 404、終了コード 1 |
| M0、M7 | 成功、拒否 0 | 一致 |
| M1 | `error_max_turns`（終了コードは不明） | 一致。終了コード 1 |
| M2 | 予算超過の subtype（名前は不明） | `error_max_budget_usd`、終了コード 1。1 回分を超えた |
| M3 | 終了コード 0、success、`is_error` false、拒否 1 以上 | 一致 |
| M4 | 不明（#76867 は終了コード 0 の報告） | 終了コード 0、拒否 1。#76867 と同じ向き |
| M5 | `claude` は 0、`is_error` false、モデルは失敗を報告 | 一致 |
| M6 | `result` が複数 | **不一致**（1 個。フォアグラウンドの呼び出しだったため） |
| V1、V2、V3、D1、D2 | M1、M4、M3 と同じ | 一致 |

## 判定の確認（fixtures）

`node classify-run.mjs --check-fixtures fixtures` の結果: 26 個すべてが期待どおり（不一致 0 件）。終了コードは 0。

- 実測 19 個: H0 を除く、N0、N1〜N5b、A1、A2、R1、M0、M1、M2、M3、M4、M7、V1、V2、V3 から選んだもの（`fixtures/expected.json` に元のケースを書いている）。
- 合成 7 個（実測ではない）: タイムアウト、終了コード 0 で `is_error` が `true`、終了コード 0 で `subtype` が `success` でない、成功の形だが標準エラー出力あり、`result` が 2 個、JSON として読めない、stream-json の拒否。終了コード 0 で `is_error` が `true` の形は、2.1.293 では観測していません。判定の規則を確かめるためだけの合成です。
- 保存前に、`sk-ant-`、`Bearer `、`eyJ`、メールアドレスの形が残っていないことを `redact.mjs` の検査で確かめました（問題なし）。ユーザー名、メールアドレス、ローカルの絶対パスが残っていないことは、`grep` でも確かめました。
- json 形式の fixture は `result` オブジェクトから判定に使う項目（`type`、`subtype`、`is_error`、`api_error_status`、`stop_reason`、`terminal_reason`、`num_turns`、`total_cost_usd`、`permission_denials`、`result`）だけを残しています。`usage`、`modelUsage`、`session_id`、`uuid` などは落としています。stream-json の fixture は `result` イベントだけです。

## 認証情報ファイルのメタデータ（内容は表示も保存もしていない）

認証情報ファイルは、各時点の更新日時とサイズだけを比べました。内容は表示も保存もしていません（例外として、読み出して `/dev/null` に捨てる操作が 1 回あります。「計画からの変更点」を参照）。

- 比べた時点: 開始時（baseline）、A 群の直前、A1 の直後、A2 の直後、全ケースの終了後。
- サイズは、すべての時点で同じでした。
- baseline から A 群の直前までの間に、更新日時が変わっています。A 群の実行より前なので、A 群が原因ではありません。この間に実行したのは、N 群と、本物の認証でモデルを呼んだ N5b、そして並行して動いていた親セッション（Claude Code 自体）です。トークンの更新（通常の動作と思われます）の可能性が高いですが、どの実行で変わったかは区別できていません。
- A 群の直前から全ケースの終了後まで（本物の認証でモデルを呼んだ 13 回を含む）、更新日時とサイズは変わっていません。
- `claude logout`、`/login`、設定の削除はしていません。

## 子プロセスに渡した環境変数の名前（値は記録していない）

許可リスト方式で、渡したのは次の名前だけです: `PATH`、`SystemRoot`、`windir`、`USERPROFILE`、`HOME`、`HOMEDRIVE`、`HOMEPATH`、`APPDATA`、`LOCALAPPDATA`、`TEMP`、`TMP`、`ComSpec`、`PATHEXT`、`ProgramFiles`、`ProgramFiles(x86)`、`ProgramData`、`CLAUDE_CODE_GIT_BASH_PATH`、`DISABLE_AUTOUPDATER`。

これに加えて、A1、A2 だけ `CLAUDE_CONFIG_DIR`（空の使い捨てディレクトリ）、A2 だけ `ANTHROPIC_API_KEY`（実行時に組み立てた明らかなダミー。値は表示していません）を渡しました。

`ANTHROPIC_*`、`CLAUDE_CODE_OAUTH_TOKEN` などの認証に関わる変数は、親の環境にあっても、渡していません。そのため、R1 から D2 までは、サブスクリプションの認証で動いています。

## 確認していないこと

- 終了コード 0 で `is_error` が `true`、あるいは `subtype` が `success` でない実行（観測できなかった）。
- タイムアウトによる強制終了（`run-case.mjs` は記録できる作りだが、今回のケースでは起きなかった）。シグナルによる終了。
- 認証の失敗以外の API エラー（429 のレート制限、5xx、ネットワーク断）。意図的に起こしていません。
- バックグラウンドのサブエージェントを起動したときの `result` の個数と終了コード（M6 はフォアグラウンドのみ）。
- `--output-format json` で `result` が配列になる場合（今回は単一のオブジェクトだった。`classify-run.mjs` は配列も読める）。
- `--permission-mode bypassPermissions`、`--dangerously-skip-permissions`（使わない方針）。
- `--allowedTools` の指定で許可が効いた場合の、拒否の有無の細かい条件（M7 の 1 通りだけ）。
- Windows 以外の OS、2.1.293 以外の版、API キー認証での本番利用、Bedrock・Vertex 経由。
- 公式ドキュメントとの突き合わせは、この記録ではしていません（観測だけを書いています）。記事のレビュー（2026-10-12）で headless・CLI reference・permissions の各ページと照らし、矛盾がないことを確認しました。
- モデルの振る舞いが絡むケース（拒否後の返答、M5 の報告）は、1〜3 回の実行です。

## 計画からの変更点

- N5 を N5a（存在しない設定ファイル）と N5b（壊れた JSON）に分けた。計画の起動 23 回は N5 を 1 回と数えていたため、実際は 24 回になり、N0e を足して 25 回（上限）になった。予備は残っていない。
- 計画のモデルの推論を伴う実行は 13 回（M 群 8、V 群 3、D 群 2）の想定だったが、N5b がモデルを呼んだため 14 回になった（上限 15 の内）。
- 集計の修正: 最初の実装は、モデルに届かない可能性のあるケース（N5a）を「モデルを使った実行」に数えていた。「宣言がモデル、またはコストが 0 より大きい」実行だけを数えるよう、実行の途中で `run-case.mjs` を直した（実行したケースの結果には影響しない）。
- `redact.mjs`、`make-fixtures.mjs` を追加した（計画の付属物の一覧にはなかった）。`LICENSES.md` も追加した。
- `classify-run.mjs` の出力に `terminal_reason`、`api_error_status` を足した（判定の規則は変えていない）。
- 認証情報ファイルを読み出して `/dev/null` に捨てるコマンドを 1 回実行した。表示も保存もしていない（更新日時とサイズだけを見る方針の例外）。
- 上記以外の計画の操作は、計画どおりに行った。7-5 節の止める条件（想定外の 401・403・429・割り当て超過、版の変化、A 群をまたぐ認証情報ファイルの変化、保存ファイルへのトークンらしい文字列の残留、上限への到達）には、実行中に当たらなかった。

## 後始末

生の出力と使い捨てのディレクトリ（`os.tmpdir()` の下の `claude-exit-codes-run`）は、この記録を書いたあとに削除しました。
