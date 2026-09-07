import type { Installation, RepositoryInput, RepoWithInstallation } from "@proofwork/db";
import type { Store } from "./store";

/**
 * An in-memory Store for tests. It keeps enough state to answer reads, and records the
 * writes a handler made, so tests assert behaviour rather than mock call order.
 */
export interface FakeStore extends Store {
  installations: Map<string, Installation>;
  repos: Map<string, RepoWithInstallation>;
  synced: Array<{ installationId: string; repositories: RepositoryInput[] }>;
  uninstalledRepoIds: bigint[];
  uninstalledInstallations: string[];
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

export function createFakeStore(seed: RepoWithInstallation[] = []): FakeStore {
  const store: FakeStore = {
    installations: new Map(
      seed.map((entry) => [String(entry.installation.githubInstallationId), entry.installation]),
    ),
    repos: new Map(seed.map((entry) => [String(entry.repo.githubRepoId), entry])),
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
  };
  return store;
}
