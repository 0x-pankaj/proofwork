import { pullRequestEventSchema } from "@proofwork/github";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import {
  createFakeStore,
  fakeAgent,
  fakeBounty,
  fakeClaim,
  fakeInstallation,
  fakeRepo,
  fakeSubmission,
} from "../../store.fake";
import type { CommentWriter } from "./issues";
import { handlePullRequest } from "./pull-request";

const env = {
  ARC_NETWORK: "testnet",
  PUBLIC_WEB_URL: "https://proofwork.dev",
} as unknown as Env;

const MERGE_SHA = "b".repeat(40);

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

function pullRequest(
  overrides: Record<string, unknown> = {},
  prOverrides: Record<string, unknown> = {},
) {
  return pullRequestEventSchema.parse({
    action: "opened",
    pull_request: {
      number: 21,
      title: "Add Arc support",
      html_url: "https://github.com/0x-pankaj/proofwork/pull/21",
      body: "Fixes #12",
      user: { id: 5, login: "octocat", type: "User" },
      head: { sha: "a".repeat(40) },
      base: { ref: "main" },
      merged_at: null,
      merge_commit_sha: null,
      ...prOverrides,
    },
    repository: { id: 100, full_name: "0x-pankaj/proofwork", default_branch: "main" },
    installation: { id: 900 },
    sender: { id: 5, login: "octocat" },
    ...overrides,
  });
}

function seeded(overrides: Parameters<typeof createFakeStore>[0] = {}) {
  return createFakeStore({
    repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
    bounties: [fakeBounty({ status: "claimed" })],
    claims: [fakeClaim()],
    ...(Array.isArray(overrides) ? {} : overrides),
  });
}

describe("linking a pull request", () => {
  it("records the submission and says what a merge pays", async () => {
    const store = seeded();
    const { github, posted } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest());

    expect(store.submissions[0]).toMatchObject({
      bountyId: "bounty-1",
      claimId: "claim-1",
      prNumber: 21,
      status: "open",
    });
    expect(store.bounties.get("bounty-1")?.status).toBe("submitted");
    expect(posted[0]?.issueNumber).toBe(21);
    expect(posted[0]?.body).toContain("$170.00 USDC");
    expect(posted[0]?.body).toContain("$30.00 USDC");
  });

  it("tells an author who never claimed to claim first", async () => {
    const store = seeded({ claims: [] });
    const { github, posted } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest());

    expect(store.submissions).toEqual([]);
    expect(posted[0]?.body).toContain("/claim");
  });

  it("ignores a pull request that closes nothing", async () => {
    const store = seeded();
    const { github, posted } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest({}, { body: "Refactors things" }));

    expect(store.submissions).toEqual([]);
    expect(posted).toEqual([]);
  });

  it("updates the same row when the branch is pushed again", async () => {
    const store = seeded();
    const { github } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest());
    await handlePullRequest(
      { store, github, env },
      pullRequest({ action: "synchronize" }, { head: { sha: "c".repeat(40) } }),
    );

    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]?.headSha).toBe("c".repeat(40));
  });
});

describe("a pull request closed without merging", () => {
  it("loses the claim and forwards the stake to the maintainer", async () => {
    const store = seeded({
      bounties: [fakeBounty({ status: "submitted" })],
      claims: [fakeClaim({ stakePaymentId: "payment-1", stakeStatus: "held" })],
      submissions: [fakeSubmission()],
    });
    const { github } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest({ action: "closed" }));

    expect(store.submissions[0]?.status).toBe("closed");
    expect(store.claims[0]).toMatchObject({
      status: "lost",
      stakeStatus: "held",
    });
    expect(store.bounties.get("bounty-1")?.status).toBe("open");
  });

  it("leaves the bounty claimed when someone else is still working on it", async () => {
    const store = seeded({
      bounties: [fakeBounty({ status: "submitted" })],
      claims: [fakeClaim(), fakeClaim({ id: "claim-2", githubLogin: "someone-else" })],
      submissions: [fakeSubmission()],
    });
    const { github } = commentWriter();

    await handlePullRequest({ store, github, env }, pullRequest({ action: "closed" }));

    expect(store.bounties.get("bounty-1")?.status).toBe("claimed");
  });
});

describe("merge guards", () => {
  const mergedEvent = (prOverrides: Record<string, unknown> = {}) =>
    pullRequest(
      { action: "closed" },
      {
        merged: true,
        merged_at: "2026-09-09T10:00:00Z",
        merge_commit_sha: MERGE_SHA,
        ...prOverrides,
      },
    );

  it("records the merge and hands the bounty to settlement", async () => {
    const store = seeded({ submissions: [fakeSubmission()] });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest({ store, github, env, settle }, mergedEvent());

    expect(store.submissions[0]).toMatchObject({ status: "merged", mergeSha: MERGE_SHA });
    expect(store.submissions[0]?.deliverableHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(settle).toHaveBeenCalledWith("bounty-1");
  });

  it("refuses a merge into a branch the repository does not ship from", async () => {
    const store = seeded({ submissions: [fakeSubmission()] });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest(
      { store, github, env, settle },
      mergedEvent({ base: { ref: "gh-pages" } }),
    );

    expect(settle).not.toHaveBeenCalled();
    expect(store.submissions[0]?.status).toBe("open");
  });

  it("refuses a merge by someone who never claimed", async () => {
    const store = seeded({ claims: [fakeClaim({ githubLogin: "someone-else" })] });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest({ store, github, env, settle }, mergedEvent());

    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses a merge with no merge commit", async () => {
    const store = seeded({ submissions: [fakeSubmission()] });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest(
      { store, github, env, settle },
      mergedEvent({ merge_commit_sha: null }),
    );

    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses to pay a bounty that is already settled", async () => {
    const store = seeded({ bounties: [fakeBounty({ status: "settled" })] });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest({ store, github, env, settle }, mergedEvent());

    expect(settle).not.toHaveBeenCalled();
  });

  it("holds an agent's payout when the repository asked for disclosure", async () => {
    const store = seeded({
      agents: [fakeAgent()],
      claims: [
        fakeClaim({
          claimantKind: "agent",
          agentId: "agent-1",
          userId: null,
          githubLogin: "proofwork-agent",
        }),
      ],
    });
    const { github, posted } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest(
      { store, github, env, settle },
      pullRequest(
        { action: "closed", sender: { id: 77, login: "proofwork-agent" } },
        {
          user: { id: 77, login: "proofwork-agent" },
          merged_at: "2026-09-09T10:00:00Z",
          merge_commit_sha: MERGE_SHA,
        },
      ),
    );

    expect(settle).not.toHaveBeenCalled();
    expect(posted[0]?.body).toContain("AI-assisted");
    expect(store.submissions[0]?.status).toBe("merged");
  });

  it("pays an agent that disclosed", async () => {
    const store = seeded({
      agents: [fakeAgent()],
      claims: [
        fakeClaim({
          claimantKind: "agent",
          agentId: "agent-1",
          userId: null,
          githubLogin: "proofwork-agent",
        }),
      ],
    });
    const { github } = commentWriter();
    const settle = vi.fn(async () => {});

    await handlePullRequest(
      { store, github, env, settle },
      pullRequest(
        { action: "closed", sender: { id: 77, login: "proofwork-agent" } },
        {
          user: { id: 77, login: "proofwork-agent" },
          body: "Fixes #12\n\nAI-assisted: Claude Code",
          merged_at: "2026-09-09T10:00:00Z",
          merge_commit_sha: MERGE_SHA,
        },
      ),
    );

    expect(settle).toHaveBeenCalledWith("bounty-1");
  });
});
