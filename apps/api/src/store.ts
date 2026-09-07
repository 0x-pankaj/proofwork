import {
  type Database,
  type Installation,
  type InstallationInput,
  installationByGithubId,
  markInstallationReposUninstalled,
  markReposUninstalled,
  type RepositoryInput,
  type RepoWithInstallation,
  repoWithInstallationByGithubId,
  repoWithInstallationById,
  syncRepos,
  upsertInstallation,
} from "@proofwork/db";

/**
 * Everything the API reads or writes, as one interface.
 *
 * Handlers depend on this rather than on a live Drizzle client, which is what lets the
 * webhook tests assert real behaviour — which repositories were deactivated, which
 * comment was posted — without a Neon connection. `databaseStore` is the only
 * implementation that talks to Postgres.
 */
export interface Store {
  upsertInstallation(input: InstallationInput): Promise<Installation>;
  installationByGithubId(githubInstallationId: bigint): Promise<Installation | undefined>;
  syncRepos(installationId: string, repositories: RepositoryInput[]): Promise<void>;
  markReposUninstalled(githubRepoIds: bigint[]): Promise<void>;
  markInstallationReposUninstalled(installationId: string): Promise<void>;
  repoByGithubId(githubRepoId: bigint): Promise<RepoWithInstallation | undefined>;
  repoById(repoId: string): Promise<RepoWithInstallation | undefined>;
}

export function databaseStore(db: Database): Store {
  return {
    upsertInstallation: (input) => upsertInstallation(db, input),
    installationByGithubId: (id) => installationByGithubId(db, id),
    syncRepos: async (installationId, repositories) => {
      await syncRepos(db, installationId, repositories);
    },
    markReposUninstalled: (githubRepoIds) => markReposUninstalled(db, githubRepoIds),
    markInstallationReposUninstalled: (installationId) =>
      markInstallationReposUninstalled(db, installationId),
    repoByGithubId: (githubRepoId) => repoWithInstallationByGithubId(db, githubRepoId),
    repoById: (repoId) => repoWithInstallationById(db, repoId),
  };
}
