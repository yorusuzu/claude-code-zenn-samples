# 依存関係とライセンス

## 依存

外部ライブラリ・依存パッケージはありません。`.mjs` のスクリプトは Node.js の標準モジュール
（`node:fs`、`node:os`、`node:path`、`node:url`、`node:child_process`、`node:crypto`）だけを使います。
検証の対象である Claude Code（CLI）は、このサンプルに同梱していません。各自でインストールしてください。
利用条件は Anthropic の規約に従います。

## コピーしたファイル

| このサンプルのファイル | 出所 | 変更 |
|---|---|---|
| `redact.mjs` | `../claude-code-exit-codes/redact.mjs`（同じ作者、同じ MIT License） | なし（無変更のコピー） |
| `lab/hooks/log-subagent.mjs` | `../claude-code-subagent-hook-log/log-subagent.mjs`（同じ作者、同じ MIT License） | なし（無変更のコピー） |
| `run-case.mjs` | `../claude-code-exit-codes/run-case.mjs`（同じ作者、同じ MIT License）をもとに書き換え | 判定（classify-run.mjs）、ダミーキー、設定の隔離を外し、ケースごとの再実行の上限、止める条件の記録、定義の書き換え（Sf1）、hook ログの保存を追加 |

## このサンプル自体のライセンス

このサンプルのコード（`*.mjs`）、設定（`cases.json`、`lab/.claude/settings.json`）、サブエージェント定義（`lab/.claude/agents/*.md`、`lab/drafts/agents/*.md`）、
依頼文（`lab/prompts/*.txt`）、合言葉のファイル（`lab/fixtures/token.txt`）、fixtures は、この記事のために書いた（実行して得た）ものです。次の MIT License で使えます。

```
MIT License

Copyright (c) 2026 yorusuzu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
