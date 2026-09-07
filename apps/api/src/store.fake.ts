import type {
  Agent,
  Bounty,
  Claim,
  Installation,
  RepositoryInput,
  RepoWithInstallation,
  User,
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
    circleTxId: null,
    createdAt: new Date("2026-09-07T00:00:00Z"),
    updatedAt: new Date("2026-09-07T00:00:00Z"),
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

    async agentByGithubLogin(login) {
      return store.agents.get(login);
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

    async moveBountyStatus(id, from, to) {
      const bounty = store.bounties.get(id);
      if (!bounty || bounty.status !== from) return false;
      store.bounties.set(id, { ...bounty, status: to, updatedAt: new Date() });
      return true;
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
  };
  return store;
}
