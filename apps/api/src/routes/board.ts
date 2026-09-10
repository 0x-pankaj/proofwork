import { Hono } from "hono";
import { ARC_INTEGRATION_TAG, ARC_INTEGRATION_TASKS, type ArcTask } from "../board/tasks";
import type { Env } from "../env";
import { type BountyVariables, summarise } from "./bounties";

/**
 * The Arc Integration Board: the launch view.
 *
 * Two lists. What is funded — every bounty tagged for Arc integration, paid or not — and
 * what is waiting for a funder: the curated tasks that have no bounty yet. A task whose
 * issue already carries a bounty moves from the second list to the first on its own.
 */

export const boardRoutes = new Hono<{ Bindings: Env; Variables: BountyVariables }>();

boardRoutes.get("/arc-integration", async (c) => {
  const store = c.get("store")();
  const listings = await store.listBounties({ tag: ARC_INTEGRATION_TAG, limit: 100 });
  const funded = listings.map(({ bounty, repo }) => summarise(c.env, bounty, repo.fullName));

  const fundedIssues = new Set(funded.map((bounty) => bounty.issueUrl));
  const suggested = ARC_INTEGRATION_TASKS.filter(
    (task) => !task.issueUrl || !fundedIssues.has(task.issueUrl),
  );

  return c.json({
    tag: ARC_INTEGRATION_TAG,
    funded,
    suggested: suggested.map(publicTask),
    categories: [...new Set(ARC_INTEGRATION_TASKS.map((task) => task.category))],
  });
});

function publicTask(task: ArcTask) {
  return {
    id: task.id,
    title: task.title,
    repo: task.repo,
    repoUrl: `https://github.com/${task.repo}`,
    category: task.category,
    summary: task.summary,
    suggestedBudgetUsdc: task.suggestedBudgetUsdc,
    issueUrl: task.issueUrl ?? null,
  };
}
