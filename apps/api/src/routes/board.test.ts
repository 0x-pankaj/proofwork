import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ARC_INTEGRATION_TASKS } from "../board/tasks";
import type { Env } from "../env";
import { createFakeStore, fakeBounty, fakeInstallation, fakeRepo } from "../store.fake";
import { boardRoutes } from "./board";
import type { BountyVariables } from "./bounties";

const env = { ARC_NETWORK: "testnet" } as unknown as Env;

interface Board {
  tag: string;
  funded: Array<{ id: string; issueUrl: string }>;
  suggested: Array<{ id: string; issueUrl: string | null; repoUrl: string }>;
  categories: string[];
}

function serve(bounties: ReturnType<typeof fakeBounty>[]) {
  const store = createFakeStore({
    repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
    bounties,
  });
  const app = new Hono<{ Bindings: Env; Variables: BountyVariables }>();
  app.use("*", async (c, next) => {
    c.set("store", () => store);
    await next();
  });
  app.route("/v1/board", boardRoutes);
  return app;
}

describe("GET /v1/board/arc-integration", () => {
  it("lists only the bounties tagged for Arc, and every task with no bounty", async () => {
    const app = serve([
      fakeBounty({ id: "arc-1", tags: ["arc-integration"] }),
      fakeBounty({ id: "other", issueNumber: 13, tags: ["typescript"] }),
    ]);

    const res = await app.request("/v1/board/arc-integration", {}, env);
    expect(res.status).toBe(200);
    const board = (await res.json()) as Board;

    expect(board.tag).toBe("arc-integration");
    expect(board.funded.map((bounty) => bounty.id)).toEqual(["arc-1"]);
    expect(board.suggested).toHaveLength(ARC_INTEGRATION_TASKS.length);
    expect(board.suggested[0]?.repoUrl).toMatch(/^https:\/\/github\.com\//);
    expect(board.categories).toContain("wallets");
  });

  it("drops a task from the suggestions once its issue is funded", async () => {
    const task = ARC_INTEGRATION_TASKS.find((candidate) => candidate.issueUrl);
    if (!task?.issueUrl) throw new Error("the list needs at least one task with an issue");

    const app = serve([
      fakeBounty({ id: "arc-1", issueUrl: task.issueUrl, tags: ["arc-integration"] }),
    ]);
    const board = (await (await app.request("/v1/board/arc-integration", {}, env)).json()) as Board;

    expect(board.suggested.map((suggestion) => suggestion.id)).not.toContain(task.id);
    expect(board.funded[0]?.issueUrl).toBe(task.issueUrl);
  });
});

describe("the task list", () => {
  it("has unique ids and whole-dollar budgets", () => {
    const ids = ARC_INTEGRATION_TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const task of ARC_INTEGRATION_TASKS) {
      expect(BigInt(task.suggestedBudgetUsdc) % 1_000_000n).toBe(0n);
      expect(task.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });
});
