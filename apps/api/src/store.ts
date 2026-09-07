import {
  type Agent,
  activeBountyForIssue,
  activeClaimBy,
  activeClaimsFor,
  agentByGithubLogin,
  type Bounty,
  bountyById,
  type Claim,
  type ClaimInput,
  claimBounty,
  type Database,
  type Installation,
  type InstallationInput,
  installationByGithubId,
  markInstallationReposUninstalled,
  markReposUninstalled,
  moveBountyStatus,
  type RepositoryInput,
  type RepoWithInstallation,
  repoWithInstallationByGithubId,
  repoWithInstallationById,
  syncRepos,
  type User,
  type UserInput,
  upsertInstallation,
  upsertUser,
  userByLogin,
  withdrawClaim,
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

  upsertUser(input: UserInput): Promise<User>;
  userByLogin(login: string): Promise<User | undefined>;
  agentByGithubLogin(login: string): Promise<Agent | undefined>;

  activeBountyForIssue(repoId: string, issueNumber: number): Promise<Bounty | undefined>;
  bountyById(id: string): Promise<Bounty | undefined>;
  moveBountyStatus(id: string, from: Bounty["status"], to: Bounty["status"]): Promise<boolean>;

  activeClaimsFor(bountyId: string): Promise<Claim[]>;
  activeClaimBy(bountyId: string, githubLogin: string): Promise<Claim | undefined>;
  claimBounty(input: ClaimInput): Promise<Claim>;
  withdrawClaim(bountyId: string, githubLogin: string): Promise<boolean>;
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

    upsertUser: (input) => upsertUser(db, input),
    userByLogin: (login) => userByLogin(db, login),
    agentByGithubLogin: (login) => agentByGithubLogin(db, login),

    activeBountyForIssue: (repoId, issueNumber) => activeBountyForIssue(db, repoId, issueNumber),
    bountyById: (id) => bountyById(db, id),
    moveBountyStatus: (id, from, to) => moveBountyStatus(db, id, from, to),

    activeClaimsFor: (bountyId) => activeClaimsFor(db, bountyId),
    activeClaimBy: (bountyId, login) => activeClaimBy(db, bountyId, login),
    claimBounty: (input) => claimBounty(db, input),
    withdrawClaim: (bountyId, login) => withdrawClaim(db, bountyId, login),
  };
}
