import type {
  Agent,
  AgentRecord,
  Bounty,
  Claim,
  Installation,
  NewAgent,
  RepositoryInput,
  RepoWithInstallation,
  ReputationInput,
  Settlement,
  Submission,
  User,
  X402Payment,
} from "@proofwork/db";
import type { Store } from "./store";

/**
 * An in-memory Store for tests. It keeps enough state to answer reads, and records the
 * writes a handler made, so tests assert behaviour rather than mock call order.
 */
export interface FakeStore extends Store {
  installations: Map<string, Installation>;
  repos: Map<string, RepoWithInstallation>;
  users: Map<string, User>;
  agents: Map<string, Agent>;
  bounties: Map<string, Bounty>;
  claims: Claim[];
  submissions: Submission[];
  settlements: Map<string, Settlement>;
  reputation: ReputationInput[];
  payments: Map<string, X402Payment>;
  cursors: Map<number, bigint>;
  synced: Array<{ installationId: string; repositories: RepositoryInput[] }>;
  uninstalledRepoIds: bigint[];
  uninstalledInstallations: string[];
}

export interface FakeStoreSeed {
  repos?: RepoWithInstallation[];
  users?: User[];
  agents?: Agent[];
  bounties?: Bounty[];
  claims?: Claim[];
  submissions?: Submission[];
  settlements?: Settlement[];
  payments?: X402Payment[];
}

export function fakeInstallation(overrides: Partial<Installation> = {}): Installation {
  return {
    id: "installation-1",
    githubInstallationId: 900n,
    accountLogin: "0x-pankaj",
    accountType: "User",
    suspended: false,
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeRepo(overrides: Partial<RepoWithInstallation["repo"]> = {}) {
  return {
    id: "repo-1",
    githubRepoId: 100n,
    fullName: "0x-pankaj/proofwork",
    installationId: "installation-1",
    private: false,
    installed: true,
    evaluatorMode: "proofwork" as const,
    maintainerUserId: null,
    maintainerPayoutAddress: null,
    policy: {
      aiContributions: "disclosure" as const,
      minStakeUsdc: "1000000",
      autoAccept: true,
      claimTtlHours: 72,
    },
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    githubId: 5n,
    login: "octocat",
    name: null,
    avatarUrl: null,
    email: null,
    payoutAddress: "0x52679a68dc5c1c31f1ac22b89431a2b06524c4aa",
    payoutKind: "eoa",
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    ownerUserId: null,
    name: "proofwork-reference-agent",
    description: null,
    walletAddress: "0x3975261337566c22a5129eb82bdcc8c364c4a313",
    githubLogin: "proofwork-agent",
    erc8004AgentId: null,
    metadataUri: null,
    apiKeyHash: "hash",
    reputationScore: 0,
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeBounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    id: "bounty-1",
    repoId: "repo-1",
    issueNumber: 12,
    issueTitle: "Add Arc support",
    issueUrl: "https://github.com/0x-pankaj/proofwork/issues/12",
    description: "",
    amountUsdc: 200_000_000n,
    feeUsdc: 6_000_000n,
    maintainerAddress: "0x3975261337566c22a5129eb82bdcc8c364c4a313",
    maintainerRewardBps: 1500,
    funderUserId: "user-funder",
    funderAddress: "0xb57af3feba9d6759ce38452247e066981dddebb3",
    evaluatorAddress: "0x52679a68dc5c1c31f1ac22b89431a2b06524c4aa",
    jobId: 1n,
    status: "open",
    tags: [],
    acceptedAt: null,
    expiresAt: new Date("2026-09-30T00:00:00Z"),
    createTxHash: "0xfund",
    settleTxHash: null,
    refundTxHash: null,
    circleTxId: null,
    createdAt: new Date("2026-09-07T00:00:00Z"),
    updatedAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    bountyId: "bounty-1",
    claimId: "claim-1",
    prNumber: 21,
    prUrl: "https://github.com/0x-pankaj/proofwork/pull/21",
    headSha: "a".repeat(40),
    mergeSha: null,
    mergedAt: null,
    deliverableHash: null,
    status: "open",
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeStakePayment(overrides: Partial<X402Payment> = {}): X402Payment {
  return {
    id: "payment-1",
    endpoint: "/v1/claims/stake",
    payer: "0x3975261337566c22a5129eb82bdcc8c364c4a313",
    amountUsdc: 1_000_000n,
    network: "eip155:5042002",
    requestId: "req-1",
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function fakeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim-1",
    bountyId: "bounty-1",
    claimantKind: "user",
    userId: "user-1",
    agentId: null,
    githubLogin: "octocat",
    payoutAddress: "0x52679a68dc5c1c31f1ac22b89431a2b06524c4aa",
    status: "active",
    stakePaymentId: null,
    stakeStatus: "none",
    stakeTxHash: null,
    createdAt: new Date("2026-09-07T00:00:00Z"),
    ...overrides,
  };
}

export function createFakeStore(seed: FakeStoreSeed | RepoWithInstallation[] = {}): FakeStore {
  const seeded: FakeStoreSeed = Array.isArray(seed) ? { repos: seed } : seed;
  const repos = seeded.repos ?? [];

  const store: FakeStore = {
    installations: new Map(
      repos.map((entry) => [String(entry.installation.githubInstallationId), entry.installation]),
    ),
    repos: new Map(repos.map((entry) => [String(entry.repo.githubRepoId), entry])),
    users: new Map((seeded.users ?? []).map((user) => [user.login, user])),
    agents: new Map((seeded.agents ?? []).map((agent) => [agent.githubLogin, agent])),
    bounties: new Map((seeded.bounties ?? []).map((bounty) => [bounty.id, bounty])),
    claims: [...(seeded.claims ?? [])],
    submissions: [...(seeded.submissions ?? [])],
    settlements: new Map((seeded.settlements ?? []).map((row) => [row.bountyId, row])),
    reputation: [],
    payments: new Map((seeded.payments ?? []).map((payment) => [payment.id, payment])),
    cursors: new Map(),
    synced: [],
    uninstalledRepoIds: [],
    uninstalledInstallations: [],

    async upsertInstallation(input) {
      const key = String(input.githubInstallationId);
      const existing = store.installations.get(key);
      const installation = fakeInstallation({
        ...existing,
        githubInstallationId: input.githubInstallationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        suspended: input.suspended ?? false,
        id: existing?.id ?? `installation-${key}`,
      });
      store.installations.set(key, installation);
      return installation;
    },

    async installationByGithubId(githubInstallationId) {
      return store.installations.get(String(githubInstallationId));
    },

    async syncRepos(installationId, repositories) {
      // The database implementation returns early on an empty list; so does this one.
      if (repositories.length === 0) return;
      store.synced.push({ installationId, repositories });
    },

    async markReposUninstalled(githubRepoIds) {
      store.uninstalledRepoIds.push(...githubRepoIds);
    },

    async markInstallationReposUninstalled(installationId) {
      store.uninstalledInstallations.push(installationId);
    },

    async repoByGithubId(githubRepoId) {
      return store.repos.get(String(githubRepoId));
    },

    async repoById(repoId) {
      return [...store.repos.values()].find((entry) => entry.repo.id === repoId);
    },

    async reposForUser(userId, login) {
      return [...store.repos.values()].filter(
        (entry) =>
          entry.repo.installed &&
          (entry.installation.accountLogin === login || entry.repo.maintainerUserId === userId),
      );
    },

    async setRepoSettings(repoId, settings) {
      const entry = [...store.repos.values()].find((row) => row.repo.id === repoId);
      if (!entry) return undefined;
      const repo = {
        ...entry.repo,
        ...(settings.policy ? { policy: settings.policy } : {}),
        ...(settings.maintainerPayoutAddress !== undefined
          ? { maintainerPayoutAddress: settings.maintainerPayoutAddress }
          : {}),
        ...(settings.maintainerUserId !== undefined
          ? { maintainerUserId: settings.maintainerUserId }
          : {}),
      };
      store.repos.set(String(repo.githubRepoId), { ...entry, repo });
      return repo;
    },

    async bountiesForFunder(funderUserId) {
      const listings = [];
      for (const bounty of store.bounties.values()) {
        if (bounty.funderUserId !== funderUserId) continue;
        const found = await store.repoById(bounty.repoId);
        if (found) listings.push({ bounty, repo: found.repo });
      }
      return listings;
    },

    async claimsForUser(userId) {
      const listings = [];
      for (const claim of store.claims) {
        if (claim.userId !== userId) continue;
        const bounty = store.bounties.get(claim.bountyId);
        const found = bounty ? await store.repoById(bounty.repoId) : undefined;
        if (bounty && found) listings.push({ claim, bounty, repo: found.repo });
      }
      return listings;
    },

    async settlementsForUser(userId) {
      const listings = [];
      for (const settlement of store.settlements.values()) {
        const claim = store.claims.find((row) => row.id === settlement.claimId);
        if (claim?.userId !== userId) continue;
        const bounty = store.bounties.get(settlement.bountyId);
        const found = bounty ? await store.repoById(bounty.repoId) : undefined;
        if (bounty && found) listings.push({ settlement, bounty, repo: found.repo });
      }
      return listings;
    },

    async upsertUser(input) {
      const user = fakeUser({
        ...store.users.get(input.login),
        githubId: input.githubId,
        login: input.login,
      });
      store.users.set(input.login, user);
      return user;
    },

    async userByLogin(login) {
      return store.users.get(login);
    },

    async userById(id) {
      return [...store.users.values()].find((user) => user.id === id);
    },

    async setPayoutAddress(userId, payoutAddress) {
      for (const [login, user] of store.users) {
        if (user.id === userId) store.users.set(login, { ...user, payoutAddress });
      }
    },

    async agentByGithubLogin(login) {
      return store.agents.get(login);
    },

    async agentById(id) {
      return [...store.agents.values()].find((agent) => agent.id === id);
    },

    async agentByWalletAddress(walletAddress) {
      return [...store.agents.values()].find(
        (agent) => agent.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
      );
    },

    async agentByApiKeyHash(hash) {
      return [...store.agents.values()].find((agent) => agent.apiKeyHash === hash);
    },

    async createAgent(input: NewAgent) {
      const agent: Agent = {
        id: input.id ?? `agent-${store.agents.size + 1}`,
        ownerUserId: input.ownerUserId ?? null,
        name: input.name,
        description: input.description ?? null,
        walletAddress: input.walletAddress,
        githubLogin: input.githubLogin,
        erc8004AgentId: input.erc8004AgentId ?? null,
        metadataUri: input.metadataUri ?? null,
        apiKeyHash: input.apiKeyHash,
        reputationScore: input.reputationScore ?? 0,
        createdAt: input.createdAt ?? new Date("2026-09-07T00:00:00Z"),
      };
      store.agents.set(agent.githubLogin, agent);
      return agent;
    },

    async setAgentIdentity(id, input) {
      for (const [login, agent] of store.agents) {
        if (agent.id !== id) continue;
        store.agents.set(login, {
          ...agent,
          erc8004AgentId: input.erc8004AgentId,
          metadataUri: input.metadataUri,
        });
      }
    },

    async agentRecord(agentId): Promise<AgentRecord> {
      const won = store.claims.filter(
        (claim) => claim.agentId === agentId && claim.status === "won",
      );
      const earnedUsdc = won.reduce((total, claim) => {
        const settlement = store.settlements.get(claim.bountyId);
        const bounty = store.bounties.get(claim.bountyId);
        if (!settlement || settlement.status !== "complete" || !bounty) return total;
        const maintainer = (settlement.amountUsdc * BigInt(bounty.maintainerRewardBps)) / 10_000n;
        return total + settlement.amountUsdc - maintainer;
      }, 0n);

      return {
        settled: won.length,
        earnedUsdc,
        reputation: store.reputation
          .filter((event) => event.agentId === agentId)
          .map((event, index) => ({
            id: `reputation-${index + 1}`,
            agentId: event.agentId,
            bountyId: event.bountyId,
            score: event.score,
            txHash: event.txHash ?? null,
            createdAt: new Date("2026-09-07T00:00:00Z"),
          })),
      };
    },

    async activeBountyForIssue(repoId, issueNumber) {
      return [...store.bounties.values()].find(
        (bounty) =>
          bounty.repoId === repoId &&
          bounty.issueNumber === issueNumber &&
          !["settled", "rejected", "expired", "cancelled"].includes(bounty.status),
      );
    },

    async bountyById(id) {
      return store.bounties.get(id);
    },

    async bountyByJobId(jobId) {
      return [...store.bounties.values()].find((bounty) => bounty.jobId === jobId);
    },

    async forceBountyStatus(id, to, extra) {
      const bounty = store.bounties.get(id);
      if (!bounty) return false;
      if (["settled", "rejected", "expired", "cancelled"].includes(bounty.status)) return false;
      store.bounties.set(id, { ...bounty, status: to, ...extra });
      return true;
    },

    async recordStakeResolution(claimId, outcome, txHash) {
      const index = store.claims.findIndex((claim) => claim.id === claimId);
      if (index === -1 || store.claims[index]?.stakeStatus !== "held") return false;
      const claim = store.claims[index];
      if (!claim) return false;
      store.claims[index] = { ...claim, stakeStatus: outcome, stakeTxHash: txHash };
      return true;
    },

    async recordBountyRefund(id, refund) {
      const bounty = store.bounties.get(id);
      if (!bounty || bounty.refundTxHash) return false;
      store.bounties.set(id, {
        ...bounty,
        status: refund.status,
        refundTxHash: refund.txHash,
      });
      return true;
    },

    async expireBounties(now) {
      const expirable = ["pending_accept", "open", "claimed", "submitted"];
      const expired = [];
      for (const bounty of store.bounties.values()) {
        if (!expirable.includes(bounty.status) || bounty.expiresAt >= now) continue;
        const updated = { ...bounty, status: "expired" as const };
        store.bounties.set(bounty.id, updated);
        expired.push(updated);
      }
      return expired;
    },

    async activeClaimsWithPolicy() {
      const stale = [];
      for (const claim of store.claims) {
        if (claim.status !== "active") continue;
        const bounty = store.bounties.get(claim.bountyId);
        if (!bounty || !["open", "claimed"].includes(bounty.status)) continue;
        const found = await store.repoById(bounty.repoId);
        if (found) stale.push({ claim, bounty, repo: found.repo });
      }
      return stale;
    },

    async expireClaims(ids) {
      let expired = 0;
      store.claims = store.claims.map((claim) => {
        if (!ids.includes(claim.id) || claim.status !== "active") return claim;
        expired += 1;
        return {
          ...claim,
          status: "expired" as const,
          stakeStatus: "forwarded_to_maintainer" as const,
        };
      });
      return expired;
    },

    async readChainCursor(chainId) {
      return store.cursors.get(chainId);
    },

    async writeChainCursor(chainId, lastBlock) {
      store.cursors.set(chainId, lastBlock);
    },

    async bountyWithRepo(id) {
      const bounty = store.bounties.get(id);
      if (!bounty) return undefined;
      const found = await store.repoById(bounty.repoId);
      return found ? { bounty, repo: found.repo } : undefined;
    },

    async listBounties(filter) {
      const listings = [];
      for (const bounty of store.bounties.values()) {
        if (filter.status && bounty.status !== filter.status) continue;
        if (filter.repoId && bounty.repoId !== filter.repoId) continue;
        if (filter.minAmountUsdc !== undefined && bounty.amountUsdc < filter.minAmountUsdc) {
          continue;
        }
        if (filter.tag && !bounty.tags.includes(filter.tag)) continue;
        const found = await store.repoById(bounty.repoId);
        if (found) listings.push({ bounty, repo: found.repo });
      }
      return listings;
    },

    async createBounty(input) {
      const bounty = fakeBounty({
        ...input,
        id: `bounty-${store.bounties.size + 1}`,
        status: "draft",
        jobId: null,
        createTxHash: null,
        tags: input.tags ?? [],
      });
      store.bounties.set(bounty.id, bounty);
      return bounty;
    },

    async markBountyFunding(id, createTxHash) {
      const bounty = store.bounties.get(id);
      if (bounty?.status !== "draft") return false;
      store.bounties.set(id, { ...bounty, status: "funding", createTxHash });
      return true;
    },

    async confirmBountyFunded(id, input) {
      const bounty = store.bounties.get(id);
      if (bounty?.status !== "draft" && bounty?.status !== "funding") return false;
      store.bounties.set(id, {
        ...bounty,
        status: input.autoAccept ? "open" : "pending_accept",
        jobId: input.jobId,
        createTxHash: input.createTxHash,
        acceptedAt: input.autoAccept ? new Date() : null,
      });
      return true;
    },

    async acceptBounty(id) {
      const bounty = store.bounties.get(id);
      if (bounty?.status !== "pending_accept") return false;
      store.bounties.set(id, { ...bounty, status: "open", acceptedAt: new Date() });
      return true;
    },

    async moveBountyStatus(id, from, to) {
      const bounty = store.bounties.get(id);
      if (!bounty || bounty.status !== from) return false;
      store.bounties.set(id, { ...bounty, status: to, updatedAt: new Date() });
      return true;
    },

    async claimsFor(bountyId) {
      return store.claims.filter((claim) => claim.bountyId === bountyId);
    },

    async activeClaimsFor(bountyId) {
      return store.claims.filter(
        (claim) => claim.bountyId === bountyId && claim.status === "active",
      );
    },

    async activeClaimBy(bountyId, githubLogin) {
      return store.claims.find(
        (claim) =>
          claim.bountyId === bountyId &&
          claim.githubLogin === githubLogin &&
          claim.status === "active",
      );
    },

    async claimBounty(input) {
      const existing = await store.activeClaimBy(input.bountyId, input.githubLogin);
      if (existing) return existing;
      const claim = fakeClaim({
        ...input,
        id: `claim-${store.claims.length + 1}`,
        userId: input.userId ?? null,
        agentId: input.agentId ?? null,
        status: "active",
      });
      store.claims.push(claim);
      return claim;
    },

    async withdrawClaim(bountyId, githubLogin) {
      const index = store.claims.findIndex(
        (claim) =>
          claim.bountyId === bountyId &&
          claim.githubLogin === githubLogin &&
          claim.status === "active",
      );
      const claim = store.claims[index];
      if (!claim) return false;
      store.claims[index] = { ...claim, status: "withdrawn" };
      return true;
    },

    async upsertSubmission(input) {
      const index = store.submissions.findIndex(
        (submission) =>
          submission.bountyId === input.bountyId && submission.prNumber === input.prNumber,
      );
      const existing = store.submissions[index];
      const submission = fakeSubmission({
        ...existing,
        ...input,
        id: existing?.id ?? "submission-1",
      });
      if (existing) store.submissions[index] = submission;
      else store.submissions.push(submission);
      return submission;
    },

    async submissionForPr(bountyId, prNumber) {
      return store.submissions.find(
        (submission) => submission.bountyId === bountyId && submission.prNumber === prNumber,
      );
    },

    async mergedSubmissionFor(bountyId) {
      return store.submissions.find(
        (submission) => submission.bountyId === bountyId && submission.status === "merged",
      );
    },

    async openSubmissionsFor(bountyId) {
      return store.submissions.filter(
        (submission) => submission.bountyId === bountyId && submission.status === "open",
      );
    },

    async markSubmissionMerged(id, input) {
      const index = store.submissions.findIndex((submission) => submission.id === id);
      const submission = store.submissions[index];
      if (!submission) return;
      store.submissions[index] = { ...submission, status: "merged", ...input };
    },

    async markSubmissionClosed(id) {
      const index = store.submissions.findIndex((submission) => submission.id === id);
      const submission = store.submissions[index];
      if (!submission) return;
      store.submissions[index] = { ...submission, status: "closed" };
    },

    async settleClaim(claimId, status, stakeStatus) {
      const index = store.claims.findIndex((claim) => claim.id === claimId);
      const claim = store.claims[index];
      if (!claim) return;
      store.claims[index] = { ...claim, status, ...(stakeStatus ? { stakeStatus } : {}) };
    },

    async loseOtherClaims(bountyId, winnerClaimId) {
      store.claims = store.claims.map((claim) =>
        claim.bountyId === bountyId && claim.status === "active" && claim.id !== winnerClaimId
          ? { ...claim, status: "lost" }
          : claim,
      );
    },

    async claimById(id) {
      return store.claims.find((claim) => claim.id === id);
    },

    async completeBounty(id, input) {
      const bounty = store.bounties.get(id);
      if (bounty?.status !== "settling") return false;
      store.bounties.set(id, {
        ...bounty,
        status: "settled",
        settleTxHash: input.txHash,
        circleTxId: input.circleTxId,
      });
      return true;
    },

    async openSettlement(input) {
      const settlement: Settlement = {
        id: `settlement-${input.bountyId}`,
        bountyId: input.bountyId,
        claimId: input.claimId,
        providerAddress: input.providerAddress,
        amountUsdc: input.amountUsdc,
        feeUsdc: input.feeUsdc,
        screeningResult: input.screeningResult ?? null,
        txHash: null,
        circleTxId: null,
        status: "pending",
        error: null,
        createdAt: new Date(),
        completedAt: null,
      };
      store.settlements.set(input.bountyId, settlement);
      return settlement;
    },

    async settlementForBounty(bountyId) {
      return store.settlements.get(bountyId);
    },

    async markSettlementSubmitted(bountyId, circleTxId) {
      const settlement = store.settlements.get(bountyId);
      if (!settlement) return;
      store.settlements.set(bountyId, { ...settlement, status: "submitted", circleTxId });
    },

    async markSettlementComplete(bountyId, input) {
      const settlement = store.settlements.get(bountyId);
      if (!settlement) return;
      store.settlements.set(bountyId, {
        ...settlement,
        status: "complete",
        txHash: input.txHash,
        circleTxId: input.circleTxId,
        completedAt: new Date(),
        error: null,
      });
    },

    async markSettlementFailed(bountyId, input) {
      const settlement = store.settlements.get(bountyId);
      store.settlements.set(bountyId, {
        ...(settlement ?? {
          id: `settlement-${bountyId}`,
          bountyId,
          claimId: "",
          providerAddress: "",
          amountUsdc: 0n,
          feeUsdc: 0n,
          screeningResult: null,
          txHash: null,
          createdAt: new Date(),
          completedAt: null,
        }),
        status: "failed",
        error: input.error,
        circleTxId: input.circleTxId ?? settlement?.circleTxId ?? null,
      });
    },

    async recordReputationEvent(input) {
      store.reputation.push(input);
    },

    async x402PaymentById(id) {
      return store.payments.get(id);
    },

    async stakeInUse(paymentId) {
      return store.claims.some(
        (claim) =>
          claim.stakePaymentId === paymentId &&
          (claim.status === "active" || claim.status === "won"),
      );
    },
  };
  return store;
}
