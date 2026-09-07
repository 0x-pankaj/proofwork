import type { RepoWithInstallation } from "@proofwork/db";
import type { RepoRef } from "@proofwork/github";

/** What the GitHub client needs to act on a repository: its name and a token to mint. */
export function repoRef(found: RepoWithInstallation): RepoRef {
  return {
    fullName: found.repo.fullName,
    installationId: Number(found.installation.githubInstallationId),
  };
}
