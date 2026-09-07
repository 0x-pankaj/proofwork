import { zValidator } from "@hono/zod-validator";
import { activeNetwork, bpsOf, proofworkJobsAddress, txUrl } from "@proofwork/chain";
import type { Bounty } from "@proofwork/db";
import { fundedComment, type GitHubClient, pendingAcceptComment } from "@proofwork/github";
import { Hono } from "hono";
import { z } from "zod";
import { type InternalVariables, internalOnly } from "../auth";
import { type Env, required } from "../env";
import {
  confirmFunding,
  confirmRefund,
  fundingCalls,
  readFeeBps,
  reclaimCall,
  reclaimPlan,
} from "../funding";
import { fail } from "../http";
import { circleCompliance, circleWallets } from "../services";
import { settleBountyById, splitOf } from "../settlement";
import type { Store } from "../store";
import { bountyUrl, repoSettingsUrl } from "../urls";
import { repoRef } from "../webhooks/repo-ref";

/**
 * Bounties over HTTP.
 *
 * Reads are public: the board is the product's shop window. Writes are internal, called
 * by the web app's server with `INTERNAL_API_KEY`, because the funder's browser sends the
 * money itself and this API only ever hands out calldata and reads receipts back.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT = /^\d{1,20}$/;

const createSchema = z.object({
  repoId: z.uuid(),
  issueNumber: z.number().int().positive(),
  /** 6-decimal USDC, as a string so no precision is lost in JSON. */
  amountUsdc: z.string().regex(AMOUNT),
  expiresAt: z.iso.datetime(),
  funderAddress: z.string().regex(ADDRESS),
  maintainerRewardBps: z.number().int().min(0).max(5_000).optional(),
  tags: z.array(z.string()).optional(),
});

const confirmSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

const listSchema = z.object({
  status: z.string().optional(),
  repoId: z.uuid().optional(),
  minAmountUsdc: z.string().regex(AMOUNT).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export interface BountyVariables extends InternalVariables {
  /**
   * Resolved lazily so a request that never touches the database — `/health`, a bad
   * signature — does not need `DATABASE_URL`, and so tests can supply their own.
   */
  store: () => Store;
  /** Same reasoning for GitHub: no app credentials needed until a route calls it. */
  github: () => GitHubClient;
}

export const bountyRoutes = new Hono<{ Bindings: Env; Variables: BountyVariables }>();

/** The board. */
bountyRoutes.get("/", zValidator("query", listSchema), async (c) => {
  const query = c.req.valid("query");
  const perPage = query.perPage ?? 25;
  const store = c.get("store")();

  const listings = await store.listBounties({
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.repoId ? { repoId: query.repoId } : {}),
    ...(query.minAmountUsdc ? { minAmountUsdc: BigInt(query.minAmountUsdc) } : {}),
    limit: perPage,
    offset: ((query.page ?? 1) - 1) * perPage,
  });

  return c.json({
    bounties: listings.map(({ bounty, repo }) => summarise(c.env, bounty, repo.fullName)),
    page: query.page ?? 1,
    perPage,
  });
});

/** One bounty, with everything that has happened to it. */
bountyRoutes.get("/:id", async (c) => {
  const store = c.get("store")();
  const listing = await store.bountyWithRepo(c.req.param("id"));
  if (!listing) return fail(c, 404, "not_found", "no such bounty");

  const { bounty, repo } = listing;
  const [claims, merged, open, settlement] = await Promise.all([
    store.claimsFor(bounty.id),
    store.mergedSubmissionFor(bounty.id),
    store.openSubmissionsFor(bounty.id),
    store.settlementForBounty(bounty.id),
  ]);

  // The merged pull request is the one that matters, but an open one is what the page
  // should show while the work is still in review.
  const submission = merged ?? open[0];

  return c.json({
    ...summarise(c.env, bounty, repo.fullName),
    claims: claims.map((claim) => ({
      login: claim.githubLogin,
      kind: claim.claimantKind,
      /** `won` is the one that was paid; `active` is still working. */
      status: claim.status,
      payoutAddress: claim.payoutAddress,
      claimedAt: claim.createdAt,
    })),
    submission: submission
      ? {
          prNumber: submission.prNumber,
          prUrl: submission.prUrl,
          mergeSha: submission.mergeSha,
          mergedAt: submission.mergedAt,
          deliverableHash: submission.deliverableHash,
        }
      : null,
    settlement: settlement
      ? {
          status: settlement.status,
          txHash: settlement.txHash,
          txUrl: settlement.txHash ? txUrl(settlement.txHash, c.env) : null,
          completedAt: settlement.completedAt,
          error: settlement.error,
        }
      : null,
  });
});

/**
 * Creates a draft bounty and returns the two transactions that fund it. Nothing is
 * escrowed until the funder sends them from their own wallet.
 */
bountyRoutes.post("/", internalOnly, zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const store = c.get("store")();

  const found = await store.repoById(input.repoId);
  if (!found?.repo.installed) {
    return fail(c, 404, "repo_not_found", "Proofwork is not installed on that repository");
  }

  const existing = await store.activeBountyForIssue(input.repoId, input.issueNumber);
  if (existing) {
    return fail(c, 409, "already_funded", `issue #${input.issueNumber} already has a bounty`);
  }

  const amountUsdc = BigInt(input.amountUsdc);
  if (amountUsdc <= 0n) return fail(c, 400, "invalid_amount", "a bounty needs an amount");

  const expiresAt = new Date(input.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    return fail(c, 400, "invalid_expiry", "the deadline is in the past");
  }

  const issue = await c.get("github")().getIssue(repoRef(found), input.issueNumber);
  const feeUsdc = bpsOf(amountUsdc, await readFeeBps(c.env));

  // A review reward needs somewhere to send it; without one the contributor takes it all.
  const maintainerAddress = found.repo.maintainerPayoutAddress;
  const maintainerRewardBps = maintainerAddress ? (input.maintainerRewardBps ?? 1_500) : 0;

  const bounty = await store.createBounty({
    repoId: found.repo.id,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueUrl: issue.htmlUrl,
    description: issue.body.slice(0, 4_000),
    amountUsdc,
    feeUsdc,
    maintainerAddress: maintainerAddress ?? null,
    maintainerRewardBps,
    funderUserId: c.get("actingUserId"),
    funderAddress: input.funderAddress,
    evaluatorAddress: required(c.env, "CIRCLE_VERIFIER_ADDRESS"),
    expiresAt,
    ...(input.tags ? { tags: input.tags } : {}),
  });

  return c.json(
    {
      bountyId: bounty.id,
      contract: proofworkJobsAddress(activeNetwork(c.env), c.env),
      split: serialiseSplit(splitOf(bounty)),
      calldata: fundingCalls(c.env, {
        amountUsdc,
        feeUsdc,
        evaluator: bounty.evaluatorAddress,
        expiresAt,
        description: `${found.repo.fullName}#${issue.number}`,
        maintainer: bounty.maintainerAddress,
        maintainerRewardBps,
      }),
    },
    201,
  );
});

/** Proves the escrow landed, and opens the bounty for work. */
bountyRoutes.post(
  "/:id/confirm-funding",
  internalOnly,
  zValidator("json", confirmSchema),
  async (c) => {
    const store = c.get("store")();
    const listing = await store.bountyWithRepo(c.req.param("id"));
    if (!listing) return fail(c, 404, "not_found", "no such bounty");

    const { bounty, repo } = listing;
    if (bounty.jobId !== null) {
      return c.json({ status: bounty.status, jobId: String(bounty.jobId), alreadyConfirmed: true });
    }

    const { txHash } = c.req.valid("json");
    const funding = await confirmFunding(c.env, txHash);

    // `JobFunded` reports the budget. The fee is pulled in the same transfer but is
    // recorded separately on the job, so the budget is what this has to match.
    if (funding.amountUsdc !== bounty.amountUsdc) {
      return fail(
        c,
        400,
        "wrong_amount",
        `the escrow was funded with ${funding.amountUsdc} but the bounty is ${bounty.amountUsdc}`,
      );
    }
    if (funding.client.toLowerCase() !== bounty.funderAddress.toLowerCase()) {
      return fail(c, 400, "wrong_funder", "that transaction was sent by a different address");
    }

    const autoAccept = repo.policy.autoAccept;
    await store.confirmBountyFunded(bounty.id, {
      jobId: funding.jobId,
      createTxHash: txHash,
      autoAccept,
    });

    const found = await store.repoById(repo.id);
    if (found) {
      const comment = autoAccept
        ? fundedComment({
            bountyId: bounty.id,
            issueNumber: bounty.issueNumber,
            amountUsdc: bounty.amountUsdc,
            maintainerRewardUsdc: bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps),
            bountyUrl: bountyUrl(c.env, bounty.id),
            fundingTxUrl: txUrl(txHash, c.env),
            expiresAt: bounty.expiresAt,
          })
        : pendingAcceptComment({
            bountyId: bounty.id,
            amountUsdc: bounty.amountUsdc,
            funderLogin: (await store.userById(bounty.funderUserId))?.login ?? "someone",
            settingsUrl: repoSettingsUrl(c.env, repo.id),
          });

      await c
        .get("github")()
        .upsertIssueComment(repoRef(found), bounty.issueNumber, comment.marker, comment.body);
    }

    return c.json({
      status: autoAccept ? "open" : "pending_accept",
      jobId: String(funding.jobId),
      txUrl: txUrl(txHash, c.env),
    });
  },
);

/** Re-runs a settlement that failed. Idempotent: a paid bounty answers "skipped". */
/**
 * What it would take to get this escrow back, and the call that does it.
 *
 * A funder whose bounty went nowhere should not have to open a block explorer to be made
 * whole. The API decides which of the two unwinding calls applies and hands back calldata;
 * the funder signs it in their own wallet, exactly as they signed the funding.
 *
 * Public, unlike the other money routes. Everything here is already public — the bounty, its
 * deadline, the job id — and the calldata authorises nobody: `cancel` reverts for anyone but
 * the funder, and `claimRefund` is meant to be open. Hiding it behind our key would only make
 * a permissionless refund depend on us being up.
 */
bountyRoutes.get("/:id/reclaim", async (c) => {
  const store = c.get("store")();
  const bounty = await store.bountyById(c.req.param("id"));
  if (!bounty) return fail(c, 404, "not_found", "no such bounty");

  const plan = reclaimPlan({
    status: bounty.status,
    jobId: bounty.jobId,
    expiresAt: bounty.expiresAt,
    activeClaims: (await store.activeClaimsFor(bounty.id)).length,
    now: new Date(),
  });

  if (!plan.reclaimable) return c.json({ reclaimable: false, reason: plan.reason });

  return c.json({
    reclaimable: true,
    kind: plan.kind,
    reason: plan.reason,
    funderAddress: bounty.funderAddress,
    amountUsdc: String(bounty.amountUsdc + bounty.feeUsdc),
    call: reclaimCall(c.env, bounty.jobId as bigint, plan.kind),
  });
});

/** Records a refund the funder has already sent, after reading it back off Arc. */
bountyRoutes.post("/:id/reclaim", internalOnly, zValidator("json", confirmSchema), async (c) => {
  const store = c.get("store")();
  const bounty = await store.bountyById(c.req.param("id"));
  if (!bounty) return fail(c, 404, "not_found", "no such bounty");
  if (bounty.jobId === null) return fail(c, 409, "not_funded", "nothing is escrowed yet");

  const { txHash } = c.req.valid("json");
  const refund = await confirmRefund(c.env, txHash);

  if (refund.jobId !== bounty.jobId) {
    return fail(c, 400, "wrong_job", "that transaction refunded a different job");
  }

  // Expiry and cancellation are different endings and the board should say which.
  const to = bounty.expiresAt.getTime() <= Date.now() ? "expired" : "cancelled";
  await store.recordBountyRefund(bounty.id, { status: to, txHash });
  console.log("refunded", {
    bountyId: bounty.id,
    jobId: String(bounty.jobId),
    txHash,
  });

  return c.json({
    status: to,
    amountUsdc: String(refund.amountUsdc),
    txUrl: txUrl(txHash, c.env),
  });
});

bountyRoutes.post("/:id/retry-settlement", internalOnly, async (c) => {
  const store = c.get("store")();
  const outcome = await settleBountyById(
    {
      store,
      github: c.get("github")(),
      wallets: circleWallets(c.env),
      compliance: circleCompliance(c.env),
      env: c.env,
    },
    c.req.param("id"),
  );

  // The outcome carries 6-decimal bigints, which JSON cannot hold.
  return c.json(
    outcome.kind === "settled"
      ? { kind: outcome.kind, txHash: outcome.txHash, split: serialiseSplit(outcome.split) }
      : outcome,
  );
});

function summarise(env: Env, bounty: Bounty, repoFullName: string) {
  return {
    id: bounty.id,
    repo: repoFullName,
    issueNumber: bounty.issueNumber,
    issueTitle: bounty.issueTitle,
    issueUrl: bounty.issueUrl,
    status: bounty.status,
    amountUsdc: String(bounty.amountUsdc),
    feeUsdc: String(bounty.feeUsdc),
    split: serialiseSplit(splitOf(bounty)),
    maintainerRewardBps: bounty.maintainerRewardBps,
    jobId: bounty.jobId === null ? null : String(bounty.jobId),
    tags: bounty.tags,
    expiresAt: bounty.expiresAt,
    createdAt: bounty.createdAt,
    createTxUrl: bounty.createTxHash ? txUrl(bounty.createTxHash, env) : null,
    settleTxUrl: bounty.settleTxHash ? txUrl(bounty.settleTxHash, env) : null,
    refundTxUrl: bounty.refundTxHash ? txUrl(bounty.refundTxHash, env) : null,
  };
}

/** Amounts cross the wire as strings; a 6-decimal bigint does not survive JSON. */
function serialiseSplit(split: {
  contributor: bigint;
  maintainer: bigint;
  fee: bigint;
  total: bigint;
}) {
  return {
    contributor: String(split.contributor),
    maintainer: String(split.maintainer),
    fee: String(split.fee),
    total: String(split.total),
  };
}
