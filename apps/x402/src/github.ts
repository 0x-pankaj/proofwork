import { type Database, repoWithInstallationByFullName } from "@proofwork/db";
import { GitHubAppAuth, GitHubClient, type RepoRef } from "@proofwork/github";
import { type Env, required } from "./env";

/**
 * The GitHub side of the paid endpoints.
 *
 * Diffs are read with the installation's own token, so a private repository that has
 * installed Proofwork is readable and one that has not is simply not for sale here.
 */

export function githubClient(env: Env): GitHubClient {
  return new GitHubClient(
    new GitHubAppAuth({
      appId: required(env, "GITHUB_APP_ID"),
      privateKey: required(env, "GITHUB_APP_PRIVATE_KEY"),
    }),
  );
}

export function installationLookup(db: Database) {
  return async (repoFullName: string): Promise<RepoRef | undefined> => {
    const found = await repoWithInstallationByFullName(db, repoFullName);
    if (!found?.repo.installed || found.installation.suspended) return undefined;
    return {
      fullName: found.repo.fullName,
      installationId: Number(found.installation.githubInstallationId),
    };
  };
}
