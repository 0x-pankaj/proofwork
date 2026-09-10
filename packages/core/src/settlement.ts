import { bpsOf } from "@proofwork/chain";
import { deliverableHash, mergedReasonHash } from "./hashing";
import { assertTransition, type BountyStatus } from "./status";

/**
 * Turning a merged pull request into three payments.
 *
 * Everything the outside world does lives behind the ports below, so this file has no
 * database, no HTTP and no chain client in it. That matters because this is the code path
 * that moves money: it is worth being able to test every branch of it, including the ugly
 * ones, without a network.
 */

export interface SettlementBounty {
  id: string;
  status: BountyStatus;
  /** The on-chain job id. Absent means funding never confirmed. */
  jobId: bigint | null;
  amountUsdc: bigint;
  feeUsdc: bigint;
  maintainerAddress: string | null;
  maintainerRewardBps: number;
  repoFullName: string;
}

export interface SettlementClaim {
  id: string;
  githubLogin: string;
  payoutAddress: string | null;
  claimantKind: "user" | "agent";
  agentId: string | null;
}

export interface SettlementSubmission {
  prNumber: number;
  mergeSha: string | null;
}

export interface SettlementContext {
  bounty: SettlementBounty;
  claim: SettlementClaim;
  submission: SettlementSubmission;
}

export interface Split {
  contributor: bigint;
  maintainer: bigint;
  fee: bigint;
  total: bigint;
}

export interface ScreeningResult {
  approved: boolean;
  reason?: string;
  raw?: unknown;
}

export interface ExecutionRequest {
  jobId: bigint;
  provider: string;
  deliverable: `0x${string}`;
  reason: `0x${string}`;
}

export interface ConfirmationResult {
  status: "complete" | "failed";
  txHash?: string;
  error?: string;
}

/** Everything the orchestrator needs from the outside world. */
export interface SettlementPorts {
  /** Returns undefined when there is nothing to settle. */
  load(bountyId: string): Promise<SettlementContext | undefined>;
  /** Compliance screening of the address about to be paid. */
  screen(address: string): Promise<ScreeningResult>;
  markSettling(bountyId: string): Promise<void>;
  /** Submits the on-chain settlement and returns a handle to poll. */
  execute(request: ExecutionRequest): Promise<{ circleTxId: string }>;
  confirm(circleTxId: string): Promise<ConfirmationResult>;
  recordSuccess(input: {
    bountyId: string;
    txHash: string;
    circleTxId: string;
    screening?: ScreeningResult;
  }): Promise<void>;
  recordFailure(input: {
    bountyId: string;
    error: string;
    circleTxId?: string;
    screening?: ScreeningResult;
  }): Promise<void>;
  /** Best effort. A failure here must never undo a payment. */
  comment(input: { bountyId: string; txHash: string; split: Split }): Promise<void>;
  /** Best effort, agents only. */
  recordReputation(input: { agentId: string; bountyId: string; score: number }): Promise<void>;
}

export type SettlementOutcome =
  | { kind: "settled"; txHash: string; split: Split }
  | { kind: "skipped"; reason: string }
  | { kind: "blocked"; reason: string }
  | { kind: "failed"; error: string };

/** What each party receives. Mirrors the contract's integer maths exactly. */
export function splitFor(amountUsdc: bigint, maintainerRewardBps: number, feeUsdc: bigint): Split {
  const maintainer = bpsOf(amountUsdc, maintainerRewardBps);
  const contributor = amountUsdc - maintainer;
  return { contributor, maintainer, fee: feeUsdc, total: amountUsdc + feeUsdc };
}

/** Score written to the reputation registry for a merged contribution. */
export const MERGED_REPUTATION_SCORE = 100;

/**
 * Settles one bounty. Safe to call twice: the second call finds a status that cannot
 * move to `settling` and skips, which is what makes a redelivered merge webhook harmless.
 */
export async function settleBounty(
  bountyId: string,
  ports: SettlementPorts,
): Promise<SettlementOutcome> {
  const context = await ports.load(bountyId);
  if (!context) return { kind: "skipped", reason: "bounty, claim or submission not found" };

  const { bounty, claim, submission } = context;

  try {
    assertTransition(bounty.status, "settling");
  } catch {
    return { kind: "skipped", reason: `bounty is ${bounty.status}, not settleable` };
  }

  if (bounty.jobId === null) {
    return { kind: "skipped", reason: "bounty has no on-chain job; funding never confirmed" };
  }
  if (!submission.mergeSha) {
    return { kind: "skipped", reason: "pull request has no merge commit" };
  }
  if (!claim.payoutAddress) {
    return { kind: "skipped", reason: `${claim.githubLogin} has not set a payout address` };
  }
  if (bounty.maintainerRewardBps > 0 && !bounty.maintainerAddress) {
    return { kind: "skipped", reason: "a review reward is set but the maintainer has no address" };
  }

  const split = splitFor(bounty.amountUsdc, bounty.maintainerRewardBps, bounty.feeUsdc);

  // The settlement row is opened before screening, so a blocked payout leaves a record
  // of what was screened and why it stopped, rather than nothing at all.
  await ports.markSettling(bountyId);

  const screening = await ports.screen(claim.payoutAddress);
  if (!screening.approved) {
    const reason = screening.reason ?? "payout address failed screening";
    await ports.recordFailure({ bountyId, error: reason, screening });
    return { kind: "blocked", reason };
  }

  let circleTxId: string;
  try {
    const submitted = await ports.execute({
      jobId: bounty.jobId,
      provider: claim.payoutAddress,
      deliverable: deliverableHash({
        repoFullName: bounty.repoFullName,
        prNumber: submission.prNumber,
        mergeSha: submission.mergeSha,
      }),
      reason: mergedReasonHash(submission.mergeSha),
    });
    circleTxId = submitted.circleTxId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ports.recordFailure({ bountyId, error: message, screening });
    return { kind: "failed", error: message };
  }

  const confirmation = await ports.confirm(circleTxId);
  if (confirmation.status !== "complete" || !confirmation.txHash) {
    const message = confirmation.error ?? "settlement transaction did not complete";
    await ports.recordFailure({ bountyId, error: message, circleTxId, screening });
    return { kind: "failed", error: message };
  }

  await ports.recordSuccess({ bountyId, txHash: confirmation.txHash, circleTxId, screening });

  // Past this point the money has moved. Nothing below may change the outcome.
  await settled(ports.comment({ bountyId, txHash: confirmation.txHash, split }));
  if (claim.claimantKind === "agent" && claim.agentId) {
    await settled(
      ports.recordReputation({
        agentId: claim.agentId,
        bountyId,
        score: MERGED_REPUTATION_SCORE,
      }),
    );
  }

  return { kind: "settled", txHash: confirmation.txHash, split };
}

/** Swallows a rejection from a step that runs after the payment has already landed. */
async function settled(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch {
    // Reported by the caller's own logging; a failed comment is not a failed payment.
  }
}
