import { issueCommentEventSchema } from "@proofwork/github";
import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import {
  createFakeStore,
  fakeAgent,
  fakeBounty,
  fakeClaim,
  fakeInstallation,
  fakeRepo,
  fakeUser,
} from "../../store.fake";
import { handleIssueComment } from "./issue-comment";
import type { CommentWriter } from "./issues";

const env = {
  ARC_NETWORK: "testnet",
  PUBLIC_WEB_URL: "https://proofwork.dev",
} as unknown as Env;

function commentWriter() {
  const posted: Array<{ issueNumber: number; marker: string; body: string }> = [];
  const github: CommentWriter = {
    async upsertIssueComment(_repo, issueNumber, marker, body) {
      posted.push({ issueNumber, marker, body });
      return { id: 1, body, htmlUrl: "https://github.com/c/1", authorLogin: "proofwork-arc[bot]" };
    },
  };
  return { github, posted };
}

function comment(body: string, overrides: Record<string, unknown> = {}) {
  return issueCommentEventSchema.parse({
    action: "created",
    issue: {
      number: 12,
      title: "Add Arc support",
      html_url: "https://github.com/0x-pankaj/proofwork/issues/12",
    },
    comment: { id: 1, body, user: { id: 5, login: "octocat", type: "User" } },
    repository: { id: 100, full_name: "0x-pankaj/proofwork" },
    installation: { id: 900 },
    sender: { id: 5, login: "octocat" },
    ...overrides,
  });
}

function seed(overrides: Parameters<typeof createFakeStore>[0] = {}) {
  const base = {
    repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
    bounties: [fakeBounty()],
  };
  return createFakeStore({ ...base, ...(Array.isArray(overrides) ? {} : overrides) });
}

describe("/claim", () => {
  it("claims for a user who has a payout address", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));

    const claims = await store.activeClaimsFor("bounty-1");
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      githubLogin: "octocat",
      claimantKind: "user",
      payoutAddress: "0x52679a68dc5c1c31f1ac22b89431a2b06524c4aa",
    });
    expect(store.bounties.get("bounty-1")?.status).toBe("claimed");
    expect(posted[0]?.body).toContain("@octocat claimed");
    expect(posted[0]?.body).toContain("Fixes #12");
  });

  it("asks for a payout address instead of creating a claim that cannot be paid", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser({ payoutAddress: null })],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));

    expect(await store.activeClaimsFor("bounty-1")).toEqual([]);
    expect(store.bounties.get("bounty-1")?.status).toBe("open");
    expect(posted[0]?.body).toContain("https://proofwork.dev/me");
  });

  it("pays an agent at its registered wallet", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      agents: [fakeAgent()],
    });
    const { github } = commentWriter();

    await handleIssueComment(
      { store, github, env },
      comment("/claim", {
        comment: { id: 1, body: "/claim", user: { id: 77, login: "proofwork-agent" } },
        sender: { id: 77, login: "proofwork-agent" },
      }),
    );

    const claims = await store.activeClaimsFor("bounty-1");
    expect(claims[0]).toMatchObject({
      claimantKind: "agent",
      agentId: "agent-1",
      payoutAddress: "0x3975261337566c22a5129eb82bdcc8c364c4a313",
    });
  });

  it("lets a second contributor claim a bounty someone else holds", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [fakeClaim({ githubLogin: "someone-else" })],
      users: [fakeUser()],
    });
    const { github } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));

    expect((await store.activeClaimsFor("bounty-1")).map((claim) => claim.githubLogin)).toEqual([
      "someone-else",
      "octocat",
    ]);
    expect(store.bounties.get("bounty-1")?.status).toBe("claimed");
  });

  it("answers a repeated claim with the claim that already exists", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser()],
    });
    const { github } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));
    await handleIssueComment({ store, github, env }, comment("/claim"));

    expect(await store.activeClaimsFor("bounty-1")).toHaveLength(1);
  });

  it("refuses to claim a bounty that is already being settled", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "submitted" })],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));

    expect(await store.activeClaimsFor("bounty-1")).toEqual([]);
    expect(posted[0]?.body).toContain("submitted");
  });
});

describe("/unclaim", () => {
  it("releases the bounty when the last claim goes", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [fakeClaim()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/unclaim"));

    expect(await store.activeClaimsFor("bounty-1")).toEqual([]);
    expect(store.bounties.get("bounty-1")?.status).toBe("open");
    expect(posted[0]?.body).toContain("released this bounty");
  });

  it("keeps the bounty claimed while someone else still holds it", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [fakeClaim(), fakeClaim({ id: "claim-2", githubLogin: "someone-else" })],
    });
    const { github } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/unclaim"));

    expect(store.bounties.get("bounty-1")?.status).toBe("claimed");
  });

  it("says nothing when the commenter had no claim", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [fakeClaim({ githubLogin: "someone-else" })],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/unclaim"));

    expect(posted).toEqual([]);
    expect(store.bounties.get("bounty-1")?.status).toBe("claimed");
  });
});

describe("/status", () => {
  it("reports the amount, the state and who is working on it", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [fakeClaim()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/status"));

    expect(posted[0]?.body).toContain("$200.00 USDC");
    expect(posted[0]?.body).toContain("claimed");
    expect(posted[0]?.body).toContain("@octocat");
    expect(posted[0]?.body).toContain("https://proofwork.dev/bounties/bounty-1");
  });

  it("links the settlement once there is one", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "submitted", settleTxHash: "0xabc" })],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/status"));

    expect(posted[0]?.body).toContain("https://testnet.arcscan.app/tx/0xabc");
  });
});

describe("comments that are not commands", () => {
  it("ignores ordinary conversation", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("I'll take a look at this"));

    expect(posted).toEqual([]);
  });

  it("ignores its own comments, so a reply cannot start a loop", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment(
      { store, github, env },
      comment("/claim", {
        comment: {
          id: 1,
          body: "/claim",
          user: { id: 9, login: "proofwork-arc[bot]", type: "Bot" },
        },
      }),
    );

    expect(posted).toEqual([]);
  });

  it("ignores a command on a pull request, which carries no bounty", async () => {
    const store = seed({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment(
      { store, github, env },
      comment("/claim", {
        issue: {
          number: 12,
          title: "Fix it",
          html_url: "https://github.com/0x-pankaj/proofwork/pull/12",
          pull_request: { url: "https://api.github.com/pulls/12" },
        },
      }),
    );

    expect(posted).toEqual([]);
  });

  it("ignores an issue with no bounty on it", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      users: [fakeUser()],
    });
    const { github, posted } = commentWriter();

    await handleIssueComment({ store, github, env }, comment("/claim"));

    expect(posted).toEqual([]);
  });
});
