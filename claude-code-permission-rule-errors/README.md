# 不正な権限ルールの警告と、deny が効くかを確かめる

Claude Code の権限ルール（`permissions.allow` / `ask` / `deny`）を、わざと壊した状態で設定ファイルに書く道具です。壊し方は、括弧の閉じ忘れ、ツール名の綴り違い、全角括弧などです。そのうえで次の 2 点を記録します。

- 警告がどこに、どんな文言で出るか（標準出力、標準エラー出力、stream-json のイベント、デバッグ出力）
- 壊れた deny が実際に効くか（D 群。tool_result に合言葉が入るかで判定）

判定はモデルの自己申告に頼りません。保存した出力と終了コードで判定します。

> **状態**: 2026-10-17（UTC）に Claude Code 2.1.293（Windows 11）で、次の 3 つの範囲を実行しました。結果は `VERIFIED.md` にあります。
> - E3: N0、N2、H0、H1、M1〜M7a
> - E4: W 群の 26 件。`claude doctor` で実行し、モデルは使っていません
> - E5: D 群の 19 件。`claude -p`（haiku）で実行しました
>
> E3 の結果の要約（2.1.293、各 1 回）:
> - `claude doctor` は、モデルも対話端末も使わずに、不正なルールを報告しました。出た場所は標準出力の「Invalid settings」の節です。文言は `Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule. ...` でした。
>   - 終了コードは 0 でした。最後の `N warnings found` にも数えられません。
> - `claude -p` は、不正なルールについて何も出しませんでした。次のどれでも同じでした。
>   - モデルを使った実行（haiku）
>   - 認証エラーで終わる実行
>   - `--bare --settings` で起動した実行
>   - `--debug-file` を付けた実行
>
>   標準エラー出力は 0 バイトでした。stream-json とデバッグ出力にも、警告はありませんでした。
>
> E4 の結果の要約（2.1.293、`claude doctor`、各 1 回）:
> - doctor が「Invalid settings」の節で報告したのは、次の 6 種類です。どれも `was skipped:` の後ろに理由が付きます。
>   - 閉じ忘れ `Bash(npm run *`
>   - 閉じ括弧の後ろに文字 `Bash(ls) x`
>   - 空の括弧 `Bash()`
>   - 小文字のツール名 `bash(...)`
>   - 空文字列
>   - 括弧付きの MCP ルール
> - 配列ではなく文字列で書いた deny と、JSON として読めないファイルも、同じ節に出ました。文言は別の形です。
> - 次の 4 種類は、doctor の出力に何も出ませんでした。出力は、有効なルールのときとバイト単位で同じでした。
>   - ツール名の綴り違い `Bsah(...)`
>   - 途中の `:*`（`Bash(npm run:* test)`）
>   - 全角括弧
>   - 余分な閉じ括弧 `Bash(npm run *))`
> - project、local（`settings.local.json`）、user（`CLAUDE_CONFIG_DIR/settings.json`）のどれに書いても、報告されました。allow、ask、deny のどれでも、文言は同じでした。
> - 有効なルールと同じ配列に書いたときは、不正なルールの行だけが出ました。
> - 終了コードは 26 件すべて 0 でした。
>
> E5 の結果の要約（2.1.293、`claude -p`、haiku、各 1 回）:
> - 判定は、`tool_result` の `is_error` と、本文に目印（ダミーの合言葉か、`node -p "6*7"` の 42）が入ったかで行いました。モデルの返答は使っていません。
> - 有効な deny は効きました。Read は拒否され、合言葉は入りませんでした。
>   - 同じ配列に不正なルールがあっても、有効なルールは効きました。
> - 不正な deny は、どれも効きませんでした。合言葉が `tool_result` に入りました。対象は次のとおりです。
>   - 閉じ忘れ（project と local）、小文字のツール名、閉じ括弧の後ろに文字。doctor が報告する形です。
>   - 綴り違い、全角括弧、余分な閉じ括弧。doctor が報告しない形です。
> - Bash の閉じ忘れの deny は、`--allowedTools` での実行を止めませんでした。
> - 末尾カンマで壊れた `.claude/settings.json` では、中の正しい deny も効きませんでした。
> - 閉じ忘れの ask では、確認なしで読めました。閉じ忘れの allow では、Bash は実行されませんでした。
> - 19 件すべてで、終了コード 0、標準エラー出力 0 バイトでした。`-p` は何も警告しませんでした。

調べる対象（`cases.json`、ルールの文字列は `rules.json`）:

| 群 | 内容 | 範囲 |
|---|---|---|
| N、H | 版の記録、`--help`、実行の土台の確認（終了コードと stdout / stderr の分離） | E3（実行済み） |
| M | 警告を見る経路の探索（`--version`、`doctor`、`-p` の stream-json / text、`-p "/doctor"`、`--bare --settings`、モデルあり、`--debug-file`） | E3（実行済み。M3c、M7b は未実行） |
| W | 壊し方 × 配列（allow / ask / deny）× 置き場所（project / local / user）ごとの警告。経路は `claude doctor` | E4（実行済み） |
| D | 壊れた deny / ask / allow が実際に効くか（Read と Bash）。モデルを使う | E5（実行済み） |

## 必要なもの

- Node.js 18 以降（確認は v24.18.0）。依存パッケージはありません。
- Claude Code（確認は 2.1.293）。
  - W 群と M2 は、ログインしていなくても動きます。隔離した `CLAUDE_CONFIG_DIR` で、モデルを呼ばずに実行します。
  - M5、M6、D 群は、ログイン済みの Claude Code が必要です。モデル（haiku）を呼ぶため、利用枠かコストがかかります。
- Git（作業ディレクトリで `git init` するため）

## セットアップ

```sh
git clone <このリポジトリ>
cd samples/claude-code-permission-rule-errors
node run-case.mjs --list        # ケースの一覧
node run-case.mjs --preflight   # managed settings と、親ディレクトリの .claude / CLAUDE.md の有無を確かめる
node run-case.mjs --cred-stat --label before   # 認証情報ファイルとユーザー設定の更新日時とサイズを記録する
```

- `claude` が PATH にない場合は、`--claude <claude の実行ファイル>` を付けます。
  - Windows のネイティブ版は、PATH になくても `%USERPROFILE%\.local\bin\claude.exe` を探します。
- `--preflight` で managed settings（組織の管理設定）が見つかったら、その環境では実行しないでください。結果が管理設定に左右されます。

## 使い方

### 1. 1 ケースを実行する

```sh
node run-case.mjs --case M2a --dry-run   # 展開した引数と、書き込む設定ファイルを表示するだけ（起動しない）
node run-case.mjs --case M2a             # 実行する
```

run-case.mjs はケースごとに、次の順で処理します。

1. `os.tmpdir()` の下に、使い捨ての作業ディレクトリを作る。
2. `lab/` をコピーし、`git init` する。
3. ケースの設定を書き込む。

| 設定 | 書き込み先 |
|---|---|
| `project` | `.claude/settings.json` |
| `local` | `.claude/settings.local.json` |
| `user` | 隔離した `CLAUDE_CONFIG_DIR/settings.json` |
| `file` | `--settings` に渡すファイル |

4. `claude` を直接起動する（シェルを介さない）。
5. 次の 3 つを別々のファイルに保存し、要約を表示する。
   - 終了コードと所要時間
   - 標準出力
   - 標準エラー出力

生の出力は作業ディレクトリの `raw/` に残り、リポジトリには入りません。

実行の前後で、`node run-case.mjs --status` を見て回数を確かめます。

- 起動回数、モデル実行の回数、累積コストは `ledger.jsonl` に記録されます。
- 上限を超える実行は拒否されます。

### 2. 保存した出力から警告を読み取る

```sh
node extract-warnings.mjs fixtures/M2a    # fixtures/M2a.stdout.txt と M2a.stderr.txt を読む
```

M2a の出力では、警告らしい行が 2 件見つかります。`Invalid settings` の見出しと、ルールの行です。

```
- <work>\cwd\<case>\.claude\settings.json › permissions.deny: Invalid permission rule "Bash(npm run *" was skipped: Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal
```

対照の `fixtures/M2b`（有効な `Bash(npm run *)`）では、0 件です。

### 3. fixtures の文言を期待と突き合わせる

```sh
node check-fixtures.mjs
```

- `fixtures/` の 32 件を読みます。claude は起動しません。
  - doctor の出力 19 件（M2a、M2b、W 群の 17 件）
  - D 群の最小の JSON 13 件（`make-d-fixture.mjs` で作ったもの）
- doctor の出力では、次の 2 点を、ファイルの中に書いた期待と突き合わせます。
  - 「Invalid settings」の節の有無
  - 節の各項目の文言
- D 群では、次の点を突き合わせます。
  - 置いた設定が cases.json と同じか
  - ツールの呼び出しごとの判定（通過 / 拒否）と目印
  - 拒否のときの本文
- すべて一致すれば `すべて一致（32 件）` と表示し、終了コード 0 で終わります。
- 1 件でも違えば、その項目の実際と期待を表示し、終了コード 1 で終わります。
- 期待は 2.1.293 の実測です。別の版で取った出力と比べると、文言の違いが NG として出ます。

D 群を自分の環境で実行し直すときは、作業ディレクトリを決めて、次のように実行します。モデル（haiku）を 1 ケース 1 回呼びます（E5 では 1 回あたり約 0.001 USD でした）。

```sh
node run-case.mjs --work <作業ディレクトリ> --case D01        # 陽性対照。合言葉が入らなければ、ほかは実行しない
node run-case.mjs --work <作業ディレクトリ> --case D02
node make-d-fixture.mjs --work <作業ディレクトリ> D01 D02      # fixtures/D01.json、D02.json を上書きする
node check-fixtures.mjs
```

- 実行できる範囲は、run-case.mjs の `ACTIVE_PHASES` で決まります（いまは `["E5"]`）。
- `fixtures/` を上書きするので、元の fixtures と比べたいときは、先にコピーしておきます。

自分の設定ファイルを確かめるだけなら、このサンプルは要りません。プロジェクトのディレクトリで次を実行し、出力に `Invalid settings` の節があるかを見ます。

```sh
claude doctor
```

- 終了コードは、不正なルールがあっても 0 です（2.1.293）。
- 最後の `N warnings found` にも数えられません。

## 分かっていること・注意

- 2.1.293 の `claude -p` は、不正な権限ルールがあっても警告を出しません。
  - 標準エラー出力にも、stream-json にも、`--debug-file` の出力にも出ません。
  - そのルールは黙ってスキップされると、docs と doctor の文言は説明しています。
  - E5 では、不正な deny は実際に効きませんでした（Read は合言葉を返しました）。
- 不正なルールが「スキップされた」のか、「読み込まれたが一致しなかった」のかは、外からは区別できません。
  - doctor が報告しない形（綴り違い、全角括弧、余分な閉じ括弧）も、効きませんでした。
  - deny が効いているかを確かめるには、実際にそのファイルを読ませてみるのが確実です。
- doctor の文言は、docs に載っている例より長くなっています。`Malformed Tool(content) rule.` の後ろに、ルールの形の説明が続きます。
- 2.1.293 の doctor は、local スコープと user スコープのファイルも報告します（E4）。
  - 未知のツール名（B4）、途中の `:*`（B5）、全角括弧（B6）、余分な閉じ括弧（B8）は報告しません（E4）。
  - doctor に何も出ないことは、そのルールが正しいという意味ではありません。
  - これらのルールが対話の起動時に警告されるかは、確かめていません。
- doctor の出力には、ファイル全体が無効（Error）か、エントリのスキップ（Warning）かの区別が表示されません。
  - 壊れた JSON（末尾カンマ）の project の設定ファイルでは、中の正しい deny も効きませんでした（E5 の D19）。同じファイルのほかのキーも使われなくなるかは、確かめていません。
  - 不正なルールと同じ配列の、正しい deny は効きました（E5 の D07、D08）。
  - 配列ではなく文字列の deny が、実際にどう扱われるかは確かめていません。
- E5 は各 1 回、`-p` だけです。対話モード、フォルダの信頼状態、user スコープでの実効は確かめていません。
- run-case.mjs は、ユーザー設定（`~/.claude/settings.json`）を読みません。
  - モデルを使わないケースでは、`CLAUDE_CONFIG_DIR` を使い捨てのディレクトリに向けます。
  - モデルを使うケースでは、`--setting-sources project,local` で起動します。
  - 認証情報ファイルとユーザー設定は、更新日時とサイズだけを比べます（`--cred-stat`）。
  - 比べるのは、claude を起動するたびです。相手は直前の記録です。
  - 止める条件は、ファイルによって違います。
    - 認証情報ファイル: 有無かサイズが変わったとき。
    - ユーザー設定: 有無、更新日時、サイズのどれかが変わったとき。
  - 認証情報ファイルの更新日時だけの変化は、ledger に記録するだけです。モデルを使う実行の後は、OAuth の更新で変わることがあります（E3 で 1 回あり）。
  - 止まったときは ledger に stop が書かれ、以後の実行は拒否されます。確かめたうえで `--resume-after-stop --reason <理由>` で再開します。
- 子プロセスに渡す環境変数は、許可リストの名前だけです。値は表示も記録もしません。
  - PATH は値を変えずに渡します。doctor が「PATH に `.local\bin` がない」と出すことがあります。筆者の PATH に `.local\bin` が入っていないためで、run-case.mjs の処理によるものではありません（run-case.mjs を介さずに実行しても同じ警告が出ました）。
- `--dangerously-skip-permissions` と `bypassPermissions` は使いません。cases.json に書いても、run-case.mjs が拒否します。
- 出力の要約は、`redact.mjs` で置換してから表示・保存します。置換の対象は、ホームディレクトリ、一時ディレクトリ、セッション ID、トークンらしい形などです。

## ファイル

| ファイル | 内容 |
|---|---|
| `run-case.mjs` | 1 ケースを使い捨ての作業ディレクトリで実行し、出力を別々に保存する。回数とコストの上限、止める条件 |
| `extract-warnings.mjs` | 保存した出力から、警告らしい行、stream-json のイベント、result、tool_use / tool_result を抜き出す。doctor の出力を節に分ける（`parseDoctor`） |
| `check-fixtures.mjs` | fixtures（doctor の出力と D 群の最小の JSON）を、ケースごとの期待（2.1.293 の実測）と突き合わせる。食い違いがあれば終了コード 1 |
| `make-d-fixture.mjs` | D 群の生の出力から、判定に使う部分だけを置換して `fixtures/D*.json` に書く |
| `redact.mjs` | パスやトークンらしい形の置換と、置換後の残りの確認（`../claude-code-subagent-errors/redact.mjs` のコピー） |
| `cases.json` | ケースの定義（引数のプリセット、置く設定、仮説） |
| `rules.json` | 権限ルールの文字列と、実測の前の仮説、docs の記述 |
| `lab/zone/secret-*.txt` | D 群の合言葉（ダミーの文字列。秘密の情報ではない） |
| `fixtures/` | 置換済みの実際の出力（E3 の M2a、M2b、M3b、M7a と、E4 の W01、W03〜W11、W16、W19、W22〜W26 の doctor の標準出力）。E5 の D01〜D03、D05〜D08、D10、D14、D16〜D19 は、stream-json から抜き出した最小の JSON（全文ではない） |
| `VERIFIED.md` | 実行した環境、回数、結果、確認していないこと |
| `LICENSES.md` | 依存とライセンス |
