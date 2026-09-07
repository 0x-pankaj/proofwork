#!/usr/bin/env bun
/**
 * Pushes a Worker's secrets from the root `.env`.
 *
 * `wrangler secret put` reads stdin literally, and shell extraction from `.env` keeps the
 * surrounding quotes — which produces a Worker holding `"postgresql://…"` instead of a
 * connection string, and a 500 that only shows up in production. Bun's loader strips them,
 * so the values go through here rather than through a shell pipeline.
 *
 *   bun run scripts/worker-secrets.ts apps/x402 DATABASE_URL GITHUB_APP_ID
 */

import { spawnSync } from "node:child_process";

const [cwd, ...keys] = process.argv.slice(2);
if (!cwd || keys.length === 0) {
  console.error("usage: worker-secrets.ts <app dir> <KEY> [KEY...]");
  process.exit(1);
}

for (const key of keys) {
  const value = process.env[key];
  if (!value) {
    console.log(`${key}  skipped, not set in .env`);
    continue;
  }

  const result = spawnSync("bunx", ["wrangler", "secret", "put", key], {
    cwd,
    input: value,
    stdio: ["pipe", "pipe", "inherit"],
  });
  console.log(`${key}  ${result.status === 0 ? "uploaded" : "FAILED"}`);
}
