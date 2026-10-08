# Claude Code のサブエージェントの権限を、実際に動かして確かめる

「サブエージェントの `tools` や `disallowedTools` は、本当に効いているのか」「親の `permissions.deny` や hook は、サブエージェントにも効くのか」「サブエージェントは孫を起動できるのか」を、使い捨てのディレクトリで確かめるための検証セットです。
依存はありません（Node.js の標準モジュールだけ）。

確かめ方の考え方は 3 つです。

1. 判定は「ファイルが実際にできたか」を第一にします。モデルの自己申告は最後の根拠にします（モデルは、できなかったことを「できた」と言ったり、試さずに「拒否された」と言ったりします）。
2. 「効かなかった」と言えるのは、同じ書き方で効くことを別の場所で確かめたときだけです。そのため、親が直接書く対照（P1〜P5）と、書けるはずの陽性対照を入れています。
3. ゾーン（`zones/<名前>/`）ごとに 1 つの設定だけを当て、どの設定が結果を決めたかを切り分けます。

動作確認の環境、実行したコマンド、ケースごとの結果は [VERIFIED.md](./VERIFIED.md) にあります。結果は Claude Code のバージョンで変わります（2.1.158 と 2.1.293 で、孫の起動とプロジェクトの `permissions.allow` の扱いが逆でした）。自分の版で、もう一度実行してください。

## 中身

| ファイル | 役割 |
|---|---|
| `setup-lab.mjs` | 使い捨ての検証用ディレクトリを作り、実行コマンドを表示する（モデルは呼ばない）。検証用の定義、設定、hook、手順書をコピーする |
| `summarize-run.mjs` | `claude -p --output-format stream-json` の出力を表にする（モデルは呼ばない）。`result` が複数出ても、拒否の数を合計する |
| `check-zones.mjs` | ゾーンごとに、ファイルができたかを一覧にする（モデルは呼ばない） |
| `lab/.claude/agents/t-*.md` | 検証用のサブエージェント定義 11 個（すべて `model: haiku`）。`setup-lab.mjs` が検証用ディレクトリにコピーする |
| `lab/.claude/settings.a1.json`, `settings.a2.json` | 実行 A-1、A-2 のプロジェクト設定 |
| `lab/hooks/deny-zone.mjs` | PreToolUse の hook。全ツール呼び出しを記録し、特定ゾーンへの Write / Edit を exit 2 で止める |
| `lab/hooks/log-subagent.mjs` | SubagentStart / SubagentStop のログ（`../claude-code-subagent-hook-log/` と同じ内容のコピー） |
| `lab/hooks/probe-env.mjs` | hook の環境の確認用。環境変数の「名前」だけ（値は記録しない）と、シェルの手がかりを記録する |
| `lab/prompts/a1.txt`, `a2.txt` | 親に渡す手順書（番号つき・やり直し禁止） |
| `LICENSES.md` | 依存（なし）と、このサンプルのライセンス（MIT） |

## セットアップ

前提: Node.js（動作確認は v24）、git、Claude Code（動作確認は 2.1.293）。認証済みであること。

注意:

- 実行はモデルを呼びます（haiku を指定しています）。2.1.293 では、実行 A-1 が約 0.029 ドル、A-2 が約 0.030 ドルでした（`--max-budget-usd 2` で上限をかけています）。
- 検証用ディレクトリは必ず `os.tmpdir()` の下に作ります（`setup-lab.mjs` はそれ以外の場所を拒否します）。自分のプロジェクトの `CLAUDE.md` や `.claude/agents/` が混ざると、結果が変わります。
- `--setting-sources project,local` は、ユーザーレベルの設定（`~/.claude/settings.json`）を読み込まなくします。ただし、ユーザーレベルの `CLAUDE.md` や自動メモリまで遮断するとは限りません。それらが結果に影響しうることを承知のうえで使ってください（この記録では、ユーザーレベルのエージェント定義が出ていないことだけ、init の `agents` で確認しました）。
- `--permission-mode bypassPermissions` や `--dangerously-skip-permissions` は使いません。
- 認証に使う以外の `ANTHROPIC_*` などの環境変数が 401 の原因になることがあります。この記録では、実行の直前に `ANTHROPIC_`、`CLAUDE` で始まる名前などの環境変数を unset しました（値は見ていません）。必要なら同じようにしてください。

## 使い方

コマンドは Git Bash（または bash、zsh）で実行してください。`< prompt.txt` のリダイレクトは PowerShell では使えません。

実行 A-1（親が `acceptEdits`）:

```
node setup-lab.mjs --run a1
```

表示されたディレクトリに移動し、表示された `claude -p ...` を実行します（内容は次のとおりです）。

```
claude -p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --forward-subagent-text --output-format stream-json --verbose --include-hook-events --max-budget-usd 2 --permission-mode acceptEdits --disallowedTools "Edit(/zones/a4-cli/**)" --allowedTools "Bash(echo *)" < prompt.txt > run-a1.jsonl 2> run-a1.stderr
```

`--forward-subagent-text` は、サブエージェントの本文を stream に流すために付けています（2.1.211 以降）。

終わったら、結果を見ます。`check-zones.mjs` と `summarize-run.mjs` は、このサンプルのディレクトリ（`setup-lab.mjs` がある場所）に置いたまま、検証用ディレクトリの場所を引数で渡します。

```
node check-zones.mjs <検証用ディレクトリ> --run a1
node summarize-run.mjs <検証用ディレクトリ>/run-a1.jsonl
```

`check-zones.mjs` は、期待値が「なし」のゾーンを、実行していなくても「一致」と表示します。先に `summarize-run.mjs` で、実行が最後まで進んだこと（`result` が `success` か、Agent の呼び出し回数が想定どおりか）を確かめてください。`run-<run>.jsonl` が検証用ディレクトリにないときは、警告を出します。

実行 A-2（親が `default`）も同様です。プロジェクトの `permissions.allow` は、未信頼のフォルダの `claude -p` では使われないため、許可は `--allowedTools` で渡します。

```
node setup-lab.mjs --run a2
claude -p --model haiku --setting-sources project,local --no-session-persistence --strict-mcp-config --forward-subagent-text --output-format stream-json --verbose --include-hook-events --max-budget-usd 2 --permission-mode default --allowedTools "Edit(/zones/a0-allow/**)" "Edit(/zones/a5-plan/**)" "Edit(/zones/a6-nest/**)" "Edit(/zones/a7-bash/**)" "Bash(echo *)" < prompt.txt > run-a2.jsonl 2> run-a2.stderr
node check-zones.mjs <検証用ディレクトリ> --run a2
```

A-2 の stderr には、プロジェクトの `permissions.allow` を使わなかった警告が出ます（A-9b の確認）。

終わったら、検証用ディレクトリを削除します。ログには、ユーザー名を含むパスが入ります。記事や公開リポジトリには、生のログを載せないでください（`summarize-run.mjs` の出力は、名前・パス・セッション ID を置換します）。

`--run` ごとのゾーンは次のとおりです。

| 実行 | ゾーン |
|---|---|
| a1 | a0-allow, a1-readonly, a2-disallow, a3-deny, a3w-deny, a4-cli, a5-plan, a6-nest, a7-bash, a8-hook |
| a2 | a0-allow, a5-plan, a5b-noallow, a6-nest, a7-bash, a7n-bash, a9-projallow |

## 検証したこと（2.1.293 での結果の要約。詳しくは VERIFIED.md）

以下は、この版・この条件（Claude Code 2.1.293、Windows 11、`claude -p`、モデル haiku、1 ケース 1 回）での結果です。ほかの版や条件で同じとは限りません。

- `tools` の許可リストにないツール、`disallowedTools` で除いたツールは、サブエージェントには渡されず、書き込めなかった（「呼んで拒否された」のではなく、ツールが無い）。根拠は、ファイルができなかったことと、`No such tool available` というツール結果。
- 親の `permissions.deny` の `Edit(...)` と、`--disallowedTools` は、サブエージェントにも効いた。`Write(...)` の deny は、親にもサブエージェントにも効かなかった（公式ドキュメントの記述と一致）。書き込みを止めたいときは、`Write(...)` ではなく `Edit(...)` の deny を使う。
- PreToolUse の hook（exit 2）は、サブエージェントの呼び出しも止めた。
- `Write` や `Edit` を持たない定義でも、`Bash` を持っていれば、リダイレクトでファイルを書けた（許可があれば）。書き込み先の `Edit` の deny は、Bash のリダイレクトにも効いた（deny で拒否された。`Edit` の許可がない親 `default` の実行では、承認が必要な状態で止まった）。どちらも、docs の記述と整合する結果だが、止まった原因の切り分けは、親のモードが違う 2 回の実行からの推論。
- `permissionMode: plan` は、親が `default` のときは効き、親が `acceptEdits` のときは効かなかった。
- サブエージェントは孫を起動できた（`tools` に `Agent` を書いた定義と、`tools` を省略した定義）。`tools` に `Agent` を書かない定義と、`disallowedTools: Agent` の定義は、孫を起動しなかった（`Agent` ツールが渡されない）。証拠の強さは違う。`disallowedTools: Agent` の定義（t-nest）は、ToolSearch を呼んで見つからなかったという実行記録がある。`tools` に `Agent` を書かない定義（t-nest-b）は、モデルの自己申告が中心で、陽性対照（孫が書けた別の定義）で補強しているだけ。深さ 2 までの確認で、「最大 3 階層」の上限そのものは試していない。
- 未信頼のフォルダの `claude -p` では、プロジェクトの `permissions.allow` は使われなかった。

## 制約

- Windows 11、Claude Code 2.1.293、`claude -p`、モデルは haiku、1 ケース 1 回の結果です。バージョン、モデル、対話モードで変わる可能性があります。2.1.158 では結果が違いました（VERIFIED.md の「旧版での記録」）。
- auto モード、`bypassPermissions`、`dontAsk`、対話モードの許可ダイアログは確認していません。
