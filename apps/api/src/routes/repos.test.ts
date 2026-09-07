import type { GitHubClient, RepositoryPermission } from "@proofwork/github";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  createFakeStore,
  type FakeStore,
  fakeBounty,
  fakeInstallation,
  fakeRepo,
  fakeUser,
} from "../store.fake";
import type { BountyVariables } from "./bounties";
import { repoRoutes } from "./repos";

/**
 * The maintainer boundary. Setting a repository's terms and accepting somebody else's
 * bounty are both real money decisions, so both are checked against GitHub's own
 * collaborator permissions rather than anything the caller asserts.
 */

const env = { ARC_NETWORK: "testnet", INTERNAL_API_KEY: "internal-key" } as unknown as Env;

const internal = {
  "content-type": "application/json",
  "x-internal-key": "internal-key",
  "x-acting-user": "user-1",
};

function serve(store: FakeStore, permission: RepositoryPermission = "admin") {
  const posted: Array<{ issueNumber: number; body: string }> = [];
  const github = {
    async permissionFor() {
      return permission;
    },
    async listOpenIssues() {
      return [
        {
          number: 7,
          title: "Add Arc support",
          htmlUrl: "https://github.com/i/7",
          body: "",
          state: "open" as const,
          labels: [],
          authorLogin: "octocat",
        },
      ];
    },
    async upsertIssueComment(_repo: unknown, issueNumber: number, _marker: string, body: string) {
      posted.push({ issueNumber, body });
      return { id: 1, body, htmlUrl: "https://github.com/c/1", authorLogin: "proofwork-arc[bot]" };
    },
  } as unknown as GitHubClient;

  const app = new Hono<{ Bindings: Env; Variables: BountyVariables }>();
  app.use("*", async (c, next) => {
    c.set("store", () => store);
    c.set("github", () => github);
    await next();
  });
  app.route("/v1/repos", repoRoutes);
  return { app, posted };
}

function seeded(overrides: Parameters<typeof createFakeStore>[0] = {}) {
  return createFakeStore({
    repos: [{ repo: fakeRepo(), installation: fakeInstallation({ accountLogin: "octocat" }) }],
    users: [fakeUser()],
    ...(Array.isArray(overrides) ? {} : overrides),
  });
}

describe("GET /v1/repos", () => {
  it("lists the repositories this user can fund on", async () => {
    const { app } = serve(seeded());

    const res = await app.request("/v1/repos", { headers: internal }, env);

    const body = (await res.json()) as { repos: Array<{ fullName: string }> };
    expect(body.repos.map((repo) => repo.fullName)).toEqual(["0x-pankaj/proofwork"]);
  });

  it("does not answer without the internal key", async () => {
    const { app } = serve(seeded());

    expect((await app.request("/v1/repos", {}, env)).status).toBe(401);
  });
});

describe("PUT /v1/repos/:id/policy", () => {
  const policy = JSON.stringify({
    aiContributions: "none",
    autoAccept: false,
    maintainerPayoutAddress: "0xb57af3feba9d6759ce38452247e066981dddebb3",
  });

  it("lets someone who can merge set the terms", async () => {
    const store = seeded();
    const { app } = serve(store, "admin");

    const res = await app.request(
      "/v1/repos/repo-1/policy",
      { method: "PUT", body: policy, headers: internal },
      env,
    );

    expect(res.status).toBe(200);
    const saved = await store.repoById("repo-1");
    expect(saved?.repo.policy.aiContributions).toBe("none");
    expect(saved?.repo.policy.autoAccept).toBe(false);
    expect(saved?.repo.maintainerPayoutAddress).toBe("0xb57af3feBa9D6759CE38452247e066981DddEbb3");
    expect(saved?.repo.maintainerUserId).toBe("user-1");
  });

  it("refuses someone who only has read access", async () => {
    const store = seeded();
    const { app } = serve(store, "read");

    const res = await app.request(
      "/v1/repos/repo-1/policy",
      { method: "PUT", body: policy, headers: internal },
      env,
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "not_a_maintainer" } });
    expect((await store.repoById("repo-1"))?.repo.policy.aiContributions).toBe("disclosure");
  });

  it("keeps the settings it was not asked to change", async () => {
    const store = seeded();
    const { app } = serve(store, "write");

    await app.request(
      "/v1/repos/repo-1/policy",
      { method: "PUT", body: JSON.stringify({ autoAccept: false }), headers: internal },
      env,
    );

    const saved = await store.repoById("repo-1");
    expect(saved?.repo.policy).toMatchObject({
      aiContributions: "disclosure",
      claimTtlHours: 72,
      autoAccept: false,
    });
  });
});

describe("accepting a bounty", () => {
  it("opens one the maintainer accepts, and says so on the issue", async () => {
    const store = seeded({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation({ accountLogin: "octocat" }) }],
      users: [fakeUser()],
      bounties: [fakeBounty({ status: "pending_accept" })],
    });
    const { app, posted } = serve(store, "admin");

    const res = await app.request(
      "/v1/repos/repo-1/bounties/bounty-1/accept",
      { method: "POST", headers: internal },
      env,
    );

    expect(res.status).toBe(200);
    expect(store.bounties.get("bounty-1")?.status).toBe("open");
    expect(posted[0]?.issueNumber).toBe(12);
    expect(posted[0]?.body).toContain("$200.00 USDC");
  });

  it("refuses someone who cannot merge", async () => {
    const store = seeded({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation({ accountLogin: "octocat" }) }],
      users: [fakeUser()],
      bounties: [fakeBounty({ status: "pending_accept" })],
    });
    const { app, posted } = serve(store, "none");

    const res = await app.request(
      "/v1/repos/repo-1/bounties/bounty-1/accept",
      { method: "POST", headers: internal },
      env,
    );

    expect(res.status).toBe(403);
    expect(store.bounties.get("bounty-1")?.status).toBe("pending_accept");
    expect(posted).toEqual([]);
  });

  it("refuses a bounty that belongs to another repository", async () => {
    const store = seeded({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation({ accountLogin: "octocat" }) }],
      users: [fakeUser()],
      bounties: [fakeBounty({ status: "pending_accept", repoId: "repo-other" })],
    });
    const { app } = serve(store, "admin");

    const res = await app.request(
      "/v1/repos/repo-1/bounties/bounty-1/accept",
      { method: "POST", headers: internal },
      env,
    );

    expect(res.status).toBe(404);
  });
});
