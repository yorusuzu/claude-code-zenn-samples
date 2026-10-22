# 依存関係とライセンス

## 依存

外部ライブラリや依存パッケージはありません。
`.mjs` のスクリプトは、Node.js の標準モジュールだけを使います（`node:fs`、`node:os`、`node:path`、`node:url`、`node:child_process`）。

検証の対象である Claude Code（CLI）は、このサンプルに同梱していません。各自でインストールしてください。
利用条件は Anthropic の規約に従います。

作業ディレクトリの準備に Git（`git init`）を使います。Git もこのサンプルには同梱していません。

## コピーしたファイル

| このサンプルのファイル | 出所 | 変更 |
|---|---|---|
| `redact.mjs` | `../claude-code-subagent-errors/redact.mjs`（同じ作者、同じ MIT License） | なし（無変更のコピー） |
| `run-case.mjs` | `../claude-code-subagent-errors/run-case.mjs`（同じ作者、同じ MIT License）をもとに書き換え | 次の 3 点を追加した。<br>・ケースごとの設定ファイルの書き込み（project / local / user / `--settings`）<br>・`CLAUDE_CONFIG_DIR` の隔離、managed settings と親ディレクトリの確認<br>・範囲（E3〜E5）ごとの上限と、警告の抽出 |

## このサンプル自体のライセンス

次のものは、この記事のために書いた（実行して得た）ものです。次の MIT License で使えます。

- コード（`*.mjs`）
- 定義（`cases.json`、`rules.json`）
- ダミーのファイル（`lab/zone/secret-*.txt`）
- fixtures

fixtures は、Claude Code の出力を置換したものです。CLI が出した文言そのものの扱いは、Anthropic の規約に従います。

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
