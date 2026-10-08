#!/usr/bin/env node
// probe-env.mjs
// 検証用。hook を実行しているシェルと環境を推定するための手がかりを、値を書かずに記録する。
//   - CLAUDE* で始まる環境変数の「名前」だけ（値は書かない）
//   - MSYSTEM / SHELL / BASH_VERSION / PSModulePath の有無（SHELL だけは実行ファイル名の部分のみ）
//   - 親プロセスの種類は取らない（OS 依存のため）
// 使い方: node probe-env.mjs <ログファイル>
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

setTimeout(() => process.exit(0), 3000).unref();
try {
  const file = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), process.argv[2] ?? "logs/env.jsonl");
  const env = process.env;
  const entry = {
    ts: new Date().toISOString(),
    claude_env_names: Object.keys(env).filter((k) => /^(ANTHROPIC|CLAUDE|USE_LOCAL_OAUTH|USE_STAGING_OAUTH)/.test(k)).sort(),
    has_max_spawn_depth: "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH" in env,
    has_CLAUDE_PROJECT_DIR: "CLAUDE_PROJECT_DIR" in env,
    has_MSYSTEM: "MSYSTEM" in env,
    has_BASH_VERSION: "BASH_VERSION" in env,
    has_PSModulePath: "PSModulePath" in env,
    shell_basename: env.SHELL ? basename(env.SHELL) : null,
    node: process.version,
    platform: process.platform,
  };
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
} catch {
  // 握りつぶす
}
process.exit(0);
