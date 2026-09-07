import { spawnSync } from "node:child_process";

/**
 * Builds and deploys the Worker with a deliberately empty environment.
 *
 * OpenNext snapshots whatever is in `process.env` at build time into the bundle, and
 * `bun run` loads the repository's `.env` before any script starts. Together those two
 * facts put every secret in the monorepo — the Circle entity secret, the GitHub App key,
 * the database URL — inside the deployed Worker. Nothing here needs them: the Worker gets
 * its configuration from wrangler vars and `wrangler secret put` at runtime.
 *
 * So the build runs with an allow-list, and anything not on it is not in the bundle.
 *
 * Named `deploy` rather than `build` on purpose: OpenNext shells out to this package's own
 * `build` script, so a wrapper called `build` spawns itself.
 */

const ALLOWED = [
  "PATH",
  "HOME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "CI",
  "NODE_ENV",
  "NEXT_TELEMETRY_DISABLED",
  // Cloudflare's own credentials, when a deploy follows the build.
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

const env: Record<string, string> = { NEXT_TELEMETRY_DISABLED: "1" };
for (const key of ALLOWED) {
  const value = process.env[key];
  if (value !== undefined) env[key] = value;
}

const result = spawnSync("opennextjs-cloudflare", process.argv.slice(2), {
  cwd: new URL("..", import.meta.url).pathname,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
