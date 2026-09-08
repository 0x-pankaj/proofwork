import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { claims, type Submission, submissions } from "../schema";

export interface SubmissionInput {
  bountyId: string;
  claimId: string;
  prNumber: number;
  prUrl: string;
  headSha: string;
}

/**
 * Records a pull request against a bounty, or updates the row that already exists.
 *
 * A pull request fires `opened`, then `synchronize` on every push, then `edited` when the
 * body changes. All of them arrive here, so this has to be an upsert keyed on the pull
 * request rather than an insert.
 */
export async function upsertSubmission(db: Database, input: SubmissionInput): Promise<Submission> {
  const [row] = await db
    .insert(submissions)
    .values(input)
    .onConflictDoUpdate({
      target: [submissions.bountyId, submissions.prNumber],
      set: {
        claimId: sql`excluded.claim_id`,
        headSha: sql`excluded.head_sha`,
        prUrl: sql`excluded.pr_url`,
      },
    })
    .returning();

  if (!row) throw new Error(`failed to record pull request ${input.prNumber}`);
  return row;
}

export async function submissionForPr(
  db: Database,
  bountyId: string,
  prNumber: number,
): Promise<Submission | undefined> {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.bountyId, bountyId), eq(submissions.prNumber, prNumber)))
    .limit(1);
  return row;
}

/** The submission a settlement is about: the merged one, of which there can only be one. */
export async function mergedSubmissionFor(
  db: Database,
  bountyId: string,
): Promise<Submission | undefined> {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.bountyId, bountyId), eq(submissions.status, "merged")))
    .limit(1);
  return row;
}

export async function openSubmissionsFor(db: Database, bountyId: string): Promise<Submission[]> {
  return db
    .select()
    .from(submissions)
    .where(and(eq(submissions.bountyId, bountyId), eq(submissions.status, "open")));
}

export interface MergeInput {
  mergeSha: string;
  mergedAt: Date;
  deliverableHash: string;
}

export async function markSubmissionMerged(
  db: Database,
  id: string,
  input: MergeInput,
): Promise<void> {
  await db
    .update(submissions)
    .set({
      status: "merged",
      mergeSha: input.mergeSha,
      mergedAt: input.mergedAt,
      deliverableHash: input.deliverableHash,
    })
    .where(eq(submissions.id, id));
}

export async function markSubmissionClosed(db: Database, id: string): Promise<void> {
  await db.update(submissions).set({ status: "closed" }).where(eq(submissions.id, id));
}

/** Records a stake that actually moved, with the transfer that moved it. */
export async function recordStakeResolution(
  db: Database,
  claimId: string,
  outcome: "refunded" | "forwarded_to_maintainer",
  txHash: string | null,
): Promise<boolean> {
  const updated = await db
    .update(claims)
    .set({ stakeStatus: outcome, ...(txHash ? { stakeTxHash: txHash } : {}) })
    .where(and(eq(claims.id, claimId), eq(claims.stakeStatus, "held")))
    .returning({ id: claims.id });
  return updated.length > 0;
}

/**
 * Marks a claim's outcome, and what happens to the stake behind it. Leaving `stakeStatus`
 * out keeps the stake where it is, which is right when the claim simply did not win.
 */
export async function settleClaim(
  db: Database,
  claimId: string,
  status: "won" | "lost",
  stakeStatus?: "refunded" | "forwarded_to_maintainer" | "none",
): Promise<void> {
  await db
    .update(claims)
    .set({ status, ...(stakeStatus ? { stakeStatus } : {}) })
    .where(eq(claims.id, claimId));
}
