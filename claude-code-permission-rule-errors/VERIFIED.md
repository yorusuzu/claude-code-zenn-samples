# 動作確認の記録（不正な権限ルールの警告と deny の実効）

この記録は E3、E4、E5 の範囲を扱う。

- E3: 実行の土台（run-case.mjs、extract-warnings.mjs、cases.json、rules.json）の作成と、N0、H0、H1、M1〜M7 の実測。この節から「計画からの変更点」「後始末」までが E3 の記録。
- E4: W01〜W26 を `claude doctor` で実測した。記録は末尾の「E4: W 群（claude doctor）」の節にある。
- E5: D01〜D19 を `claude -p`（haiku）で実測した。記録は末尾の「E5: D 群（壊れたルールが実際に効くか）」の節にある。

## W 群の経路の判定（E3 の結論）

**W 群はモデルなしで実行できる。経路は `claude doctor`（cases.json の `wBranch: "doctor"`）。**

- `claude doctor` を隔離した `CLAUDE_CONFIG_DIR` で実行した（M2a）。結果は次のとおり。
  - 対話端末は要らない（標準入力は空文字列）。ハングもしない。
  - 終了コード 0、約 1.2 秒で終わる。
  - 不正なルールは、標準出力の「Invalid settings」の節に出た。文言は「Invalid permission rule ... was skipped: Malformed ...」。
- `-p` の経路では、どの形でも警告は出なかった（M3a、M3b、M4、M7a、M5、M6）。
  - モデルなしの 4 件（M3a、M3b、M4、M7a）は認証エラー（`Not logged in · Please run /login`）で終わる。
  - モデルあり（M5、M6）は正常に応答した。標準エラー出力は 0 バイト。stream-json にもデバッグ出力にも、警告は出なかった。
  - 2.1.293 の `-p` は、不正なルールについて黙っている。
- この結果は、計画 14-2 節 7 項（doctor を第一経路にする）と合う。
- W 群のケースの引数は、`["doctor"]` に置き換え済み（`@W`、`@W-user`）。

E4 に入る前に分かっていないことは次の 3 点（E4 の結果は末尾の節。B4・B5 は doctor に出ず、local と user は出た）。

- doctor が、未知のツール名（B4）と途中の `:*`（B5）の起動時警告を出すか。
- doctor が、local スコープ（`.claude/settings.local.json`）と user スコープ（隔離した `CLAUDE_CONFIG_DIR/settings.json`）を読むか。
- doctor は、不正な設定があっても終了コード 0 を返す。「警告が出たか」は、終了コードではなく標準出力で判定する必要がある。

## 環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| シェル | Git Bash（run-case.mjs は `spawnSync` で直接起動し、シェルを介さない） |
| Node.js | v24.18.0 |
| Claude Code | 2.1.293（`claude --version` の出力は `2.1.293 (Claude Code)`。実行の前（N0a）と後（N0b）で同じ） |
| claude の場所 | `<home>\.local\bin\claude.exe`（PATH に入っていない。run-case.mjs の `findClaude` がこの場所を探す） |
| 実行日時 | 2026-10-17 15:34〜15:37 UTC（2026-10-18 00:34〜00:37 JST） |
| モデル | haiku（M5、M6 だけ。`--max-turns 1`、`--max-budget-usd 0.2`） |
| 作業ディレクトリ | `os.tmpdir()` の下の使い捨てディレクトリ。生の出力もそこに置き、リポジトリには置かない |

## 実行した回数とコスト（実数）

ledger.jsonl の集計（`node run-case.mjs --status`）は次のとおり。

| 範囲 | 起動 | うち claude | モデル実行 | total_cost_usd の合計 |
|---|---|---|---|---|
| E3 | 14 / 25 | 12 | 2 / 4 | 0.00293256 |
| 全体 | 14 / 80 | 12 | 2 / 30 | 0.00293256 / 0.5 |

- 再実行は 0 回。
- タイムアウトは 0 回。
- M3c と M7b は実行していない（後述）。

## ケースごとの結果

- 「隔離」は、`CLAUDE_CONFIG_DIR` を使い捨てのディレクトリに向けたことを表す。
- 「隔離なし」の claude は `--setting-sources project,local` で起動した。ユーザー設定は読ませていない。
- B1 は、括弧の閉じ忘れの deny `Bash(npm run *` を表す。V0 は、有効な deny `Bash(npm run *)` を表す。

| ケース | コマンド（要点） | 置いた設定 | 終了 | 所要 | stdout | stderr | 警告 |
|---|---|---|---|---|---|---|---|
| N0a | `claude --version` | なし | 0 | 272 ms | `2.1.293 (Claude Code)` | 0 B | — |
| H0 | `node -e "process.exit(3)"` | なし | 3 | 62 ms | 0 B | 0 B | —（終了コード 3 が記録された） |
| H1 | `node -e "console.error('x')"` | project deny B1 | 0 | 53 ms | 0 B | `x\n`（2 B） | —（stderr だけに入り、`.claude/settings.json` が書かれた） |
| M1 | `claude --version` | project deny B1 | 0 | 45 ms | `2.1.293 (Claude Code)` | 0 B | なし |
| N2 | `claude --help` | なし | 0 | 535 ms | 22116 B | 0 B | — |
| M2a | `claude doctor`（隔離） | project deny B1 | 0 | 1218 ms | 1706 B | 0 B | **stdout の「Invalid settings」に 1 件** |
| M2b | `claude doctor`（隔離） | project deny V0 | 0 | 1054 ms | 1329 B | 0 B | なし（M2a との差分は Invalid settings の節だけ） |
| M3a | `claude -p ... --output-format stream-json --verbose x`（隔離） | project deny B1 | 1 | 1533 ms | stream-json 3 イベント | 0 B | なし |
| M3b | `claude -p ... --output-format text x`（隔離） | project deny B1 | 1 | 1269 ms | `Not logged in · Please run /login` | 0 B | なし |
| M4 | `claude -p ... --output-format text /doctor`（隔離） | project deny B1 | 1 | 1333 ms | `Not logged in · Please run /login` | 0 B | なし |
| M7a | `claude -p --bare --settings <ファイル> ... --output-format text x`（隔離） | `--settings` のファイルに deny B1 | 1 | 1194 ms | `Not logged in · Please run /login` | 0 B | なし |
| M5 | `claude -p --model haiku ... --output-format stream-json --verbose "OK とだけ返して"` | project deny B1 | 0 | 3960 ms | stream-json 4 イベント、result `OK` | 0 B | なし |
| M6 | M5 に `--debug-file <ファイル>` を足したもの | project deny B1 | 0 | 3428 ms | M5 と同じ形 | 0 B | なし（デバッグ出力 177 行にも警告らしい行は 0 件） |
| N0b | `claude --version` | なし | 0 | 66 ms | `2.1.293 (Claude Code)` | 0 B | — |

補足は次のとおり。

- M3a
  - stream-json のイベントは system/init、assistant、result/success の 3 つ。
  - result は `is_error: true`、`terminal_reason: api_error`、`total_cost_usd: 0`。本文は `Not logged in · Please run /login`。
  - init の版の項目名は `version` ではなく `claude_code_version`（値は 2.1.293）。extract-warnings.mjs はこれを読むように直した。
- M4
  - `-p` に `/doctor` を渡しても、doctor は動かなかった。M3b と同じ認証エラーの文言で終わった。
  - スラッシュコマンドとして処理される前に、認証の確認で止まったと読める（推測）。
- M5、M6
  - イベントは init、assistant、rate_limit_event（status allowed）、result/success。
  - init にも result にも、警告らしい文字列はない。
  - コストはどちらも 0.00146628 USD。
- M6 のデバッグ出力は、生の出力を作業ディレクトリに置いたままにした。リポジトリには入れていない。
  - 設定ファイルの読み込みや監視の行はあった。プロジェクトの `.claude/settings.json` を読んだことは分かる。
  - ただし、不正なルールに触れた行はなかった。
  - アカウントの種類やモデル名などの行も含むため、リポジトリには入れない。
- M7a（PM の追加依頼。`--bare --settings`）
  - 2.1.300 の Linux では、認証エラーの前に標準エラー出力へ警告が出たと報告されている。
  - 2.1.293 の Windows では、標準エラー出力は 0 バイトで、警告は出なかった。
  - 2.1.299 の `-p` の stderr の修正より前の版なので、その差かもしれない。これは推測で、確かめていない。

### 警告の文言（一字一句。出た場所は M2a の標準出力）

```
Invalid settings
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal
```

- 置換したのはパスの前半（`<work>`）とケースのディレクトリ名（`<case>`）だけ。それ以外は出力のまま。
- 行の形は「設定ファイルのパス › `permissions.deny`: 文言」。どのファイルの、どの配列かが分かる。
- docs（E1 の A1）の文言と比べると、`Malformed Tool(content) rule.` の後ろに `Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal` が続く。2.1.293 の doctor の文言は、docs より長い。
- doctor の最後の `2 warnings found` に、Invalid settings は数えられていない。
  - 数えられているのは次の 2 件。
    - PATH に `<home>\.local\bin` がないこと。筆者の PATH に `<home>\.local\bin` が入っていないため（run-case.mjs は PATH を値を変えずに渡す。2026-10-18 の QA で、run-case.mjs を介さずに実行しても同じ警告が出ることを確認。当初「この検証の副作用」と書いていたのは誤り）。
    - install method が `not set` であること。
  - 「warnings found の件数で判定する」と、不正なルールを見落とす。
- doctor の出力には、ほかに次の行がある。どれも警告とは関係しない。
  - 隔離した設定でサインインしていないことによる `Managed settings (remote): not fetched — ...`。
  - Remote Control の節（`Not signed in to claude.ai` など）。
- 標準出力の全文（置換済み）は `fixtures/M2a.stdout.txt` に置いた。対照は `fixtures/M2b.stdout.txt`。

### `--help` で確かめたこと（N2）

- 次のオプションは help に載っている。
  - `--tools`、`--allowedTools`、`--bare`、`-d/--debug`、`--debug-file`
  - `--no-session-persistence`、`--setting-sources`、`--settings`、`--strict-mcp-config`、`--restricted`
- `--max-turns` は help に載っていない（0 件）。それでも M5 と M6 では受け付けられた。
- `doctor` の説明行の要点は、カレントディレクトリの設定ファイルを trust の確認なしで読む、というもの。全文は help の出力にある。M2a の結果と合う。
- `--bare` の説明では、認証は `ANTHROPIC_API_KEY` か `--settings` の apiKeyHelper に限られる（OAuth とキーチェーンは読まない）。M7a が認証エラーで終わったことと合う。

## 認証情報ファイルのメタデータ

中身は読んでいない。比べたのは、更新日時とサイズだけ。

| ファイル | 実行の前 | 実行の後 | 扱い |
|---|---|---|---|
| 認証情報ファイル | 519 B、2026-10-16T08:38:34.647Z | 519 B、2026-10-17T15:36:19.615Z | **更新日時が変わった（止める条件）** |
| ユーザー設定（`~/.claude/settings.json`） | 329 B、2026-08-24T08:28:44.653Z | 329 B、2026-08-24T08:28:44.653Z | 変化なし |
| `~/.claude.json`（参考） | 78125 B、2026-10-17T15:12:20.276Z | 77660 B、2026-10-17T15:36:32.785Z | 参考のみ（CLI が普段から書き換える） |

- 認証情報ファイルの更新日時は 15:36:19.615Z。
  - M5（隔離なしでモデルを使った実行。15:36:17.95〜15:36:21.91）の最中にあたる。
  - OAuth のトークンの更新と考えられる。これは推測で、中身は見ていない。
  - 隔離した実行（M2〜M4、M7a）は、本物の設定を読まない。
- `samples/claude-code-subagent-errors/VERIFIED.md` にも、同じ現象の記録がある。
- ledger には stop「credentials の更新日時またはサイズが変わった」を記録した。
  - E3 の実行はすべて、この stop より前に終わっている。
  - E4 以降に進むには、`node run-case.mjs --resume-after-stop --reason <理由>` で再開を記録する必要がある。
  - E4 の前に、PM の判断で再開を記録した。止める条件も変えた（末尾の E4 の節）。

## 子プロセスに渡した環境変数の名前

値は表示も記録もしていない。渡したのは許可リストの名前だけ。

`APPDATA`、`CLAUDE_CODE_GIT_BASH_PATH`、`ComSpec`、`DISABLE_AUTOUPDATER`、`HOME`、`HOMEDRIVE`、`HOMEPATH`、`LOCALAPPDATA`、`PATH`、`PATHEXT`、`ProgramData`、`ProgramFiles`、`ProgramFiles(x86)`、`SystemRoot`、`TEMP`、`TMP`、`USERPROFILE`、`windir`

- 隔離するケースでは、これに `CLAUDE_CONFIG_DIR`（使い捨てのディレクトリ）を足した。
- `DISABLE_AUTOUPDATER` は、run-case.mjs が子プロセスにだけ設定する。CLI の更新を防ぐため。

## managed settings と親ディレクトリの確認（`--preflight`）

- managed settings
  - Windows の既定の場所のファイルは、どれも存在しなかった。
  - レジストリ（HKLM / HKCU の Policies のキー）も、どれも存在しなかった。
  - 確かめたのは存在だけで、中身は読んでいない。
- 使い捨てディレクトリの親をたどったところ、見つかったのは `<home>\.claude` だけだった。
  - これはユーザー設定のディレクトリとして想定どおり。
  - 想定外の `.claude` や `CLAUDE.md` は 0 件。
  - 確かめたのは名前だけ。

## fixtures の確認

`fixtures/` には、置換済みの出力 4 ケース分（stdout と stderr）を置いた。

| ファイル | 内容 | `node extract-warnings.mjs fixtures/<ケース>` の結果 |
|---|---|---|
| `M2a.*` | doctor、deny B1 | stdout の警告らしい行 2 件（`Invalid settings` と本文）、Invalid permission rule 1 回。stderr 0 B |
| `M2b.*` | doctor、deny V0（対照） | 警告らしい行 0 件 |
| `M3b.*` | `-p` の text 出力、deny B1 | 警告らしい行 0 件。stdout は認証エラーの 1 行 |
| `M7a.*` | `-p --bare --settings`、deny B1 | 警告らしい行 0 件。stdout は認証エラーの 1 行 |

- 置換は次の順に行った。
  1. redact.mjs の置換。
  2. 作業ディレクトリの前半を `<work>` に、ケースのディレクトリ名を `<case>` にする置換。
- 保存の前に `scanResidue` で、トークンらしい形が残っていないことを確かめた。
- M3a、M5、M6 の stream-json とデバッグ出力は置いていない。セッション ID、アカウントの種類、利用枠の情報を含むため。

## 確認していないこと

- **M3c、M7b**（M3b、M7a の V0 の対照）は実行していない。
  - 対象の経路で、B1 でも警告が出なかった。対照を取る意味がないと判断した（起動回数の節約）。
- **doctor が B4（未知のツール名）と B5（途中の `:*`）を報告するか**。E4 の W06、W07 で確かめる。
  - E4 で確認済み。どちらも doctor には出なかった（末尾の E4 の節）。
- **doctor が local スコープと user スコープを読むか**。
  - 見るのは W16〜W21。user は、隔離した `CLAUDE_CONFIG_DIR/settings.json` で確かめる。
  - help の説明行は「カレントディレクトリの設定ファイル」なので、user スコープは報告されない可能性がある。
  - E4 で確認済み。local も user も、doctor の Invalid settings に出た（末尾の E4 の節）。
- **対話セッションの `/doctor`**。
  - 対話端末が要るため、実行していない。
  - `-p "/doctor"` は、認証エラーで終わった（M4）。
- **対話セッションの起動時に、警告が画面に出るか**。対話端末が要るため、実行していない。
- **不正な deny が実際に効くか**（D 群）。E5 の範囲で、まだ実行していない。
  - このため、記事 X（deny と ask は trust に影響されない）や記事 A の deny の実測と矛盾するかどうかは、まだ分からない。
  - E3 の結果に、それらと矛盾する点は見つかっていない。
- 2.1.293 以外の版。CLI の更新はしていない。
- macOS、Linux。

## 計画からの変更点

1. **N2（`claude --help`）を足した。** 計画 6-2 節の help の確認を、ケースとして記録するため。
2. **M7a / M7b（`--bare --settings`）を足した。** PM の追加依頼による。M7b は実行していない。
3. **W 群の経路を doctor にした**（`wBranch: "doctor"`）。
   - W のケースの引数は、`-p ... x` から `["doctor"]` に変えた（末尾の `x` は外した）。
   - モデルを使う形は、参考として `@W-if-model` に残した。
   - 元に戻す方法は、cases.json の `_note` に書いた。
4. **プリセットの並びを変えた。**
   - `@nomodel` は `-p` の後ろに置く形にした。
   - `--max-turns` は、help に載っていないが受け付けられるので、そのまま使っている。
5. **`--dry-run` は範囲の確認から外した。** E4、E5 のケースも、展開した引数と書く設定を実行前に確かめられる。実際の実行は、今も `ACTIVE_PHASES`（E3）に限っている。
6. **extract-warnings.mjs に、text 出力の標準出力から警告らしい行を拾う処理を足した。** doctor は stream-json ではないため。
7. **init の版の項目名を直した。** `version` ではなく `claude_code_version` を読む。

## 後始末

- 使い捨ての作業ディレクトリ（`<tmp>` の下の `e3/run/`、ドライラン用の `e3/dry/`、`e3/run-dry4/`）は、セッションのスクラッチパッドにある。セッションの終了とともに消える。
- リポジトリに置いたもの
  - スクリプト
  - 定義（`cases.json`、`rules.json`）
  - ダミーのファイル（`lab/zone/secret-*.txt`）
  - 置換済みの fixtures
  - この記録と README、LICENSES
- ユーザー設定（`~/.claude/settings.json`）は読んでいないし、変更もしていない。更新日時とサイズは変わっていない。
- CLI の更新・インストール、git の commit・push はしていない。

---

# E4: W 群（claude doctor）

W01〜W26 を `claude doctor` で 1 回ずつ実行した。`CLAUDE_CONFIG_DIR` は使い捨てのディレクトリに向け、モデルは呼んでいない。`-p` も使っていない。

## E4 の結論

ここは事実（実測）だけを書く。推測は「期待との違い」の節で分けて書く。

- **doctor が報告したもの**
  - 次の 7 種類のルールが、標準出力の「Invalid settings」の節に 1 行ずつ出た。
    - 閉じ忘れ（B1）、空の括弧（B2）、ツール名の小文字（B3）、空文字列（B7）
    - 括弧付きの MCP ルール（B9）、閉じ括弧の後ろに文字（B10）
    - 配列ではなく文字列（W24）
  - JSON として読めないファイル（W25）も、同じ節に出た。
  - 文言は、ほとんどが「<ファイル> › permissions.<配列>: Invalid permission rule "<ルール>" was skipped: <理由>」の形。W24 と W25 は形が違う（後述）。
- **doctor が報告しなかったもの**（「doctor では見えなかった」）
  - ツール名の綴り違い（B4、W06）、途中の `:*`（B5、W07）、全角括弧（B6、W08）、余分な閉じ括弧（B8、W10）。
  - この 4 件の標準出力は、有効なルール V0（W01）の標準出力とバイト単位で同じだった。
- **置き場所と配列**
  - local（`.claude/settings.local.json`）も user（隔離した `CLAUDE_CONFIG_DIR/settings.json`）も、doctor は読んで報告した。
  - allow、ask、deny のどの配列でも、文言は同じ。違うのは `permissions.allow` などの配列名だけ。
- **ほかのルールと同じファイルに書いたとき**
  - 不正なルールだけが 1 行ずつ出た。
  - W23（B1 と有効な V0）の標準出力は、パスのケース名を除いて W03（B1 だけ）と同じだった。
  - ファイル全体が無効とは書かれていない。V0 が効くかどうかは、doctor の出力からは分からない。
- **終了コードと件数**
  - 26 件すべてで、終了コードは 0、標準エラー出力は 0 バイトだった。
  - 最後の `2 warnings found` は 26 件すべて同じで、Invalid settings の項目は数えられていない。

## E4 の環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Node.js | v24.18.0 |
| Claude Code | 2.1.293（doctor の `Running: native (2.1.293)`。E3 から更新していない） |
| 実行日時 | 2026-10-17 15:47〜15:48 UTC（2026-10-18 00:47〜00:48 JST） |
| 経路 | `claude doctor`（引数はこれだけ）。隔離した `CLAUDE_CONFIG_DIR`、モデルなし |
| 作業ディレクトリ | セッションのスクラッチパッドの使い捨てディレクトリ（`<work>`）。生の出力もそこに置き、リポジトリには置かない |
| ledger | E3 の `ledger.jsonl` をコピーして引き継いだ（回数とコストの上限は通算）。E3 の ledger 自体は変えていない |

## 実行前に行ったこと

1. **止める条件を変えた**（計画 14-4 節 5 項、PM の判断）。

   | ファイル | 止める条件 | それ以外の変化 |
   |---|---|---|
   | 認証情報ファイル | 有無かサイズが変わったとき | 更新日時だけの変化は ledger に記録だけする |
   | ユーザー設定（`~/.claude/settings.json`） | 有無、更新日時、サイズのどれかが変わったとき | （変えていない） |
   | `~/.claude.json` | 止めない（参考の記録だけ） | — |

   - 比べる相手は、同じファイルの直前の `cred-stat` の記録。最初の記録ではない。
   - claude を起動するたびに、終わった後でこの比較をして ledger に書く（`after:<タグ>`）。
   - 中身は読まない。比べるのは stat の有無、サイズ、更新日時だけ。
   - 変えたあとの動きは、偽のホームディレクトリ（本物のファイルには触れていない）で 5 通り確かめた。
     - 最初の記録
     - 認証情報の更新日時だけの変化（記録だけ）
     - 認証情報のサイズの変化（止まる）
     - ユーザー設定の更新日時だけの変化（止まる）
     - 変化なし
2. **E3 の stop を解除した。** `--resume-after-stop` で再開を記録した。理由は「E3 の M5（隔離なし・モデルあり）での OAuth 更新による更新日時の変化。PM 判断で再開（14-4 節 5 項）」。
3. **範囲を E4 にした。** `ACTIVE_PHASES = ["E4"]`、E4 の上限は起動 35 回・モデル実行 0 回。E3 と E5 のケースは拒否されることを確かめた（D01、M2a で「今回の範囲は E4 だけです」、終了コード 1。claude は起動しない）。
4. **`--preflight`** の結果は次のとおり。
   - managed settings は 0 件。
   - 親ディレクトリで見つかったのは `<home>\.claude` だけ。
   - E3 と同じ結果。
5. **ドライラン**（W01、W16、W19、W22、W24、W25、W26）で、展開した引数と書き込む設定を確かめた。
   - ドライランは、別の使い捨てディレクトリで行った。
   - ドライランも作業フォルダを作るので、同じディレクトリで行うと、本番の実行が「既にあります」で止まる。

## E4 の回数とコスト（実数）

| 範囲 | 起動 | うち claude | モデル実行 | total_cost_usd の合計 |
|---|---|---|---|---|
| E4 | 26 / 35 | 26 | 0 / 0 | 0 |
| 全体（E3 + E4） | 40 / 80 | 38 | 2 / 30 | 0.00293256 / 0.5 |

- 再実行は 0 回。
- タイムアウトは 0 回。
- stop は 0 回。
- 所要時間は 1 件あたり 1047〜1657 ms。

## E4 のケースごとの結果

- 列の意味は次のとおり。
  - 「節」は、標準出力に「Invalid settings」の節があったかどうか。
  - 「項目」は、その節の行の数。
  - 全件で、終了コードは 0、標準エラー出力は 0 B、`warnings found` は 2 だった。
- 「理由」は、文言の `was skipped:` より後ろの部分。全文は次の「文言」の節と fixtures にある。

| ケース | ルール | 置き場所 | 配列 | 節 | 項目 | 理由（要点） | stdout |
|---|---|---|---|---|---|---|---|
| W01 | V0 `Bash(npm run *)` | project | deny | なし | 0 | — | 1329 B |
| W02 | V1 `Bash(npm run:*)` | project | deny | なし | 0 | — | 1329 B |
| W03 | B1 `Bash(npm run *` | project | deny | あり | 1 | Malformed Tool(content) rule. ... | 1706 B |
| W04 | B2 `Bash()` | project | deny | あり | 1 | Empty parentheses. ... | 1633 B |
| W05 | B3 `bash(npm run *)` | project | deny | あり | 1 | Tool names must start with uppercase. Use "Bash" | 1608 B |
| W06 | B4 `Bsah(npm run *)` | project | deny | **なし** | 0 | doctor では見えなかった | 1329 B |
| W07 | B5 `Bash(npm run:* test)` | project | deny | **なし** | 0 | doctor では見えなかった | 1329 B |
| W08 | B6 `Bash（npm run *）`（全角括弧） | project | deny | **なし** | 0 | doctor では見えなかった | 1329 B |
| W09 | B7 `""` | project | deny | あり | 1 | Permission rule cannot be empty | 1576 B |
| W10 | B8 `Bash(npm run *))` | project | deny | **なし** | 0 | doctor では見えなかった | 1329 B |
| W11 | B9 `mcp__srv__tool(arg)` | project | deny | あり | 1 | MCP rules do not support patterns in parentheses. ... | 1690 B |
| W12 | B1 | project | allow | あり | 1 | Malformed（W03 と同じ） | 1707 B |
| W13 | B1 | project | ask | あり | 1 | Malformed（W03 と同じ） | 1705 B |
| W14 | B3 | project | allow | あり | 1 | uppercase（W05 と同じ） | 1609 B |
| W15 | B3 | project | ask | あり | 1 | uppercase（W05 と同じ） | 1607 B |
| W16 | B1 | local | deny | あり | 1 | Malformed。ファイルは `settings.local.json` | 1712 B |
| W17 | B1 | local | allow | あり | 1 | 同上 | 1713 B |
| W18 | B1 | local | ask | あり | 1 | 同上 | 1711 B |
| W19 | B1 | user | deny | あり | 1 | Malformed。ファイルは隔離した `CLAUDE_CONFIG_DIR\settings.json` | 1698 B |
| W20 | B1 | user | allow | あり | 1 | 同上 | 1699 B |
| W21 | B1 | user | ask | あり | 1 | 同上 | 1697 B |
| W22 | B1 + B3 | project | deny | あり | 2 | Malformed の行と uppercase の行（配列の順） | 1967 B |
| W23 | B1 + V0 | project | deny | あり | 1 | B1 の Malformed だけ。V0 の行はない | 1706 B |
| W24 | V0 を文字列で（配列ではない） | project | deny | あり | 1 | Expected array, but received string（+ Suggested fix） | 1715 B |
| W25 | 壊れた JSON（末尾カンマ） | project | — | あり | 1 | Invalid or malformed JSON | 1509 B |
| W26 | B10 `Bash(ls) x` | project | deny | あり | 1 | Malformed Tool(content) rule. ... | 1702 B |

- W06、W07、W08、W10 の標準出力は、W01 とバイト単位で同じだった（W02 も同じ）。
- W23 の標準出力は、パスのケース名を除いて W03 と同じだった。
- W08 で書いたルールは U+FF08 と U+FF09（全角括弧）を含む。書いたファイルの中身で確かめた。

## 文言（一字一句。2.1.293 の doctor の標準出力）

- 置換したのは、パスの前半（`<work>`）とケースのディレクトリ名（`<case>`）だけ。
- `›` は U+203A。

```
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "Bash()" was skipped: Empty parentheses. Either specify a pattern or use just "Bash" without parentheses
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "bash(npm run *)" was skipped: Tool names must start with uppercase. Use "Bash"
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "" was skipped: Permission rule cannot be empty
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "mcp__srv__tool(arg)" was skipped: MCP rules do not support patterns in parentheses. Use "mcp__srv__tool" without parentheses, or use "mcp__srv__*" for all tools
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "Bash(ls) x" was skipped: Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal
- <work>\cwd\<case>\.claude\settings.local.json › permissions.deny: Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal
- <work>\cfg\<case>\settings.json › permissions.deny: Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Expected array, but received string
  Suggested fix: Permission rules must be in an array. Format: ["Tool(specifier)"]. Examples: ["Bash(npm run build)", "Edit(docs/**)", "Read(~/.zshrc)"]. Use * for wildcards.
- <work>\cwd\<case>\.claude\settings.json: Invalid or malformed JSON
```

- B10（W26、docs の例そのまま）の文言は、B1 と同じ長い形。
  - docs（E1 の A1）の文言 `Invalid permission rule "Bash(ls) x" was skipped: Malformed Tool(content) rule` は、この行の前半と一致する。
  - 2.1.293 の doctor は、その後ろに形の説明を続ける。
- W24 の行には、`Invalid permission rule ... was skipped` がない。型の誤りとして出る。2 行目は字下げした `Suggested fix:`。
- W25 の行には、`› permissions...` の部分がない。ファイル単位で出る。
- doctor の出力には、Error（ファイル全体）と Warning（エントリのスキップ）の区別の表示がない（docs の A8 にある区分）。W24 と W25 の項目も、ほかの項目と同じ「- 」の箇条で出た。

## 期待との違い（rules.json と cases.json の、実測前の期待との比較）

| ルール | 実測前の期待 | 実測（doctor） | 一致 |
|---|---|---|---|
| V0、V1 | 警告なし | なし | 一致 |
| B1 | Malformed の警告 | Malformed（長い文言） | 一致 |
| B2 | 不明 | Empty parentheses でスキップ | （期待なし） |
| B3 | 不明 | Tool names must start with uppercase でスキップ。Malformed ではない | （期待なし） |
| B4 | 未知のツール名の警告（文言は実測） | **なし** | **不一致**（doctor では見えなかった） |
| B5 | Malformed ではない別の起動時警告 | **なし** | **不一致**（doctor では見えなかった。Malformed でもない点は一致） |
| B6 | 不明 | なし | （期待なし） |
| B7 | 不明 | Permission rule cannot be empty でスキップ | （期待なし） |
| B8 | 不明（「閉じ括弧の後ろに文字がある型に近い」は推論） | **なし** | 推論とは違った |
| B9 | スキップ（文言は実測） | MCP rules do not support patterns in parentheses でスキップ | 一致 |
| B10 | Malformed（docs の例の文言） | Malformed。docs の文言の後ろに説明が続く | 一致（文言は docs より長い） |
| W23 | 有効なルールの隣でも B1 だけか | B1 だけ | 一致 |
| W24 | ルール単位とは別の文言が出るか | 型の誤りの文言（Expected array） | 別の文言が出た |
| W25 | ルールの警告とは別物 | ファイル単位の文言（Invalid or malformed JSON） | 別の文言が出た |

ここからは推測で、確かめていない。

- B4 と B5 の起動時警告は、docs（A10、A17）では「起動時」に出るとされる。doctor の Invalid settings とは別の仕組みで、対話の起動時にだけ出る可能性がある。
- B6（全角括弧）は、`(` を含まないので、全体が 1 つのツール名と読まれた可能性がある。そうなら B4 と同じ「未知のツール名」の扱いになる。
- B8（余分な `)`）は、`Bash(` の後ろから最後の `)` までが中身と読まれた可能性がある。docs の「中の括弧は文字どおり」（A2）に従うと、中身は `npm run *)` になる。そうなら有効なルールとして読まれ、`npm run` には一致しない。
- W24 は、deny の配列全体が使われない可能性がある。W25 は、ファイル全体が使われない可能性がある。どちらも D 群で確かめないと分からない。

## fixtures と check-fixtures.mjs

`fixtures/` に、置換済みの doctor の標準出力を 17 件足した。

- 対象は W01、W03〜W11、W16、W19、W22〜W26。
- 標準エラー出力は全件 0 B なので、ファイルは置いていない。
- 置換は次の順に行った。
  1. redact.mjs の置換。
  2. ケースのディレクトリ名を `<case>` にする置換（`\cwd\<タグ>\`、`\cfg\<タグ>\`）。
  3. 作業ディレクトリの前半を `<work>` にする置換。
- 保存の前に、次の 2 点を確かめた。
  - `scanResidue` で、トークンらしい形が残っていないこと。
  - `<tmp>`、`<session-id>`、`scratchpad`、ケースのタグが残っていないこと。
- 「Remote Control」の節の行（`Not signed in to claude.ai` など）は、隔離した設定でサインインしていない状態の一般的な文言。アカウントを特定する情報は含まない。
- stream-json とデバッグ出力は、E4 では作っていない。

`check-fixtures.mjs` は、fixtures の doctor の出力を読み、ケースごとの期待と突き合わせる。claude は起動しない。

- 対象は 19 件（E4 の 17 件と、E3 の M2a・M2b）。
- 比べるのは次の 5 点。
  - 「Invalid settings」の節の有無
  - 節の各項目の文言（順番どおり・完全一致）
  - 版（2.1.293）
  - `warnings found` の項目に Invalid settings の内容が入っていないこと
  - stderr の fixture があれば 0 B であること
- 1 件でも食い違えば、終了コード 1 で終わる。

| 実行 | 結果 |
|---|---|
| `node check-fixtures.mjs`（このディレクトリ） | 19 件すべて OK、終了コード 0 |
| スクラッチパッドのコピーで、W06 の期待を「節あり」に変えた | `NG W06: Invalid settings 節: 実際 なし、期待 あり`、終了コード 1 |
| スクラッチパッドのコピーで、W26 の期待を docs の短い文言に変えた | `NG W26: 項目 1`（実際と期待の全文を表示）、終了コード 1 |
| スクラッチパッドのコピーで、fixtures の改行を CRLF にした（期待は変えない） | 19 件すべて OK、終了コード 0（git の改行変換を受けても通る） |

## 認証情報ファイルのメタデータ（E4）

中身は読んでいない。比べたのは、有無、更新日時、サイズだけ。

| ファイル | E4 の前（`e4-before`） | E4 の後（`e4-after`） | 扱い |
|---|---|---|---|
| 認証情報ファイル | 519 B、2026-10-17T15:36:19.615Z | 519 B、2026-10-17T15:36:19.615Z | 変化なし |
| ユーザー設定 | 329 B、2026-08-24T08:28:44.653Z | 329 B、2026-08-24T08:28:44.653Z | 変化なし |
| `~/.claude.json`（参考） | 77660 B | 77660 B | 変化なし |

- 前後の記録と、26 回の起動ごとの記録（`after:W01`〜`after:W26`）を合わせて、ファイルごとに 28 件の記録がある。
- 28 件すべてで変化はなかった。
- 認証情報ファイルの「更新日時だけの変化」は、E4 では 1 度も起きていない。
- 隔離した `CLAUDE_CONFIG_DIR` での doctor は、本物の認証情報とユーザー設定を書き換えなかった。

## E4 で確認していないこと

- **対話の起動時の表示**（invalid-settings のダイアログと、起動時警告）。対話端末が要るため、実行していない。
  - B4、B5、B6、B8 が対話の起動時に警告されるかは、分からない。
- **doctor が W06〜W08、W10 の設定ファイルを読んだか**は、直接は確かめていない。
  - 同じ置き場所の W03 は報告されたので、読んだうえで問題なしとした、と読める（推測）。
- **スキップされたルールが実際に効かないか、隣の有効なルールが効くか**（D 群、E5）。E5 で実測した。結果は末尾の E5 の節にある。
  - doctor の出力は「was skipped」と書くが、実際の判定は確かめていない。
  - W23（B1 と V0 の同居）の V0、W24、W25 の扱いも含む。
- **同じルールを複数の置き場所に書いたとき**の出方。ケースにない。
- managed settings（policy）の置き場所。この環境にはない。
- 2.1.293 以外の版。docs の 2.1.299 の `-p` の stderr の修正は、確かめていない（CLI は更新しない）。
- macOS、Linux。

## E4 の計画からの変更点

1. **止める条件を変えた**（上記。計画 14-4 節 5 項）。
2. **ledger を E3 から引き継いだ。** 作業ディレクトリは新しくした。
3. **extract-warnings.mjs に `parseDoctor` を足した。**
   - doctor の標準出力を節に分ける。
   - 「Invalid settings」の項目、版、`warnings found` の数を返す。
   - run-case.mjs は、この結果を meta.json と ledger に書く（`doctorInvalidSettings`、`doctorInvalidLines` など）。
4. **fixtures は標準出力だけにした。** 標準エラー出力は全件 0 B のため。
5. **`check-fixtures.mjs` を足した**（計画の付属物にない。PM の依頼による）。

## E4 の後始末

- 使い捨ての作業ディレクトリ（`e4/run/`、`e4/dry/`、止める条件の確認用の `e4/stoptest/`、範囲の確認用の `e4/phasecheck/`、NG の確認用の `e4/ngtest-*`）は、セッションのスクラッチパッドにある。セッションの終了とともに消える。
- ユーザー設定と認証情報ファイルは、読んでいないし、変更もしていない。
- CLI の更新・インストール、git の commit・push はしていない。

# E5: D 群（壊れたルールが実際に効くか）

D01〜D19 を `claude -p`（haiku）で 1 回ずつ実行した。判定には、モデルの返答を使っていない。stream-json の `tool_use` と `tool_result` を使った。

- `tool_result` の `is_error`
- 目印が本文に入ったか。目印は、ダミーの合言葉（`lab/zone/secret-*.txt`）か、`node -p "6*7"` の 42。

判定の規則は次のとおり（`check-fixtures.mjs` の `verdictOf` と同じ）。

| is_error | 目印 | 判定 |
|---|---|---|
| false | あり | 通過（読めた、または実行された） |
| true | なし | 拒否 |
| それ以外 | | 判定不能（E5 では 0 件） |

## E5 の結論

ここは事実（実測）だけを書く。推測は「事実と推測の区別」の節で分けて書く。

- **有効なルールは効いた**
  - project の deny に有効な Read のルールを置くと、Read は拒否された（D02）。
  - 同じ配列に不正なルールがあっても、有効なルールは効いた（D07、D08）。
  - 有効な Bash の deny は、`--allowedTools` で許可していても優先された（D09、D11）。
- **不正な deny は、どれも効かなかった**
  - 合言葉は `tool_result` に入った。対象は次の 6 種類。
    - 閉じ忘れ（B1。D03、D07 の a、local の D12）
    - 小文字のツール名（B3、D04）
    - 綴り違い（B4、D05）
    - 全角括弧（B6、D06）
    - 閉じ括弧の後ろに文字（B10、D17）
    - 余分な閉じ括弧（B8、D18）
  - Bash の閉じ忘れの deny（D10）は、`--allowedTools` の許可を止められなかった。`node -p "6*7"` は実行され、42 が出た。
  - doctor が報告する形（B1、B3、B10）も、報告しない形（B4、B6、B8）も、結果は同じだった。
- **壊れた JSON のファイルでは、有効な deny も効かなかった**（D19）
  - 末尾カンマのある `.claude/settings.json` に、D02 と同じ有効な deny を置いた。
  - Read は通過した。
- **不正な ask と allow**
  - 閉じ忘れの ask（D13）では、Read は通過した。
  - 有効な ask（D14）では、`-p` のため確認に答えられず、拒否された。
  - 閉じ忘れの allow（D16）では、Bash は実行されなかった。
  - 有効な allow（D15）では、実行された。
- **`-p` は、どのケースでも黙っていた**
  - 19 件すべてで、次のとおりだった。
    - 終了コード 0
    - 標準エラー出力 0 バイト
    - result の subtype は `success`
  - 不正なルールや壊れた JSON があっても、警告は出なかった。合言葉が読めたケースも、同じ出力だった。

## E5 の環境

| 項目 | 値 |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Node.js | v24.18.0 |
| Claude Code | 2.1.293（19 件すべての `system/init` の `claude_code_version`。E3・E4 から更新していない） |
| 実行日時 | 2026-10-17 16:00〜16:03 UTC（2026-10-18 01:00〜01:03 JST） |
| 経路 | `claude -p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --permission-mode default --max-budget-usd 0.2 --tools <Read か Bash> --max-turns 2 --output-format stream-json --verbose <プロンプト>`（D07 だけ `--max-turns 3`。D09〜D11 は `--allowedTools "Bash(node -p *)"` を足す） |
| 作業ディレクトリ | セッションのスクラッチパッドの使い捨てディレクトリ（`<work>`）。生の出力もそこに置き、リポジトリには置かない |
| ledger | E4 の `ledger.jsonl` をコピーして引き継いだ（回数とコストの上限は通算）。E4 の ledger 自体は変えていない |

- ユーザー設定（`~/.claude/settings.json`）は、`--setting-sources project,local` で読ませていない。
- モデルを使うため、`CLAUDE_CONFIG_DIR` は隔離していない（ログイン済みの認証情報を使う）。
- 読ませたファイルは、`lab/zone/` のダミー（`DUMMY-A-...` などの合言葉だけ）だけ。
- 実行させたコマンドは `node -p "6*7"` だけ。

## E5 の実行前に行ったこと

1. **cases.json と rules.json に D18・D19 を足した**（計画 14-5 節 1 項）。
   - D18: project の deny に `Read(./zone/secret-a.txt))`（rules.json の `RB8-a`）。
   - D19: project の `.claude/settings.json` を、次の壊れた JSON にした（`$raw` でそのまま書く）。

     ```json
     {
       "permissions": {
         "deny": ["Read(./zone/secret-a.txt)",]
       }
     }
     ```
2. **D 群の `--max-turns` を 4 から 2 にした。** D07 だけは Read を 2 回呼ぶので 3 にした。
   - 1 ターン目でツールを呼び、2 ターン目で返答すれば足りるため。
   - 結果の `num_turns` は、D07 が 3、ほかは 2 だった。
3. **範囲を E5 にした。**
   - `ACTIVE_PHASES = ["E5"]`。E5 の上限は、起動 30 回・モデル実行 22 回。
   - 全体の上限（起動 80、モデル実行 30、0.5 USD）と止める条件は、E4 から変えていない。
4. **`--preflight`** の結果は E3・E4 と同じだった。
   - managed settings は 0 件。
   - 親ディレクトリで見つかったのは `<home>\.claude`（ユーザー設定の置き場所）だけ。
5. **`--cred-stat --label e5-before`** で、認証情報ファイルとユーザー設定のメタデータを記録した（後述）。
6. **ドライラン**（D01、D19）で、展開した引数と書き込む設定を確かめた。
   - ドライランは、別の使い捨てディレクトリで行った。
   - D19 の設定ファイルが、上の壊れた JSON のとおりに書かれることも確かめた。
7. **D01（陽性対照）を最初に 1 回だけ実行した。**
   - 合言葉が入ったことを確かめてから、D02〜D19 を実行した。

## E5 の回数とコスト（実数）

| 範囲 | 起動 | うち claude | モデル実行 | total_cost_usd の合計 |
|---|---|---|---|---|
| E5 | 19 / 30 | 19 | 19 / 22 | 0.01700525 |
| 全体（E3 + E4 + E5） | 59 / 80 | 57 | 21 / 30 | 0.01993781 / 0.5 |

- 1 件あたりのコストは 0.00081375〜0.00106102 USD。最も高いのは D07（Read 2 回）。
- 所要時間は 1 件あたり 4379〜6853 ms。
- 再実行は 0 回（判定不能が 0 件のため）。
- タイムアウトは 0 回。
- stop は 0 回。

## E5 のケースごとの結果

列の意味は次のとおり。

- 置いたルール: 置き場所と配列、ルールの文字列。B の番号は rules.json の壊し方の分類。
- doctor: E4 で doctor がその形を報告したか。
- 判定: 上の規則による。
- 予想: 実行前に cases.json に書いた予想との比較。「不明」は、実行前に予想を決めていなかったもの。

| ケース | 置いたルール | ツールと入力 | is_error | 目印 | 判定 | doctor | 予想 |
|---|---|---|---|---|---|---|---|
| D01 | なし（陽性対照） | Read 絶対パス | false | a | 通過 | — | 一致 |
| D02 | project deny `Read(./zone/secret-a.txt)`（有効） | Read 絶対パス | true | なし | 拒否 | — | 一致 |
| D03 | project deny `Read(./zone/secret-a.txt`（B1） | Read 絶対パス | false | a | 通過 | 報告あり | 一致（仮説「効かない」） |
| D04 | project deny `read(./zone/secret-a.txt)`（B3） | Read 相対パス | false | a | 通過 | 報告あり | 不明 → 効かない |
| D05 | project deny `Raed(./zone/secret-a.txt)`（B4） | Read 絶対パス | false | a | 通過 | 報告なし | 不明 → 効かない |
| D06 | project deny `Read（./zone/secret-a.txt）`（B6、全角括弧） | Read 絶対パス | false | a | 通過 | 報告なし | 不明 → 効かない |
| D07 | project deny B1（a）と有効な `Read(./zone/secret-b.txt)` | Read 絶対パス ×2 | a: false / b: true | a: a / b: なし | a 通過、b 拒否 | B1 だけ報告 | 一致 |
| D08 | project deny `Bash(npm run:* test)`（B5）と有効な `Read(./zone/secret-b.txt)` | Read 相対パス | true | なし | 拒否 | 報告なし | 一致 |
| D09 | project deny `Bash(node -p *)`（有効）＋ `--allowedTools` | Bash `node -p "6*7"` | true | なし | 拒否 | — | 一致 |
| D10 | project deny `Bash(node -p *`（B1）＋ `--allowedTools` | Bash 同上 | false | 42 | 通過（実行された） | 報告あり | 不明 → 効かない |
| D11 | project deny `Bash(node -p:*)`（有効） | Bash 同上 | true | なし | 拒否 | — | 一致 |
| D12 | local deny `Read(./zone/secret-a.txt`（B1） | Read 相対パス | false | a | 通過 | 報告あり | 一致（D03 と同じ） |
| D13 | project ask `Read(./zone/secret-a.txt`（B1） | Read 相対パス | false | a | 通過 | 報告あり | 不明 → 効かない |
| D14 | project ask `Read(./zone/secret-a.txt)`（有効） | Read 絶対パス | true | なし | 拒否 | — | 一致 |
| D15 | local allow `Bash(node -p *)`（有効）、`--allowedTools` なし | Bash 同上 | false | 42 | 通過（実行された） | — | 一致 |
| D16 | local allow `Bash(node -p *`（B1） | Bash 同上 | true | なし | 拒否 | 報告あり | 不明 → 許可されない |
| D17 | project deny `Read(./zone/secret-c.txt) x`（B10） | Read 絶対パス | false | c | 通過 | 報告あり | 一致（仮説「効かない」） |
| D18 | project deny `Read(./zone/secret-a.txt))`（B8） | Read 絶対パス | false | a | 通過 | 報告なし | 一致（仮説「効かない」） |
| D19 | 壊れた JSON の project に有効な deny | Read 相対パス | false | a | 通過 | 報告あり（W25） | 一致（仮説「効かない」） |

- 「Read 絶対パス」は、`file_path` が作業フォルダの絶対パスだったもの。「Read 相対パス」は `./zone/...` だったもの。
  - どちらになるかは、モデルが決めた。cases.json では指定していない。
  - 有効な deny は、どちらの形でも一致した（絶対パスは D02・D07、相対パスは D08）。
- 「doctor」の列は E4 の結果（同じ形を W 群で doctor に通したもの）。E5 では doctor を実行していない。
- D19 の「報告あり（W25）」は、文言が「Invalid or malformed JSON」の形のこと。ルールの行ではない。

### 拒否のときの本文（一字一句。作業フォルダのパスは `<work>\cwd\<case>\` に置換）

| ケース | tool_result の本文 | result の permission_denials |
|---|---|---|
| D02、D07 の b、D08 | `<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>` | Read |
| D09、D11 | `Permission to use Bash with command node -p "6*7" has been denied.` | Bash |
| D14 | `Claude requested permissions to read from <work>\cwd\<case>\zone\secret-a.txt, but you haven't granted it yet.` | Read |
| D16 | `This command requires approval` | Bash |

- 通過したケースの permission_denials は、すべて空だった。
- deny で拒否された Read の本文は「directory that is denied」で、ファイル単位のルールでも「directory」と書かれる。

## 予想との違い

- **仮説と矛盾したケースはなかった。**
- 予想を「不明」としていた D04、D05、D06、D10、D13、D16 は、次の結果になった。
  - deny と ask（D04、D05、D06、D10、D13）は、どれも効かなかった。
  - allow（D16）は、許可にならなかった。

## 事実と推測の区別

**事実（E5 の実測。2.1.293、Windows、各 1 回）**

- 不正な deny（B1、B3、B4、B6、B8、B10）を置いても、Read は合言葉を返した。
- Bash の B1 の deny は、`--allowedTools` での実行を止めなかった。
- 同じ配列の有効な deny は、不正なルールがあっても効いた（D07、D08）。
- 末尾カンマで壊れた `.claude/settings.json` の中の有効な deny は、効かなかった（D19）。
- B1 の ask は確認を発生させず、Read が通過した（D13）。有効な ask は、`-p` では拒否になった（D14）。
- B1 の allow では Bash は実行されず、本文は `This command requires approval` だった（D16）。
- 19 件すべてで、終了コード 0、標準エラー出力 0 バイトだった。`-p` の出力には、警告がなかった。

**推測（実測からの解釈。直接は確かめていない）**

- B1、B3、B10 は、doctor の文言のとおり「スキップされた」と読める。docs の A8 の Warning（エントリのスキップ）とも合う。
- B4、B6、B8 は、doctor が報告しない。そのため、次の 2 つのどちらか分からない。
  - 有効なルールとして読み込まれたが、Read の呼び出しに一致しなかった。たとえば B8 は、中身が `./zone/secret-a.txt)` として読まれた、など。
  - 黙ってスキップされた。
  - 「deny が効かない」という結果は同じ。
- D19 は、ファイル全体が使われなかったと読める。docs の A8 の Error（ファイル全体）と合う。
  - ただし、そのファイルに置いたのは deny 1 件だけ。ほかのキー（allow など）も使われなかったかは、確かめていない。
- D16 の結果は、allow がないときと同じに見える。ただし、allow なしの Bash の対照は E5 では実行していない。
- D13 が通過したのは、B1 の ask がスキップされたうえで、作業フォルダの中の Read が既定で許可されるためと読める（D01 と同じ）。

**記事に書けること**

- 2.1.293 で確かめたこととして、次の 3 点。
  - 形の壊れた deny は、`-p` で黙って効かなくなる。
  - doctor に出ない形（綴り違い、全角括弧、余分な閉じ括弧）も、効かなかった。
  - 壊れた JSON では、同じファイルの正しい deny も効かなかった。
- 確かめ方は、「doctor の Invalid settings 節を見る」だけでは足りない。B4、B6、B8 は出ないため。
  - 実際に deny したいファイルを、`-p` で読ませてみる方法が確実。

## fixtures と check-fixtures.mjs（E5）

`make-d-fixture.mjs` を足し、D 群の最小の JSON を `fixtures/D*.json` に 13 件保存した。

- 対象は D01、D02、D03、D05、D06、D07、D08、D10、D14、D16、D17、D18、D19。
  - 依頼で指定されたもの: D01、D02、D03、D07、D10、D17、D19。
  - 予想と違ったものはなかった。代わりに、次のものを足した。
    - doctor に出ない形の代表: D05、D06、D18。
    - 相対パスで有効な deny が効いた根拠: D08。
    - 拒否の文言の代表: D14、D16。
- 入れたものは次のとおり。
  - 版、終了コード、標準エラー出力のバイト数
  - 置いた設定（`$ID` を展開したもの）とプロンプト
  - tool_use の名前と入力
  - tool_result の is_error、本文の先頭 200 文字、目印
  - result の subtype、is_error、コスト、ターン数、permission_denials
- stream-json の全文は入れていない。init の項目は版だけを入れた。セッション ID、UUID、アカウントの情報は入れていない。
- 置換は、redact.mjs の置換をしてから、作業フォルダのパスを `<work>\cwd\<case>\` にした。
  - 保存の前に、次の 2 点を確かめた。
    - `scanResidue` で、トークンらしい形が残っていないこと。
    - `<tmp>`、`<session-id>`、`<home>`、`<user>` が残っていないこと。

`check-fixtures.mjs` を D 群まで広げた。doctor の出力 19 件に、D 群 13 件を足して 32 件を照合する。D 群で比べるのは次のとおり。

- 版（2.1.293）、終了コード 0、標準エラー出力 0 バイト
- 置いた設定が、cases.json と rules.json から展開したものと一致すること
- ツールの呼び出しの回数と、それぞれのツール名、判定、目印
- 拒否のときは、本文の一字一句（上の表の 4 種類）

| 実行 | 結果 |
|---|---|
| `node check-fixtures.mjs`（このディレクトリ） | `すべて一致（32 件）`、終了コード 0 |
| スクラッチパッドのコピーで、D02 の期待を「通過・目印 a」に変えた | `NG D02: 呼び出し 1 の判定: 実際 拒否（is_error true、目印 []）、期待 通過` と、目印の NG。`食い違い 2 件（32 件中）`、終了コード 1 |
| スクラッチパッドのコピーで、D 群の fixtures の改行を CRLF にした（期待は変えない） | `すべて一致（32 件）`、終了コード 0 |

## 認証情報ファイルのメタデータ（E5）

中身は読んでいない。比べたのは、有無、更新日時、サイズだけ。

| ファイル | E5 の前（`e5-before`） | E5 の後（`e5-after`） | 扱い |
|---|---|---|---|
| 認証情報ファイル | 519 B、2026-10-17T15:36:19.615Z | 519 B、2026-10-17T15:36:19.615Z | 変化なし |
| ユーザー設定 | 329 B、2026-08-24T08:28:44.653Z | 329 B、2026-08-24T08:28:44.653Z | 変化なし |
| `~/.claude.json`（参考） | 77660 B | 77660 B | 更新日時は実行のたびに変わった（サイズは同じ） |

- 前後の記録と、19 回の起動ごとの記録（`after:D01`〜`after:D19`）を合わせて、ファイルごとに 21 件の記録がある。
- 認証情報ファイルとユーザー設定は、21 件すべてで変化がなかった。
  - E3 の M5 で起きた、認証情報ファイルの「更新日時だけの変化」は、E5 では起きなかった。
- `~/.claude.json` の更新日時は、19 回の起動のたびに変わった。これは参考の記録で、止める条件ではない（E4 で決めたとおり）。

## E5 で確認していないこと

- **繰り返し**。各ケース 1 回だけ。モデルが別のツールや別のパスの形を選ぶ場合は、試していない。
- **スキップと不一致の区別**。B4、B6、B8 が読み込まれて一致しなかったのか、スキップされたのかは分からない（上の「推測」）。
- **対話モード**。起動時の警告やダイアログ、ask の確認画面、`/permissions` の表示は見ていない。
- **フォルダの信頼状態**。作業フォルダは毎回新しく作った。信頼の確認画面は `-p` では出ない。
  - D15 で local の allow が効いたが、信頼済みかどうかは確かめていない。
- **user スコープと managed settings**。D 群は project と local だけ。user は `--setting-sources` で読ませていない。
- **壊れた JSON のファイルの、ほかのキー**。D19 は deny 1 件だけ。allow や ask、ほかの設定も使われなくなるかは、確かめていない。
- **local の壊れた JSON**、**user の壊れた JSON**。D19 は project だけ。
- **B2（空の括弧）、B5 単独、B7（空文字列）、B9（MCP）、deny が文字列（W24）**。D 群には入れていない（計画 14-5 節 1 項）。
- **Bash の B3、B4、B6、B8、B10**。Bash で試したのは B1 だけ。
- **Read 以外のファイル操作**（Edit、Write、Glob、Grep）と、Bash 経由の読み取り（`cat` など）。
- **`--allowedTools` を使わない Bash の deny**。D09〜D11 は `--allowedTools` 付き。
- **allow なしの Bash の対照**。D16 との比較用。実行していない。
- **2.1.293 以外の版**。CLI は更新していない。
- macOS、Linux。

## E5 の計画からの変更点

1. **D 群の `--max-turns` を 4 から 2 にした**（D07 は 3）。コストと回数を抑えるため。結果の `num_turns` は上限どおりで、`error_max_turns` は 0 件。
2. **`make-d-fixture.mjs` を足した**（計画の付属物にない。PM の依頼の「最小 JSON」を作るため）。
3. **fixtures を 13 件にした。** 依頼で指定された 7 件に、判断で 6 件を足した（上記）。

## E5 の後始末

- 使い捨ての作業ディレクトリは、セッションのスクラッチパッドにある。対象は `e5/run/`、`e5/run-dry/`、NG の確認用の `e5/ngtest/`。セッションの終了とともに消える。
- ユーザー設定と認証情報ファイルは、読んでいないし、変更もしていない。
- CLI の更新・インストール、git の commit・push はしていない。

## 記事 6-1 節の doctor スニペットの再現（2026-10-18、qa-reviewer）

- 記事 6-1 節の手順（使い捨てのディレクトリに壊れた deny を 1 件書いた `.claude/settings.json` を作り、`claude doctor` を実行）を、scratchpad の使い捨てディレクトリで 1 回実行した。
- 条件: 2.1.293、`claude.exe` をフルパスで起動、`DISABLE_AUTOUPDATER=1`（執筆者の実行と同じ条件。PATH 上の `claude`・自動更新ありでは実行していない）。
- 結果: 終了コード 0、標準エラー出力 0 B。標準出力の「Invalid settings」の節に `permissions.deny: Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule ...` が 1 件。末尾は `2 warnings found`（PATH と install method の 2 件で、Invalid settings は数に入らない）。記事の記述と一致。
- モデルは使っていない（`claude -p` は実行していない）。
