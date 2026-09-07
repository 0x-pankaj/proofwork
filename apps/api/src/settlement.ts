import { activeNetwork, bpsOf, proofworkJobsAddress, txUrl } from "@proofwork/chain";
import type { CircleCompliance, CircleWallets } from "@proofwork/circle";
import {
  MERGED_REPUTATION_SCORE,
  type SettlementContext,
  type SettlementOutcome,
  type SettlementPorts,
  settleBounty,
} from "@proofwork/core";
import type { Bounty, Claim, RepoWithInstallation, Submission } from "@proofwork/db";
import { settledComment, settlementFailedComment } from "@proofwork/github";
import { type Env, required } from "./env";
import type { Store } from "./store";
import type { CommentWriter } from "./webhooks/handlers/issues";
import { repoRef } from "./webhooks/repo-ref";

/**
 * Where the domain logic in `@proofwork/core` meets the outside world.
 *
 * `settleBounty` decides *whether* and *in what order*; everything here is the *how*:
 * which wallet signs, which contract call is made, what is written down and what gets
 * said on GitHub. Keeping them apart is why the payment path can be tested exhaustively.
 */

export const SETTLE_SIGNATURE = "settle(uint256,address,bytes32,bytes32)";

export interface SettlementDeps {
  store: Store;
  github: CommentWriter;
  wallets: CircleWallets;
  compliance: CircleCompliance;
  env: Env;
}

interface Loaded {
  bounty: Bounty;
  claim: Claim;
  submission: Submission;
  found: RepoWithInstallation;
}

/** Settles one bounty end to end: screen, call `settle`, record, comment. */
export async function settleBountyById(
  deps: SettlementDeps,
  bountyId: string,
): Promise<SettlementOutcome> {
  const { store, env } = deps;
  let loaded: Loaded | undefined;
  // Timed from here rather than from the merge, so a retry after an outage does not
  // report a settlement that took an hour when the payment itself took three seconds.
  const startedAt = Date.now();

  const ports: SettlementPorts = {
    async load(): Promise<SettlementContext | undefined> {
      const bounty = await store.bountyById(bountyId);
      if (!bounty) return undefined;

      const submission = await store.mergedSubmissionFor(bountyId);
      if (!submission) return undefined;

      const claim = await store.claimById(submission.claimId);
      if (!claim) return undefined;

      const found = await store.repoById(bounty.repoId);
      if (!found) return undefined;

      loaded = { bounty, claim, submission, found };

      return {
        bounty: {
          id: bounty.id,
          status: bounty.status,
          jobId: bounty.jobId,
          amountUsdc: bounty.amountUsdc,
          feeUsdc: bounty.feeUsdc,
          maintainerAddress: bounty.maintainerAddress,
          maintainerRewardBps: bounty.maintainerRewardBps,
          repoFullName: found.repo.fullName,
        },
        claim: {
          id: claim.id,
          githubLogin: claim.githubLogin,
          payoutAddress: claim.payoutAddress,
          claimantKind: claim.claimantKind,
          agentId: claim.agentId,
        },
        submission: { prNumber: submission.prNumber, mergeSha: submission.mergeSha },
      };
    },

    async screen(address) {
      const outcome = await deps.compliance.screenAddress(address, bountyId);
      return { approved: outcome.approved, reason: outcome.reason, raw: outcome.raw };
    },

    async markSettling() {
      if (!loaded) throw new Error(`settlement for ${bountyId} started without a context`);
      const { bounty, claim } = loaded;

      await store.openSettlement({
        bountyId,
        claimId: claim.id,
        providerAddress: claim.payoutAddress,
        amountUsdc: bounty.amountUsdc,
        feeUsdc: bounty.feeUsdc,
      });
      await store.moveBountyStatus(bountyId, bounty.status, "settling");
    },

    async execute(request) {
      const network = activeNetwork(env);
      const { id } = await deps.wallets.executeContract({
        walletId: required(env, "CIRCLE_VERIFIER_WALLET_ID"),
        contractAddress: proofworkJobsAddress(network, env),
        abiFunctionSignature: SETTLE_SIGNATURE,
        abiParameters: [
          request.jobId.toString(),
          request.provider,
          request.deliverable,
          request.reason,
        ],
        // The bounty id is a UUID, so Circle collapses a redelivered merge into one call.
        idempotencyKey: bountyId,
      });

      await store.markSettlementSubmitted(bountyId, id);
      return { circleTxId: id };
    },

    async confirm(circleTxId) {
      const transaction = await deps.wallets.waitForTransaction(circleTxId);
      if (
        (transaction.state === "COMPLETE" || transaction.state === "CONFIRMED") &&
        transaction.txHash
      ) {
        return { status: "complete", txHash: transaction.txHash };
      }
      return {
        status: "failed",
        error: transaction.errorReason
          ? `${transaction.state}: ${transaction.errorReason}`
          : `settlement transaction ended ${transaction.state}`,
      };
    },

    async recordSuccess({ txHash, circleTxId }) {
      if (!loaded) return;
      await store.markSettlementComplete(bountyId, { txHash, circleTxId });
      await store.completeBounty(bountyId, { txHash, circleTxId });
      await store.settleClaim(loaded.claim.id, "won", "refunded");
      await store.loseOtherClaims(bountyId, loaded.claim.id);
      console.log("settled", { bountyId, jobId: String(loaded.bounty.jobId), txHash });
    },

    async recordFailure({ error, circleTxId }) {
      await store.markSettlementFailed(bountyId, { error, ...(circleTxId ? { circleTxId } : {}) });
      // Back to submitted so a retry can pick it up; the escrow has not moved.
      await store.moveBountyStatus(bountyId, "settling", "submitted");
      console.error("settlement failed", { bountyId, circleTxId, error });

      if (!loaded) return;
      await deps.github.upsertIssueComment(
        repoRef(loaded.found),
        loaded.bounty.issueNumber,
        settlementFailedComment(bountyId, error).marker,
        settlementFailedComment(bountyId, error).body,
      );
    },

    async comment({ txHash, split }) {
      if (!loaded) return;
      const { bounty, claim, found } = loaded;
      const maintainer = found.repo.maintainerUserId
        ? await store.userById(found.repo.maintainerUserId)
        : undefined;
      const comment = settledComment({
        bountyId,
        login: claim.githubLogin,
        contributorUsdc: split.contributor,
        maintainerUsdc: split.maintainer,
        maintainerLogin: maintainer?.login ?? null,
        txUrl: txUrl(txHash, env),
        seconds: (Date.now() - startedAt) / 1000,
      });

      await deps.github.upsertIssueComment(
        repoRef(found),
        bounty.issueNumber,
        comment.marker,
        comment.body,
      );
    },

    async recordReputation({ agentId, score }) {
      await store.recordReputationEvent({ agentId, bountyId, score });
    },
  };

  return settleBounty(bountyId, ports);
}

/** What each party is owed, for the API and the UI. Mirrors the contract exactly. */
export function splitOf(bounty: Pick<Bounty, "amountUsdc" | "feeUsdc" | "maintainerRewardBps">) {
  const maintainer = bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps);
  return {
    contributor: bounty.amountUsdc - maintainer,
    maintainer,
    fee: bounty.feeUsdc,
    total: bounty.amountUsdc + bounty.feeUsdc,
  };
}

export { MERGED_REPUTATION_SCORE };
