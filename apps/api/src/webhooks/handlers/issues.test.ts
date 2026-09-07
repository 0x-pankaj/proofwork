import { issuesEventSchema } from "@proofwork/github";
import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { createFakeStore, fakeInstallation, fakeRepo } from "../../store.fake";
import { type CommentWriter, handleIssues } from "./issues";

const env = { PUBLIC_WEB_URL: "https://proofwork.dev" } as Env;

function commentWriter() {
  const posted: Array<{ fullName: string; issueNumber: number; marker: string; body: string }> = [];
  const github: CommentWriter = {
    async upsertIssueComment(repo, issueNumber, marker, body) {
      posted.push({ fullName: repo.fullName, issueNumber, marker, body });
      return { id: 1, body, htmlUrl: "https://github.com/c/1", authorLogin: "proofwork-arc[bot]" };
    },
  };
  return { github, posted };
}

function issueEvent(overrides: Record<string, unknown> = {}) {
  return issuesEventSchema.parse({
    action: "labeled",
    issue: {
      number: 12,
      title: "Add Arc support",
      html_url: "https://github.com/i/12",
      labels: [],
    },
    label: { name: "bounty:$50" },
    repository: { id: 100, full_name: "0x-pankaj/proofwork", private: false },
    installation: { id: 900 },
    sender: { id: 5, login: "0x-pankaj" },
    ...overrides,
  });
}

function installedRepo() {
  return [{ repo: fakeRepo(), installation: fakeInstallation() }];
}

describe("handleIssues", () => {
  it("answers a bounty label with a link that escrows the money", async () => {
    const store = createFakeStore(installedRepo());
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent());

    expect(posted).toHaveLength(1);
    expect(posted[0]?.fullName).toBe("0x-pankaj/proofwork");
    expect(posted[0]?.issueNumber).toBe(12);
    expect(posted[0]?.body).toContain("$50.00 USDC");
    expect(posted[0]?.body).toContain(
      "https://proofwork.dev/new?repo=0x-pankaj%2Fproofwork&issue=12",
    );
    expect(posted[0]?.marker).toContain("proofwork:issue-12:funding-invite");
  });

  it("reads the amount off the issue when the delivery names no label", async () => {
    const store = createFakeStore(installedRepo());
    const { github, posted } = commentWriter();

    await handleIssues(
      { store, github, env },
      issuesEventSchema.parse({
        action: "labeled",
        issue: {
          number: 12,
          title: "Add Arc support",
          html_url: "https://github.com/i/12",
          labels: ["good first issue", { name: "bounty:$25.50" }],
        },
        repository: { id: 100, full_name: "0x-pankaj/proofwork" },
        sender: { id: 5, login: "0x-pankaj" },
      }),
    );

    expect(posted[0]?.body).toContain("$25.50 USDC");
  });

  it("ignores labels that are not bounties", async () => {
    const store = createFakeStore(installedRepo());
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent({ label: { name: "help wanted" } }));

    expect(posted).toEqual([]);
  });

  it("ignores every action other than labelling", async () => {
    const store = createFakeStore(installedRepo());
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent({ action: "opened" }));

    expect(posted).toEqual([]);
  });

  it("says nothing on a repository the app is no longer installed on", async () => {
    const store = createFakeStore([
      { repo: fakeRepo({ installed: false }), installation: fakeInstallation() },
    ]);
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent());

    expect(posted).toEqual([]);
  });

  it("says nothing while the installation is suspended", async () => {
    const store = createFakeStore([
      { repo: fakeRepo(), installation: fakeInstallation({ suspended: true }) },
    ]);
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent());

    expect(posted).toEqual([]);
  });

  it("says nothing about a repository it has never seen", async () => {
    const store = createFakeStore();
    const { github, posted } = commentWriter();

    await handleIssues({ store, github, env }, issueEvent());

    expect(posted).toEqual([]);
  });
});
