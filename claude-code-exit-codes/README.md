# `claude -p` の終了コードを、失敗のしかたごとに実際に確かめる

「`claude -p` が終了コード 0 で終わったら、仕事は成功した」と言えるのか。これを、わざと失敗させて確かめるための検証セットです。
依存はありません（Node.js の標準モジュールだけ）。

確かめ方の考え方は 4 つです。

1. 終了コードは、パイプやシェルを介さずに受け取ります（`spawnSync` で直接起動し、終了コード・標準出力・標準エラー出力を別々に保存します）。`claude -p ... | tee` のようにパイプすると、終了コードは `tee` のものになり、`claude` の失敗は隠れます。
2. 判定は、次の順に見ます。終了コード、`result` の `is_error` と `subtype` と `permission_denials`、ファイルが実際にできたか、標準エラー出力、モデルの返答（参考）。
3. 失敗は 1 種類ずつ起こします（引数の誤り、認証、存在しないモデル、ターン数・予算の上限、ツールの拒否など）。同じ条件を 2〜3 回繰り返して、結果が揃うかも見ています。
4. 認証情報と環境変数の値は、画面にもファイルにも出しません（子プロセスに渡す環境変数は許可リスト方式で、記録するのは「名前」だけです）。

動作確認の環境、実行したコマンド、ケースごとの結果は [VERIFIED.md](./VERIFIED.md) にあります。結果は Claude Code のバージョンで変わりえます。自分の版で、もう一度実行してください。

## 中身

| ファイル | 役割 |
|---|---|
| `cases.json` | 25 個のケースの定義（引数、プロンプト、出力形式、タイムアウト、確認するファイル）と、実行前に書いた想定（`expect`）。想定は結果を見てから書き換えていません |
| `run-case.mjs` | 1 ケースを実行し、終了コード・標準出力・標準エラー出力・所要時間を保存する。起動回数・モデルを使った回数・コストの上限（25 回、15 回、0.5 ドル）を超える実行は拒否する |
| `classify-run.mjs` | 1 回の実行結果から、OK / FAILED / DEGRADED / WARN の判定を出す（モデルは呼ばない）。`--check-fixtures` で `fixtures/` を検査する |
| `summarize-run.mjs` | `--output-format stream-json --verbose` の出力を表にする。コピー元は `../claude-code-subagent-permissions/summarize-run.mjs`（無変更のコピー）。`result` が複数出ても拒否の数を合計する |
| `redact.mjs` | 保存・表示する抜粋に通す置換（一時ディレクトリ、ホーム、ユーザー名、セッション ID、`sk-ant-`、`Bearer`、`eyJ`、メールアドレス）と、置換後の検査 |
| `make-fixtures.mjs` | 生の出力から `fixtures/` を作る（置換を通し、残留検査に通ったものだけ保存する） |
| `fixtures/` | 判定の確認用の実行結果 26 個。実測 19 個、合成 7 個（合成は `expected.json` の `synthetic: true`）。stream-json のものは `result` イベントだけ、json のものは判定に使う項目だけ残している |
| `lab/` | 検証用ディレクトリの元（サブエージェント定義 `t-echo`、プロンプト、読み込み用のデータ、壊れた設定ファイル） |
| `LICENSES.md` | 依存（なし）と、このサンプルのライセンス（MIT） |

## 判定の定義

`classify-run.mjs` の判定は、このサンプルの定義です（Claude Code の公式の分類ではありません）。

| 判定 | 条件 |
|---|---|
| FAILED | 終了コードが 0 以外（タイムアウト、シグナルによる終了を含む）。または、終了コードは 0 だが `is_error` が `true`、あるいは `subtype` が `success` でない |
| DEGRADED | 終了コード 0、`is_error` が `false`、`subtype` が `success`。だが `permission_denials` が 1 件以上（ツールの実行が拒否されている。依頼した仕事が済んでいない可能性がある） |
| WARN | 失敗とも拒否とも言えないが、成功と言い切れない。例: `text` 形式で `result` が見えない、標準エラー出力に出力がある、`result` イベントが複数ある、出力が JSON として読めない |
| OK | 終了コード 0、`is_error` が `false`、`subtype` が `success`、拒否 0、標準エラー出力が空 |

注意: **OK は「`claude` が正常に終わった」という意味で、「頼んだ仕事が成功した」という意味ではありません。** 例えば、モデルが実行したコマンドが失敗しても（VERIFIED.md の M5）、`claude` 自体は終了コード 0 で、拒否も 0 なので OK になります。仕事が済んだかは、ファイルの有無や、後段の検査で確かめてください。

## セットアップ

前提: Node.js（動作確認は v24）、Claude Code（動作確認は 2.1.293）。認証済みであること。

注意:

- 実行は、本物の認証でモデルを呼びます（haiku を指定しています）。この記録では、25 回の起動のうち 14 回がモデルを使い、合計は約 0.023 ドルでした（`--max-budget-usd` で 1 回あたりの上限もかけています）。
- 作業用のディレクトリは、必ず `os.tmpdir()` の下に作ります（`run-case.mjs` は、それ以外の場所を拒否します）。自分のプロジェクトの `CLAUDE.md` や `.claude/agents/` が混ざると、結果が変わります。
- `--setting-sources project,local` で、ユーザーレベルの設定（`~/.claude/settings.json`）を読み込まなくしています。ただし、ユーザーレベルの `CLAUDE.md` や自動メモリまで遮断するとは限りません。
- 認証の失敗を起こす A1、A2 は、`CLAUDE_CONFIG_DIR` に空の使い捨てディレクトリを指定して、認証情報を見えなくします。A2 は、実行時に組み立てた明らかなダミーのキーを `ANTHROPIC_API_KEY` に渡します（値は表示しません）。A1 で隔離できたこと（未ログインのエラーになること）を確かめてから A2 に進んでください。自分の環境で隔離できるかは、版や OS で変わりえます。
- 自動更新で版が変わらないよう、子プロセスに `DISABLE_AUTOUPDATER=1` を渡しています。
- `--dangerously-skip-permissions` と `--permission-mode bypassPermissions` は使いません。
- Windows の Git Bash では、`claude` が PATH に無いことがあります（この記録の環境では `~/.local/bin/claude.exe`）。`run-case.mjs` は PATH と `~/.local/bin` を探します。見つからないときは `--claude <パス>` で指定してください。

## 使い方

コマンドは Git Bash（または bash、zsh）で実行してください。

```
node run-case.mjs --list                      # ケースの一覧
node run-case.mjs --case H0                   # 記録の仕組みの確認（node が終了コード 3 で終わる。モデルは呼ばない）
node run-case.mjs --cred-stat --label before  # 認証情報ファイルの更新日時とサイズだけを記録する（内容は読まない）
node run-case.mjs --case N0                   # claude --version
node run-case.mjs --case A1                   # 認証なし（隔離した設定ディレクトリ）
node run-case.mjs --case M3                   # Write の許可なしで書かせる（モデルを呼ぶ）
node run-case.mjs --status                    # 起動回数、モデルを使った回数、コストの累計
```

1 ケースの実行ごとに、終了コード、環境変数の名前、`result` の主な項目、判定が表示されます。生の出力は `<os.tmpdir()>/claude-exit-codes-run/raw/` に残ります（リポジトリの外。確認が済んだら削除してください）。

自分の出力を判定する:

```
node classify-run.mjs --exit 0 --format json --stdout out.json [--stderr err.txt]
```

判定の規則の確認（`fixtures/` の 26 個が、期待どおりの判定になること）:

```
node classify-run.mjs --check-fixtures fixtures
```

`fixtures/` を作り直す（生の出力が残っているとき）:

```
node make-fixtures.mjs
```

## できないこと・注意

- 確かめたのは、Windows 11 + Claude Code 2.1.293 + Node.js v24 + サブスクリプション認証、モデルは haiku です。macOS・Linux、ほかの版、API キー認証での本番利用、Bedrock・Vertex 経由は確かめていません。
- 1 条件につき 1〜3 回の実行です。モデルの振る舞いが絡むケース（拒否されたあとの返答など）は、回数が少ないので、傾向としてお読みください。
- 合成の fixture は、実測では起きなかった形（終了コード 0 なのに `is_error` が `true` など）で判定の規則を確かめるためのものです。「その状態が起きる」ことの根拠にはなりません。
- `classify-run.mjs` は、ファイルができたか、モデルの返答の内容は判定に使いません。
