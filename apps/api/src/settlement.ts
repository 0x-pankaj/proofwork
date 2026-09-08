import {
  activeNetwork,
  bpsOf,
  erc8004ReputationAddress,
  proofworkJobsAddress,
  txUrl,
} from "@proofwork/chain";
import { type CircleCompliance, type CircleWallets, succeeded } from "@proofwork/circle";
import {
  deliverableHash,
  MERGED_REPUTATION_SCORE,
  type SettlementContext,
  type SettlementOutcome,
  type SettlementPorts,
  settleBounty,
} from "@proofwork/core";
import type { Bounty, Claim, RepoWithInstallation, Submission } from "@proofwork/db";
import { settledComment, settlementFailedComment } from "@proofwork/github";
import { type Env, required } from "./env";
import { resolveStakes } from "./stakes";
import type { Store } from "./store";
import { agentMetadataUrl } from "./urls";
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

export const GIVE_FEEDBACK_SIGNATURE =
  "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)";

/** The tag every Proofwork settlement writes, so its feedback can be read back apart. */
export const FEEDBACK_TAG = "proofwork/merged";

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
      await store.settleClaim(loaded.claim.id, "won");
      await store.loseOtherClaims(bountyId, loaded.claim.id);
      console.log("settled", { bountyId, jobId: String(loaded.bounty.jobId), txHash });

      // After the escrow, never before: a stake is the agent's own money and returning it
      // must not be able to hold up, or undo, the payment for the work.
      await resolveStakes(
        { store, wallets: deps.wallets, env },
        bountyId,
        loaded.found.repo.maintainerPayoutAddress,
      );
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
      // The local record is written either way: a registry that is unreachable must not
      // erase the fact that this agent was paid for a merged pull request.
      let txHash: string | null = null;
      try {
        txHash = loaded ? await writeFeedback(deps, loaded, agentId, score) : null;
      } catch (error) {
        console.error("reputation feedback failed", { bountyId, agentId, error: String(error) });
      }
      await store.recordReputationEvent({ agentId, bountyId, score, txHash });
    },
  };

  return settleBounty(bountyId, ports);
}

/**
 * Writes the settlement to the ERC-8004 reputation registry.
 *
 * An agent's record has to outlive us to be worth anything, so a merged bounty leaves
 * feedback on chain rather than only in our database. The verifier signs it — the
 * registry refuses feedback from the agent's own owner, and we are not it.
 *
 * Best effort by design: the money has already moved, and a registry that is down must
 * not turn a completed payment into a failed one. Returns the hash if it landed.
 */
async function writeFeedback(
  deps: SettlementDeps,
  loaded: Loaded,
  agentId: string,
  score: number,
): Promise<string | null> {
  const { env, store } = deps;
  const agent = await store.agentById(agentId);
  // An agent may work without an ERC-8004 identity; then there is nothing to write to.
  if (!agent?.erc8004AgentId) return null;

  const { bounty, submission, found } = loaded;
  if (!submission.mergeSha) return null;

  const { id } = await deps.wallets.executeContract({
    walletId: required(env, "CIRCLE_VERIFIER_WALLET_ID"),
    contractAddress: erc8004ReputationAddress(activeNetwork(env), env),
    abiFunctionSignature: GIVE_FEEDBACK_SIGNATURE,
    abiParameters: [
      agent.erc8004AgentId.toString(),
      String(score),
      "0",
      FEEDBACK_TAG,
      found.repo.fullName,
      submission.prUrl,
      agent.metadataUri ?? agentMetadataUrl(env, agent.id),
      deliverableHash({
        repoFullName: found.repo.fullName,
        prNumber: submission.prNumber,
        mergeSha: submission.mergeSha,
      }),
    ],
    idempotencyKey: await feedbackKey(bounty.id),
  });

  const transaction = await deps.wallets.waitForTransaction(id, { timeoutMs: 30_000 });
  if (!succeeded(transaction)) {
    throw new Error(`reputation feedback ended ${transaction.state}`);
  }

  console.log("reputation", { bountyId: bounty.id, agentId, txHash: transaction.txHash });
  return transaction.txHash ?? null;
}

/**
 * A UUID derived from the bounty id. Circle keys retries by UUID, and the settlement
 * already spent the bounty's own id, so feedback needs a different but equally stable one.
 */
async function feedbackKey(bountyId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`feedback:${bountyId}`)),
  );
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
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
