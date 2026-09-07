import {
  type Agent,
  acceptBounty,
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
  type MergeInput,
  markInstallationReposUninstalled,
  markReposUninstalled,
  markSubmissionClosed,
  markSubmissionMerged,
  mergedSubmissionFor,
  moveBountyStatus,
  openSubmissionsFor,
  type RepositoryInput,
  type RepoWithInstallation,
  repoWithInstallationByGithubId,
  repoWithInstallationById,
  type Submission,
  type SubmissionInput,
  settleClaim,
  stakeInUse,
  submissionForPr,
  syncRepos,
  type User,
  type UserInput,
  upsertInstallation,
  upsertSubmission,
  upsertUser,
  userByLogin,
  withdrawClaim,
  type X402Payment,
  x402PaymentById,
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
  acceptBounty(id: string): Promise<boolean>;

  activeClaimsFor(bountyId: string): Promise<Claim[]>;
  activeClaimBy(bountyId: string, githubLogin: string): Promise<Claim | undefined>;
  claimBounty(input: ClaimInput): Promise<Claim>;
  withdrawClaim(bountyId: string, githubLogin: string): Promise<boolean>;

  upsertSubmission(input: SubmissionInput): Promise<Submission>;
  submissionForPr(bountyId: string, prNumber: number): Promise<Submission | undefined>;
  mergedSubmissionFor(bountyId: string): Promise<Submission | undefined>;
  openSubmissionsFor(bountyId: string): Promise<Submission[]>;
  markSubmissionMerged(id: string, input: MergeInput): Promise<void>;
  markSubmissionClosed(id: string): Promise<void>;
  settleClaim(
    claimId: string,
    status: "won" | "lost",
    stakeStatus: "refunded" | "forwarded_to_maintainer" | "none",
  ): Promise<void>;

  x402PaymentById(id: string): Promise<X402Payment | undefined>;
  stakeInUse(paymentId: string): Promise<boolean>;
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
    acceptBounty: (id) => acceptBounty(db, id),

    activeClaimsFor: (bountyId) => activeClaimsFor(db, bountyId),
    activeClaimBy: (bountyId, login) => activeClaimBy(db, bountyId, login),
    claimBounty: (input) => claimBounty(db, input),
    withdrawClaim: (bountyId, login) => withdrawClaim(db, bountyId, login),

    upsertSubmission: (input) => upsertSubmission(db, input),
    submissionForPr: (bountyId, prNumber) => submissionForPr(db, bountyId, prNumber),
    mergedSubmissionFor: (bountyId) => mergedSubmissionFor(db, bountyId),
    openSubmissionsFor: (bountyId) => openSubmissionsFor(db, bountyId),
    markSubmissionMerged: (id, input) => markSubmissionMerged(db, id, input),
    markSubmissionClosed: (id) => markSubmissionClosed(db, id),
    settleClaim: (claimId, status, stakeStatus) => settleClaim(db, claimId, status, stakeStatus),

    x402PaymentById: (id) => x402PaymentById(db, id),
    stakeInUse: (paymentId) => stakeInUse(db, paymentId),
  };
}
