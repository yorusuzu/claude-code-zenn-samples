# 依存関係とライセンス

| ファイル | 実行環境 | 外部ライブラリ | ライセンス |
|---|---|---|---|
| `check-publish-count.mjs` | Node.js | なし（標準ライブラリの `node:child_process`, `node:fs`, `node:path` のみ） | 依存なし |

依存なし。

`check-publish-count.mjs` は、外部コマンドとして git を呼び出します。
git はこのサンプルに同梱しておらず、利用者がそれぞれインストールしたものを使います。
