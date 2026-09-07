import {
  type Agent,
  type AgentRecord,
  acceptBounty,
  activeBountyForIssue,
  activeClaimBy,
  activeClaimsFor,
  activeClaimsWithPolicy,
  agentByApiKeyHash,
  agentByGithubLogin,
  agentById,
  agentByWalletAddress,
  agentRecord,
  type Bounty,
  type BountyFilter,
  type BountyListing,
  bountiesForFunder,
  bountyById,
  bountyByJobId,
  bountyWithRepo,
  type Claim,
  type ClaimInput,
  type ClaimListing,
  claimBounty,
  claimById,
  claimsFor,
  claimsForUser,
  completeBounty,
  confirmBountyFunded,
  createAgent,
  createBounty,
  type Database,
  expireBounties,
  expireClaims,
  forceBountyStatus,
  type Installation,
  type InstallationInput,
  installationByGithubId,
  listBounties,
  loseOtherClaims,
  type MergeInput,
  markBountyFunding,
  markInstallationReposUninstalled,
  markReposUninstalled,
  markSettlementComplete,
  markSettlementFailed,
  markSettlementSubmitted,
  markSubmissionClosed,
  markSubmissionMerged,
  mergedSubmissionFor,
  moveBountyStatus,
  type NewAgent,
  type NewBountyInput,
  openSettlement,
  openSubmissionsFor,
  type Repo,
  type RepoSettings,
  type RepositoryInput,
  type RepoWithInstallation,
  type ReputationInput,
  readChainCursor,
  recordBountyRefund,
  recordReputationEvent,
  reposForUser,
  repoWithInstallationByGithubId,
  repoWithInstallationById,
  type Settlement,
  type SettlementInput,
  type SettlementListing,
  type StaleClaim,
  type Submission,
  type SubmissionInput,
  setAgentIdentity,
  setPayoutAddress,
  setRepoSettings,
  settleClaim,
  settlementForBounty,
  settlementsForUser,
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
  writeChainCursor,
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
  reposForUser(userId: string, login: string): Promise<RepoWithInstallation[]>;
  setRepoSettings(repoId: string, settings: RepoSettings): Promise<Repo | undefined>;

  upsertUser(input: UserInput): Promise<User>;
  userByLogin(login: string): Promise<User | undefined>;
  userById(id: string): Promise<User | undefined>;
  setPayoutAddress(userId: string, payoutAddress: string): Promise<void>;
  agentByGithubLogin(login: string): Promise<Agent | undefined>;
  agentById(id: string): Promise<Agent | undefined>;
  agentByWalletAddress(walletAddress: string): Promise<Agent | undefined>;
  agentByApiKeyHash(hash: string): Promise<Agent | undefined>;
  createAgent(input: NewAgent): Promise<Agent>;
  setAgentIdentity(
    id: string,
    input: { erc8004AgentId: bigint | null; metadataUri: string | null },
  ): Promise<void>;
  agentRecord(agentId: string): Promise<AgentRecord>;

  activeBountyForIssue(repoId: string, issueNumber: number): Promise<Bounty | undefined>;
  bountyById(id: string): Promise<Bounty | undefined>;
  bountyByJobId(jobId: bigint): Promise<Bounty | undefined>;
  forceBountyStatus(
    id: string,
    to: Bounty["status"],
    extra?: { settleTxHash?: string; jobId?: bigint },
  ): Promise<boolean>;
  expireBounties(now: Date): Promise<Bounty[]>;
  recordBountyRefund(
    id: string,
    refund: { status: Bounty["status"]; txHash: string },
  ): Promise<boolean>;
  bountiesForFunder(funderUserId: string): Promise<BountyListing[]>;
  claimsForUser(userId: string): Promise<ClaimListing[]>;
  settlementsForUser(userId: string): Promise<SettlementListing[]>;
  bountyWithRepo(id: string): Promise<BountyListing | undefined>;
  listBounties(filter: BountyFilter): Promise<BountyListing[]>;
  createBounty(input: NewBountyInput): Promise<Bounty>;
  markBountyFunding(id: string, createTxHash: string): Promise<boolean>;
  confirmBountyFunded(
    id: string,
    input: { jobId: bigint; createTxHash: string; autoAccept: boolean },
  ): Promise<boolean>;
  moveBountyStatus(id: string, from: Bounty["status"], to: Bounty["status"]): Promise<boolean>;
  acceptBounty(id: string): Promise<boolean>;
  completeBounty(id: string, input: { txHash: string; circleTxId: string }): Promise<boolean>;

  activeClaimsFor(bountyId: string): Promise<Claim[]>;
  claimsFor(bountyId: string): Promise<Claim[]>;
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

  activeClaimsWithPolicy(): Promise<StaleClaim[]>;
  expireClaims(ids: string[]): Promise<number>;

  readChainCursor(chainId: number): Promise<bigint | undefined>;
  writeChainCursor(chainId: number, lastBlock: bigint): Promise<void>;

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
    reposForUser: (userId, login) => reposForUser(db, userId, login),
    setRepoSettings: (repoId, settings) => setRepoSettings(db, repoId, settings),

    upsertUser: (input) => upsertUser(db, input),
    userByLogin: (login) => userByLogin(db, login),
    userById: (id) => userById(db, id),
    setPayoutAddress: (userId, payoutAddress) => setPayoutAddress(db, userId, payoutAddress),
    agentByGithubLogin: (login) => agentByGithubLogin(db, login),
    agentById: (id) => agentById(db, id),
    agentByWalletAddress: (walletAddress) => agentByWalletAddress(db, walletAddress),
    agentByApiKeyHash: (hash) => agentByApiKeyHash(db, hash),
    createAgent: (input) => createAgent(db, input),
    setAgentIdentity: (id, input) => setAgentIdentity(db, id, input),
    agentRecord: (agentId) => agentRecord(db, agentId),

    activeBountyForIssue: (repoId, issueNumber) => activeBountyForIssue(db, repoId, issueNumber),
    bountyById: (id) => bountyById(db, id),
    bountyByJobId: (jobId) => bountyByJobId(db, jobId),
    forceBountyStatus: (id, to, extra) => forceBountyStatus(db, id, to, extra),
    expireBounties: (now) => expireBounties(db, now),
    bountiesForFunder: (funderUserId) => bountiesForFunder(db, funderUserId),
    claimsForUser: (userId) => claimsForUser(db, userId),
    settlementsForUser: (userId) => settlementsForUser(db, userId),
    bountyWithRepo: (id) => bountyWithRepo(db, id),
    listBounties: (filter) => listBounties(db, filter),
    createBounty: (input) => createBounty(db, input),
    markBountyFunding: (id, createTxHash) => markBountyFunding(db, id, createTxHash),
    confirmBountyFunded: (id, input) => confirmBountyFunded(db, id, input),
    moveBountyStatus: (id, from, to) => moveBountyStatus(db, id, from, to),
    recordBountyRefund: (id, refund) => recordBountyRefund(db, id, refund),
    acceptBounty: (id) => acceptBounty(db, id),
    completeBounty: (id, input) => completeBounty(db, id, input),

    activeClaimsFor: (bountyId) => activeClaimsFor(db, bountyId),
    claimsFor: (bountyId) => claimsFor(db, bountyId),
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

    activeClaimsWithPolicy: () => activeClaimsWithPolicy(db),
    expireClaims: (ids) => expireClaims(db, ids),

    readChainCursor: (chainId) => readChainCursor(db, chainId),
    writeChainCursor: (chainId, lastBlock) => writeChainCursor(db, chainId, lastBlock),

    x402PaymentById: (id) => x402PaymentById(db, id),
    stakeInUse: (paymentId) => stakeInUse(db, paymentId),
  };
}
