#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds and deploys the Worker without the repository's secrets inside it.
 *
 * OpenNext reads the `.env` files off disk — including the monorepo root's, which is where
 * every secret in this project lives — and writes their contents into
 * `.open-next/cloudflare/next-env.mjs`, which the Worker applies to `process.env` at
 * startup. That put the Circle entity secret, the GitHub App key and the database URL in a
 * deployed bundle that has no use for any of them.
 *
 * The Worker gets its configuration from `wrangler.jsonc` vars and `wrangler secret put`,
 * so the correct contents of that file are: nothing. This empties it after the build and
 * refuses to deploy if it ever comes back non-empty.
 *
 * Named `deploy` rather than `build` because OpenNext shells out to this package's own
 * `build` script, so a wrapper called `build` would spawn itself.
 */

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_SNAPSHOT = join(appDir, ".open-next", "cloudflare", "next-env.mjs");
const MODES = ["production", "development", "test"];

function run(args: string[]): void {
  const result = spawnSync("opennextjs-cloudflare", args, { cwd: appDir, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Replaces the build's env snapshot with empty objects. */
function emptySnapshot(): void {
  writeFileSync(ENV_SNAPSHOT, `${MODES.map((mode) => `export const ${mode} = {};`).join("\n")}\n`);
  console.log("next-env.mjs emptied — the Worker reads its configuration from wrangler");
}

/** Fails the deploy rather than shipping a bundle that carries values from `.env`. */
function assertEmpty(): void {
  const contents = readFileSync(ENV_SNAPSHOT, "utf-8");
  const populated = MODES.filter((mode) => !contents.includes(`export const ${mode} = {};`));
  if (populated.length > 0) {
    console.error(
      `refusing to deploy: ${ENV_SNAPSHOT} still carries values for ${populated.join(", ")}`,
    );
    process.exit(1);
  }
}

const [command] = process.argv.slice(2);

if (command === "build") {
  run(["build"]);
  emptySnapshot();
} else {
  assertEmpty();
  run([command ?? "deploy"]);
}
