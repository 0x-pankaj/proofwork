import { zValidator } from "@hono/zod-validator";
import { bpsOf, txUrl } from "@proofwork/chain";
import { canMaintain, fundedComment } from "@proofwork/github";
import { Hono } from "hono";
import { getAddress } from "viem";
import { z } from "zod";
import { internalOnly } from "../auth";
import type { Env } from "../env";
import { fail } from "../http";
import { bountyUrl } from "../urls";
import { repoRef } from "../webhooks/repo-ref";
import type { BountyVariables } from "./bounties";

/**
 * Repositories a maintainer controls, and the terms they set on them.
 *
 * Being the maintainer is not something the caller asserts: it is checked against
 * GitHub's own collaborator permissions every time, because the review reward and the
 * accept queue are both real money decisions.
 */

const policySchema = z.object({
  aiContributions: z.enum(["allowed", "disclosure", "none"]).optional(),
  minStakeUsdc: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  autoAccept: z.boolean().optional(),
  claimTtlHours: z.number().int().min(1).max(720).optional(),
  maintainerPayoutAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .nullable()
    .optional(),
});

export const repoRoutes = new Hono<{ Bindings: Env; Variables: BountyVariables }>();

/** The repositories this user can fund bounties on. */
repoRoutes.get("/", internalOnly, async (c) => {
  const store = c.get("store")();
  const user = await store.userById(c.get("actingUserId"));
  if (!user) return fail(c, 404, "not_found", "no such user");

  const found = await store.reposForUser(user.id, user.login);
  return c.json({
    repos: found.map(({ repo }) => ({
      id: repo.id,
      fullName: repo.fullName,
      private: repo.private,
      policy: repo.policy,
      maintainerPayoutAddress: repo.maintainerPayoutAddress,
      evaluatorMode: repo.evaluatorMode,
    })),
  });
});

/** Open issues, so the funding flow can offer a picker instead of a number field. */
repoRoutes.get("/:id/issues", internalOnly, async (c) => {
  const found = await c.get("store")().repoById(c.req.param("id"));
  if (!found?.repo.installed) return fail(c, 404, "not_found", "no such repository");

  const issues = await c.get("github")().listOpenIssues(repoRef(found));
  return c.json({
    issues: issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.htmlUrl,
      labels: issue.labels,
    })),
  });
});

/** A maintainer's terms: who may claim, what they stake, and where the review reward goes. */
repoRoutes.put("/:id/policy", internalOnly, zValidator("json", policySchema), async (c) => {
  const store = c.get("store")();
  const input = c.req.valid("json");

  const found = await store.repoById(c.req.param("id"));
  if (!found?.repo.installed) return fail(c, 404, "not_found", "no such repository");

  const user = await store.userById(c.get("actingUserId"));
  if (!user) return fail(c, 404, "not_found", "no such user");

  const permission = await c.get("github")().permissionFor(repoRef(found), user.login);
  if (!canMaintain(permission)) {
    return fail(c, 403, "not_a_maintainer", "only someone who can merge may set the policy");
  }

  const repo = await store.setRepoSettings(found.repo.id, {
    policy: {
      ...found.repo.policy,
      ...(input.aiContributions ? { aiContributions: input.aiContributions } : {}),
      ...(input.minStakeUsdc ? { minStakeUsdc: input.minStakeUsdc } : {}),
      ...(input.autoAccept !== undefined ? { autoAccept: input.autoAccept } : {}),
      ...(input.claimTtlHours ? { claimTtlHours: input.claimTtlHours } : {}),
    },
    ...(input.maintainerPayoutAddress !== undefined
      ? {
          maintainerPayoutAddress: input.maintainerPayoutAddress
            ? getAddress(input.maintainerPayoutAddress)
            : null,
        }
      : {}),
    maintainerUserId: user.id,
  });

  return c.json({
    id: repo?.id,
    policy: repo?.policy,
    maintainerPayoutAddress: repo?.maintainerPayoutAddress,
  });
});

/** The other half of the accept queue; the `/accept` comment does the same thing. */
repoRoutes.post("/:id/bounties/:bountyId/accept", internalOnly, async (c) => {
  const store = c.get("store")();
  const found = await store.repoById(c.req.param("id"));
  if (!found?.repo.installed) return fail(c, 404, "not_found", "no such repository");

  const user = await store.userById(c.get("actingUserId"));
  if (!user) return fail(c, 404, "not_found", "no such user");

  const permission = await c.get("github")().permissionFor(repoRef(found), user.login);
  if (!canMaintain(permission)) {
    return fail(c, 403, "not_a_maintainer", "only someone who can merge may accept a bounty");
  }

  const bounty = await store.bountyById(c.req.param("bountyId"));
  if (!bounty || bounty.repoId !== found.repo.id) {
    return fail(c, 404, "not_found", "no such bounty on this repository");
  }
  if (!(await store.acceptBounty(bounty.id))) {
    return c.json({ status: bounty.status, accepted: false });
  }

  const comment = fundedComment({
    bountyId: bounty.id,
    issueNumber: bounty.issueNumber,
    amountUsdc: bounty.amountUsdc,
    maintainerRewardUsdc: bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps),
    bountyUrl: bountyUrl(c.env, bounty.id),
    fundingTxUrl: bounty.createTxHash ? txUrl(bounty.createTxHash, c.env) : null,
    expiresAt: bounty.expiresAt,
  });
  await c
    .get("github")()
    .upsertIssueComment(repoRef(found), bounty.issueNumber, comment.marker, comment.body);

  return c.json({ status: "open", accepted: true });
});
