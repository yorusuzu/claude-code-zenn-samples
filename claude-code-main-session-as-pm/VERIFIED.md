# 動作確認記録

> この記録は、このリポジトリに移す前の作業用リポジトリ（`samples/` 以下）で取ったものです。記録内のパス（`samples/...`）は当時のものです。

- 確認日: 2026-09-27
- 環境: Windows 11 Home 10.0.26200, Git Bash (PowerShell 併用)

## 確認したこと

### 1. ファイル構成の確認

```
$ find samples/claude-code-main-session-as-pm -type f | sort
samples/claude-code-main-session-as-pm/CLAUDE.md
samples/claude-code-main-session-as-pm/LICENSES.md
samples/claude-code-main-session-as-pm/README.md
```

想定通り 3 ファイル（`CLAUDE.md`, `README.md`, `LICENSES.md`）が存在することを確認した。

### 2. 内容の一貫性確認（目視）

`CLAUDE.md` 内の「ディレクトリ」節に記載した `research/`, `plans/`, `drafts/`, `reviews/` と、
「組織」表の出力先列（`research/`, `drafts/`, `reviews/`）が矛盾していないことを目視で確認した。

## 確認していないこと（正直な申告）

- `CLAUDE.md` は Markdown ファイル 1 つであり、YAML frontmatter を持たない（Claude Code の
  サブエージェント定義ファイルとは異なり、プロジェクトルートの `CLAUDE.md` に frontmatter 構文の要件はないため）。
  そのためこのサンプルに対しては frontmatter パース検証を行っていない。
- **Claude Code 本体でこのテンプレートを実際にプロジェクトルートに置き、メインセッションに複数エージェントへの
  指示出しをさせて PM パターンが機能することを確認する実行検証は、この記録を取った時点では行っていない。**
  内容は筆者が運用している作業用リポジトリ（非公開）のルートの `CLAUDE.md`（そのリポジトリで実際に運用している役割表・標準ワークフロー・ガードレール）を、
  固有情報（Zenn 収益化の目的、円建ての目標額、`articles/`・`books/` などの Zenn 固有ディレクトリ名）を
  取り除いて汎用化したものである。

## 記事で扱った事象の記録: 新規作成したサブエージェントを名前で呼べなかった件

- 日付: 2026-09-27
- 状況: 空のリポジトリをクローンしてセッションを開始し、そのセッション内で `.claude/agents/` ディレクトリと 7 つのエージェント定義ファイルを新規作成した。その直後に `market-researcher` を名前指定で委任しようとしたところ、次のエラーになった。

  ```
  Agent type 'market-researcher' not found. Available agents: claude, claude-code-guide, Explore, general-purpose, Plan, statusline-setup
  ```

- 対処: `general-purpose` エージェントに `.claude/agents/market-researcher.md` を読ませ、その定義に従って作業させた。以降の qa-reviewer などの工程も同じ方法で代行した。
- 原因（公式ドキュメントで確認）: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) に、監視対象はセッション開始時に存在したディレクトリのみで、新しい agents ディレクトリに最初のファイルを作った場合は再起動が必要、と記載がある。今回はセッション開始時に `.claude/agents/` が存在しなかったため、このケースに該当する。
- 未確認: セッションを再起動した後に名前指定で呼べるようになることは、この記録の時点ではまだ確認していない。
