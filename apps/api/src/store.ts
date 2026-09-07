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
  claimById,
  completeBounty,
  type Database,
  type Installation,
  type InstallationInput,
  installationByGithubId,
  loseOtherClaims,
  type MergeInput,
  markInstallationReposUninstalled,
  markReposUninstalled,
  markSettlementComplete,
  markSettlementFailed,
  markSettlementSubmitted,
  markSubmissionClosed,
  markSubmissionMerged,
  mergedSubmissionFor,
  moveBountyStatus,
  openSettlement,
  openSubmissionsFor,
  type RepositoryInput,
  type RepoWithInstallation,
  type ReputationInput,
  recordReputationEvent,
  repoWithInstallationByGithubId,
  repoWithInstallationById,
  type Settlement,
  type SettlementInput,
  type Submission,
  type SubmissionInput,
  settleClaim,
  settlementForBounty,
  stakeInUse,
  submissionForPr,
  syncRepos,
  type User,
  type UserInput,
  upsertInstallation,
  upsertSubmission,
  upsertUser,
  userById,
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
  userById(id: string): Promise<User | undefined>;
  agentByGithubLogin(login: string): Promise<Agent | undefined>;

  activeBountyForIssue(repoId: string, issueNumber: number): Promise<Bounty | undefined>;
  bountyById(id: string): Promise<Bounty | undefined>;
  moveBountyStatus(id: string, from: Bounty["status"], to: Bounty["status"]): Promise<boolean>;
  acceptBounty(id: string): Promise<boolean>;
  completeBounty(id: string, input: { txHash: string; circleTxId: string }): Promise<boolean>;

  activeClaimsFor(bountyId: string): Promise<Claim[]>;
  activeClaimBy(bountyId: string, githubLogin: string): Promise<Claim | undefined>;
  claimById(id: string): Promise<Claim | undefined>;
  loseOtherClaims(bountyId: string, winnerClaimId: string): Promise<void>;
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
    stakeStatus?: "refunded" | "forwarded_to_maintainer" | "none",
  ): Promise<void>;

  openSettlement(input: SettlementInput): Promise<Settlement>;
  settlementForBounty(bountyId: string): Promise<Settlement | undefined>;
  markSettlementSubmitted(bountyId: string, circleTxId: string): Promise<void>;
  markSettlementComplete(
    bountyId: string,
    input: { txHash: string; circleTxId: string },
  ): Promise<void>;
  markSettlementFailed(
    bountyId: string,
    input: { error: string; circleTxId?: string },
  ): Promise<void>;
  recordReputationEvent(input: ReputationInput): Promise<void>;

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
    userById: (id) => userById(db, id),
    agentByGithubLogin: (login) => agentByGithubLogin(db, login),

    activeBountyForIssue: (repoId, issueNumber) => activeBountyForIssue(db, repoId, issueNumber),
    bountyById: (id) => bountyById(db, id),
    moveBountyStatus: (id, from, to) => moveBountyStatus(db, id, from, to),
    acceptBounty: (id) => acceptBounty(db, id),
    completeBounty: (id, input) => completeBounty(db, id, input),

    activeClaimsFor: (bountyId) => activeClaimsFor(db, bountyId),
    activeClaimBy: (bountyId, login) => activeClaimBy(db, bountyId, login),
    claimById: (id) => claimById(db, id),
    loseOtherClaims: (bountyId, winnerClaimId) => loseOtherClaims(db, bountyId, winnerClaimId),
    claimBounty: (input) => claimBounty(db, input),
    withdrawClaim: (bountyId, login) => withdrawClaim(db, bountyId, login),

    upsertSubmission: (input) => upsertSubmission(db, input),
    submissionForPr: (bountyId, prNumber) => submissionForPr(db, bountyId, prNumber),
    mergedSubmissionFor: (bountyId) => mergedSubmissionFor(db, bountyId),
    openSubmissionsFor: (bountyId) => openSubmissionsFor(db, bountyId),
    markSubmissionMerged: (id, input) => markSubmissionMerged(db, id, input),
    markSubmissionClosed: (id) => markSubmissionClosed(db, id),
    settleClaim: (claimId, status, stakeStatus) => settleClaim(db, claimId, status, stakeStatus),

    openSettlement: (input) => openSettlement(db, input),
    settlementForBounty: (bountyId) => settlementForBounty(db, bountyId),
    markSettlementSubmitted: (bountyId, circleTxId) =>
      markSettlementSubmitted(db, bountyId, circleTxId),
    markSettlementComplete: (bountyId, input) => markSettlementComplete(db, bountyId, input),
    markSettlementFailed: (bountyId, input) => markSettlementFailed(db, bountyId, input),
    recordReputationEvent: (input) => recordReputationEvent(db, input),

    x402PaymentById: (id) => x402PaymentById(db, id),
    stakeInUse: (paymentId) => stakeInUse(db, paymentId),
  };
}
