#!/usr/bin/env bun
/**
 * Pulls the app's installations and their repositories from GitHub into the database.
 *
 * The `installation` webhook normally does this. This is the recovery path for when
 * nobody was listening — the app was installed before the API was running, or a delivery
 * was lost — and it is safe to run at any time: everything it does is an upsert.
 *
 *   bun run github:sync
 */

import { createDatabase, markReposUninstalled, syncRepos, upsertInstallation } from "@proofwork/db";
import { GitHubAppAuth, GitHubClient } from "@proofwork/github";

const db = createDatabase(require_("DATABASE_URL"));
const auth = new GitHubAppAuth({
  appId: require_("GITHUB_APP_ID"),
  privateKey: require_("GITHUB_APP_PRIVATE_KEY"),
});
const github = new GitHubClient(auth);

async function main(): Promise<void> {
  const installations = await github.listInstallations();
  if (installations.length === 0) {
    console.log("No installations yet. Install the app at https://github.com/apps/proofwork-arc");
    return;
  }

  for (const installation of installations) {
    const row = await upsertInstallation(db, {
      githubInstallationId: BigInt(installation.id),
      accountLogin: installation.accountLogin,
      accountType: installation.accountType === "Organization" ? "Organization" : "User",
      suspended: installation.suspended,
    });

    const repositories = await github.listInstallationRepositories(installation.id);
    const synced = await syncRepos(
      db,
      row.id,
      repositories.map((repository) => ({
        githubRepoId: BigInt(repository.id),
        fullName: repository.fullName,
        private: repository.private,
      })),
    );

    console.log(`${installation.accountLogin} (installation ${installation.id})`);
    for (const repo of synced) {
      console.log(`  ${repo.fullName.padEnd(40)} ${repo.id}`);
    }
    if (repositories.length === 0) {
      console.log("  no repositories selected for this installation");
    }
  }

  // Anything we still think is installed but GitHub no longer reports has gone away.
  const live = new Set<string>();
  for (const installation of installations) {
    for (const repository of await github.listInstallationRepositories(installation.id)) {
      live.add(String(repository.id));
    }
  }
  const stale = (await db.query.repos.findMany()).filter(
    (repo) => repo.installed && !live.has(String(repo.githubRepoId)),
  );
  if (stale.length > 0) {
    await markReposUninstalled(
      db,
      stale.map((repo) => repo.githubRepoId),
    );
    console.log(`\nDeactivated ${stale.length} repository(ies) the app was removed from.`);
  }
}

function require_(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
