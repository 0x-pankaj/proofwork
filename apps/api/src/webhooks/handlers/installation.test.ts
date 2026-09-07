import { installationEventSchema, installationRepositoriesEventSchema } from "@proofwork/github";
import { describe, expect, it } from "vitest";
import { createFakeStore, fakeInstallation, fakeRepo } from "../../store.fake";
import { handleInstallation, handleInstallationRepositories } from "./installation";

const ACCOUNT = { login: "0x-pankaj", type: "User" };
const REPOSITORY = { id: 100, full_name: "0x-pankaj/proofwork", private: false };

function installationEvent(action: string, extra: Record<string, unknown> = {}) {
  return installationEventSchema.parse({
    action,
    installation: { id: 900, account: ACCOUNT, suspended_at: null },
    ...extra,
  });
}

describe("handleInstallation", () => {
  it("records a new installation and its repositories", async () => {
    const store = createFakeStore();

    await handleInstallation(store, installationEvent("created", { repositories: [REPOSITORY] }));

    const installation = await store.installationByGithubId(900n);
    expect(installation?.accountLogin).toBe("0x-pankaj");
    expect(installation?.suspended).toBe(false);
    expect(store.synced).toEqual([
      {
        installationId: installation?.id,
        repositories: [{ githubRepoId: 100n, fullName: "0x-pankaj/proofwork", private: false }],
      },
    ]);
  });

  it("reads an organisation account as one", async () => {
    const store = createFakeStore();

    await handleInstallation(
      store,
      installationEventSchema.parse({
        action: "created",
        installation: { id: 901, account: { login: "circlefin", type: "Organization" } },
      }),
    );

    expect((await store.installationByGithubId(901n))?.accountType).toBe("Organization");
  });

  it("deactivates rather than deletes when the app is uninstalled", async () => {
    const store = createFakeStore();

    await handleInstallation(store, installationEvent("deleted"));

    const installation = await store.installationByGithubId(900n);
    expect(installation?.suspended).toBe(true);
    expect(store.uninstalledInstallations).toEqual([installation?.id]);
    expect(store.synced).toEqual([]);
  });

  it("treats a suspended installation as inactive", async () => {
    const store = createFakeStore();

    await handleInstallation(
      store,
      installationEventSchema.parse({
        action: "suspend",
        installation: { id: 900, account: ACCOUNT, suspended_at: "2026-09-07T10:00:00Z" },
        repositories: [REPOSITORY],
      }),
    );

    expect((await store.installationByGithubId(900n))?.suspended).toBe(true);
    expect(store.synced).toEqual([]);
  });

  it("brings an unsuspended installation back", async () => {
    const store = createFakeStore();

    await handleInstallation(store, installationEvent("unsuspend", { repositories: [REPOSITORY] }));

    expect((await store.installationByGithubId(900n))?.suspended).toBe(false);
    expect(store.synced).toHaveLength(1);
  });
});

describe("handleInstallationRepositories", () => {
  it("adds and removes repositories in one delivery", async () => {
    const store = createFakeStore([
      { repo: fakeRepo(), installation: fakeInstallation({ id: "installation-900" }) },
    ]);

    await handleInstallationRepositories(
      store,
      installationRepositoriesEventSchema.parse({
        action: "added",
        installation: { id: 900, account: ACCOUNT },
        repositories_added: [{ id: 101, full_name: "0x-pankaj/arc-tools", private: true }],
        repositories_removed: [REPOSITORY],
      }),
    );

    expect(store.synced[0]?.repositories).toEqual([
      { githubRepoId: 101n, fullName: "0x-pankaj/arc-tools", private: true },
    ]);
    expect(store.uninstalledRepoIds).toEqual([100n]);
  });

  it("does nothing loud when the delivery carries neither list", async () => {
    const store = createFakeStore();

    await handleInstallationRepositories(
      store,
      installationRepositoriesEventSchema.parse({
        action: "removed",
        installation: { id: 900, account: ACCOUNT },
      }),
    );

    expect(store.synced).toEqual([]);
    expect(store.uninstalledRepoIds).toEqual([]);
  });
});
