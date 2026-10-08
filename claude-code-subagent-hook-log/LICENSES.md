# 依存関係とライセンス

外部ライブラリ・依存パッケージはありません。`log-subagent.mjs` は Node.js の標準モジュール
（`node:fs`、`node:path`、`node:crypto`）だけを使います。
hook を呼び出す側の Claude Code（CLI）は、このサンプルに同梱していません。各自でインストールしてください。
利用条件は Anthropic の規約に従います。

このサンプルのコード・設定の文面は、記事のために書いたものです。

## このサンプルのライセンス

`log-subagent.mjs`、`settings.example.json`、README などの文面は、MIT ライセンスで利用できます（著作者は筆名 yorusuzu です）。

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
