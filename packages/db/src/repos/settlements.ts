import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  agents,
  type Bounty,
  bounties,
  claims,
  type Repo,
  repos,
  reputationEvents,
  type Settlement,
  settlements,
} from "../schema";

/**
 * The payout ledger. There is exactly one settlement row per bounty — the unique index
 * enforces it — so every function here is keyed on the bounty rather than a row id, and
 * a replayed merge webhook updates the same row instead of paying twice.
 */

export interface SettlementInput {
  bountyId: string;
  claimId: string;
  providerAddress: string;
  amountUsdc: bigint;
  feeUsdc: bigint;
  screeningResult?: unknown;
}

/** Opens (or reopens, after a failure) the settlement for a bounty. */
export async function openSettlement(db: Database, input: SettlementInput): Promise<Settlement> {
  const [row] = await db
    .insert(settlements)
    .values({ ...input, status: "pending", screeningResult: input.screeningResult ?? null })
    .onConflictDoUpdate({
      target: settlements.bountyId,
      set: {
        claimId: sql`excluded.claim_id`,
        providerAddress: sql`excluded.provider_address`,
        amountUsdc: sql`excluded.amount_usdc`,
        feeUsdc: sql`excluded.fee_usdc`,
        screeningResult: sql`excluded.screening_result`,
        status: sql`excluded.status`,
        error: sql`null`,
      },
    })
    .returning();

  if (!row) throw new Error(`failed to open a settlement for bounty ${input.bountyId}`);
  return row;
}

export async function settlementForBounty(
  db: Database,
  bountyId: string,
): Promise<Settlement | undefined> {
  const [row] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.bountyId, bountyId))
    .limit(1);
  return row;
}

export async function markSettlementSubmitted(
  db: Database,
  bountyId: string,
  circleTxId: string,
): Promise<void> {
  await db
    .update(settlements)
    .set({ status: "submitted", circleTxId })
    .where(eq(settlements.bountyId, bountyId));
}

export async function markSettlementComplete(
  db: Database,
  bountyId: string,
  input: { txHash: string; circleTxId: string },
): Promise<void> {
  await db
    .update(settlements)
    .set({
      status: "complete",
      txHash: input.txHash,
      circleTxId: input.circleTxId,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(settlements.bountyId, bountyId));
}

export async function markSettlementFailed(
  db: Database,
  bountyId: string,
  input: { error: string; circleTxId?: string },
): Promise<void> {
  await db
    .update(settlements)
    .set({
      status: "failed",
      error: input.error.slice(0, 2000),
      ...(input.circleTxId ? { circleTxId: input.circleTxId } : {}),
    })
    .where(eq(settlements.bountyId, bountyId));
}

export interface ReputationInput {
  agentId: string;
  bountyId: string;
  score: number;
  txHash?: string | null;
}

/**
 * Records feedback for an agent. The row is the local copy; the ERC-8004 registry entry
 * is written separately and its hash lands here when it confirms.
 */
export async function recordReputationEvent(db: Database, input: ReputationInput): Promise<void> {
  await db.insert(reputationEvents).values({
    agentId: input.agentId,
    bountyId: input.bountyId,
    score: input.score,
    txHash: input.txHash ?? null,
  });
  await db
    .update(agents)
    .set({ reputationScore: sql`${agents.reputationScore} + ${input.score}` })
    .where(eq(agents.id, input.agentId));
}

export interface SettlementListing {
  settlement: Settlement;
  bounty: Bounty;
  repo: Repo;
}

/** Payouts to one person, which is the answer to "have I been paid yet". */
export async function settlementsForUser(
  db: Database,
  userId: string,
): Promise<SettlementListing[]> {
  return db
    .select({ settlement: settlements, bounty: bounties, repo: repos })
    .from(settlements)
    .innerJoin(claims, eq(settlements.claimId, claims.id))
    .innerJoin(bounties, eq(settlements.bountyId, bounties.id))
    .innerJoin(repos, eq(bounties.repoId, repos.id))
    .where(eq(claims.userId, userId))
    .orderBy(desc(settlements.createdAt));
}
