# Claude Code のサブエージェントを hook でログに残す

`SubagentStart` と `SubagentStop` の hook から、サブエージェントの起動と終了を 1 行 1 件の JSON（JSONL）で記録する小さなスクリプトです。
依存はありません（Node.js の標準モジュールだけ）。

- 何が起きたか（どの定義が、いつ、何回動いたか）を、会話の文章ではなくログで確かめたいときに使います。
- 本文（`last_assistant_message`）、作業ディレクトリ、transcript のパスは記録しません。記録するのは、定義名、ID、モード、本文の文字数、入力に含まれていた項目名の一覧です。
- 動作確認の環境と結果は [VERIFIED.md](./VERIFIED.md) にあります。

## 中身

| ファイル | 役割 |
|---|---|
| `log-subagent.mjs` | hook から呼ぶスクリプト。標準入力の JSON を読み、JSONL に 1 行追記する |
| `settings.example.json` | `.claude/settings.json` に足す hook の設定例 |
| `LICENSES.md` | 依存ライブラリ（なし）の記録と、このサンプルのライセンス（MIT） |

## セットアップ

前提: Node.js（動作確認は v24）と Claude Code（動作確認は 2.1.293）。

1. 対象のプロジェクトに `hooks/` を作り、`log-subagent.mjs` を置きます。
2. `.claude/settings.json` に `settings.example.json` の `hooks` を足します（すでに `hooks` があれば、同じキーの配列に追加します）。
3. `logs/` を `.gitignore` に入れます（ログにはエージェント ID などが残ります）。

設定の中身は次のとおりです。

```json
{
  "hooks": {
    "SubagentStart": [
      { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/hooks/log-subagent.mjs\" logs/subagent.jsonl" } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/hooks/log-subagent.mjs\" logs/subagent.jsonl" } ] }
    ]
  }
}
```

`$CLAUDE_PROJECT_DIR` の形は、Windows 11 でも動きました。この環境では、hook のコマンドは Git Bash で実行されていたと見られます（環境変数の手がかりによる推定です。VERIFIED.md 参照）。`%CLAUDE_PROJECT_DIR%` と書くと、展開されずに失敗します（終了コード 1。セッションは止まりません）。

公式 docs（https://code.claude.com/docs/en/hooks ）には、次の記述があります（この記録では、docs の記述として確認しただけで、実行して試してはいません）。

- command の hook には `shell` フィールドがあり、値は `"bash"` か `"powershell"`。既定は `"bash"` で、Windows で Git Bash が入っていないときは `"powershell"`。
- プロジェクトのルートは `${CLAUDE_PROJECT_DIR}` というプレースホルダでも書ける。シェル形式（`args` なし）では、パスに空白があっても動くよう、二重引用符で囲む。`CLAUDE_PROJECT_DIR` は環境変数としてもスクリプトに渡されるので、スクリプトの中では `process.env.CLAUDE_PROJECT_DIR` でも読める。

このサンプルの `settings.example.json` が使う `$CLAUDE_PROJECT_DIR` の形は、Git Bash で動くことだけを確認しています。PowerShell で実行される環境（Git Bash が無い Windows）では確認していません。そのときは、docs にある `${CLAUDE_PROJECT_DIR}` の形か、`shell` を明示する書き方を試してください。

出力先の `logs/subagent.jsonl` は、プロジェクトのルートからの相対パスとして扱います。

## 使い方

サブエージェントを使う作業をすると、`logs/subagent.jsonl` に次のような行が増えます（動作確認で得た行から、セッションを表す値だけ伏せています）。

```json
{"ts":"2026-10-07T23:42:09.999Z","event":"SubagentStart","session":"<hash>","agent_id":"a59fff48aabf66b2f","agent_type":"t-allow","keys":["agent_id","agent_type","cwd","hook_event_name","prompt_id","session_id","transcript_path"]}
{"ts":"2026-10-07T23:42:46.099Z","event":"SubagentStop","session":"<hash>","agent_id":"a80ed495bcdaf4b65","agent_type":"t-allow","permission_mode":"acceptEdits","stop_hook_active":false,"last_assistant_message_length":278,"keys":["agent_id","agent_transcript_path","agent_type","background_tasks","cwd","effort","hook_event_name","last_assistant_message","permission_mode","prompt_id","session_crons","session_id","stop_hook_active","transcript_path"]}
```

- `session` は `session_id` の SHA-256 の先頭 8 桁です。同じセッションかどうかだけ分かります。
- `agent_id` は例の値です（実行ごとに変わります）。
- `permission_mode` は、hook の入力に入っていた値をそのまま書いています。親（セッション）のモードなのか、サブエージェント自身の有効なモードなのかは、区別できていません。参考値として扱ってください。
- 起動回数や定義ごとの回数は、次のように数えられます。

```
node -e "const l=require('fs').readFileSync('logs/subagent.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='SubagentStart');const c={};for(const e of l)c[e.agent_type]=(c[e.agent_type]||0)+1;console.log(c)"
```

### 動作の方針

- 常に終了コード 0 で終わります。ログの書き込みに失敗しても、セッションを止めません。
- 標準出力と標準エラーには何も出しません。
- 5 秒で必ず終わります。
- 調査用に `--raw` を付けると、入力 JSON の全文を `<出力ファイル>.raw` にも書きます。全文には作業ディレクトリや transcript のパス（ユーザー名を含みうる）が入るため、実験用です。コミットしたり、記事に貼ったりしないでください。

## hook の入力の項目（Claude Code 2.1.293 での実測）

`keys` に残った、実際の入力の項目名です。バージョンが変わると増減します（2.1.158 では `prompt_id` と `effort` がありませんでした）。自分の版の項目は、`keys` で確かめてください。

| イベント | 項目 |
|---|---|
| SubagentStart | `agent_id`, `agent_type`, `cwd`, `hook_event_name`, `prompt_id`, `session_id`, `transcript_path` |
| SubagentStop | 上に加えて `agent_transcript_path`, `background_tasks`, `effort`, `last_assistant_message`, `permission_mode`, `session_crons`, `stop_hook_active`（`prompt_id` は両方にある） |

- 入力には、起動した側（親のエージェント）を示す項目がありません。サブエージェントがサブエージェントを起動した場合も、1 件ずつの開始・終了は同じ形で記録されるため、このログだけでは入れ子の深さは分かりません。

## 注意

- 動作確認は Windows 11、Claude Code 2.1.293、`claude -p`（非対話）で行いました。2.1.158 でも、同じ設定で動きました（項目は上のとおり少し違います）。対話モードや macOS / Linux では確認していません。
- hook の入力の項目名は、この環境（2.1.293）で出力された実際の項目名にもとづきます。バージョンが変わると増減することがあります。`keys` を残しているのは、そのためです。
- 2.1.293 の確認では、サブエージェントの中からサブエージェントが起動された例（孫）が 2 回あり、孫の開始・終了もこのログに 1 件ずつ記録されました（開始 17 件、終了 17 件。うち孫が 2 件ずつ）。詳しくは `../claude-code-subagent-permissions/VERIFIED.md`。深さ 3 以上は確認していません。
