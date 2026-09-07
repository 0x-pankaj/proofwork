import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import type { Database } from "../client";
import { type Bounty, bounties, type Repo, repos } from "../schema";

/** Statuses in which a bounty is finished with, one way or another. */
const TERMINAL: Bounty["status"][] = ["settled", "rejected", "expired", "cancelled"];

/**
 * The live bounty on an issue, if there is one. At most one can exist at a time: the
 * partial unique index on `bounties` enforces it, so this returns a row, not a list.
 */
export async function activeBountyForIssue(
  db: Database,
  repoId: string,
  issueNumber: number,
): Promise<Bounty | undefined> {
  const [row] = await db
    .select()
    .from(bounties)
    .where(
      and(
        eq(bounties.repoId, repoId),
        eq(bounties.issueNumber, issueNumber),
        notInArray(bounties.status, TERMINAL),
      ),
    )
    .limit(1);
  return row;
}

export async function bountyById(db: Database, id: string): Promise<Bounty | undefined> {
  const [row] = await db.select().from(bounties).where(eq(bounties.id, id)).limit(1);
  return row;
}

/**
 * Moves a bounty to a new status, but only from the status the caller believed it was in.
 * Two webhook deliveries racing on the same bounty cannot both win this update.
 */
export async function moveBountyStatus(
  db: Database,
  id: string,
  from: Bounty["status"],
  to: Bounty["status"],
  extra: Partial<Pick<Bounty, "acceptedAt" | "createTxHash" | "settleTxHash" | "circleTxId">> = {},
): Promise<boolean> {
  const updated = await db
    .update(bounties)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(and(eq(bounties.id, id), eq(bounties.status, from)))
    .returning({ id: bounties.id });
  return updated.length > 0;
}

/** Records the payout on the bounty itself, so the board and the UI can show it. */
export async function completeBounty(
  db: Database,
  id: string,
  input: { txHash: string; circleTxId: string },
): Promise<boolean> {
  return moveBountyStatus(db, id, "settling", "settled", {
    settleTxHash: input.txHash,
    circleTxId: input.circleTxId,
  });
}

/**
 * A maintainer opening a bounty for work. Returns false when it was not waiting for one,
 * which is what makes a repeated `/accept` comment harmless.
 */
export async function acceptBounty(db: Database, id: string): Promise<boolean> {
  return moveBountyStatus(db, id, "pending_accept", "open", { acceptedAt: new Date() });
}

export interface NewBountyInput {
  repoId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  description: string;
  amountUsdc: bigint;
  feeUsdc: bigint;
  maintainerAddress: string | null;
  maintainerRewardBps: number;
  funderUserId: string;
  funderAddress: string;
  evaluatorAddress: string;
  expiresAt: Date;
  tags?: string[];
}

/**
 * Creates a bounty in `draft`. No money has moved yet; the funder still has to send the
 * escrow transaction, which is what `confirmBountyFunded` records.
 */
export async function createBounty(db: Database, input: NewBountyInput): Promise<Bounty> {
  const [row] = await db
    .insert(bounties)
    .values({ ...input, tags: input.tags ?? [], status: "draft" })
    .returning();
  if (!row) throw new Error(`failed to create a bounty on ${input.repoId}#${input.issueNumber}`);
  return row;
}

/** Records that the funding transaction has been sent. */
export async function markBountyFunding(
  db: Database,
  id: string,
  createTxHash: string,
): Promise<boolean> {
  return moveBountyStatus(db, id, "draft", "funding", { createTxHash });
}

/**
 * The escrow is confirmed on chain. A repository that accepts bounties automatically
 * goes straight to `open`; otherwise a maintainer has to accept it first.
 */
export async function confirmBountyFunded(
  db: Database,
  id: string,
  input: { jobId: bigint; createTxHash: string; autoAccept: boolean },
): Promise<boolean> {
  const to = input.autoAccept ? "open" : "pending_accept";
  const updated = await db
    .update(bounties)
    .set({
      status: to,
      jobId: input.jobId,
      createTxHash: input.createTxHash,
      updatedAt: new Date(),
      ...(input.autoAccept ? { acceptedAt: new Date() } : {}),
    })
    .where(and(eq(bounties.id, id), inArray(bounties.status, ["draft", "funding"])))
    .returning({ id: bounties.id });
  return updated.length > 0;
}

export interface BountyFilter {
  status?: Bounty["status"];
  repoId?: string;
  minAmountUsdc?: bigint;
  limit?: number;
  offset?: number;
}

export interface BountyListing {
  bounty: Bounty;
  repo: Repo;
}

/** The board. Newest first, because a fresh bounty is the one worth showing. */
export async function listBounties(
  db: Database,
  filter: BountyFilter = {},
): Promise<BountyListing[]> {
  const conditions = [
    filter.status ? eq(bounties.status, filter.status) : undefined,
    filter.repoId ? eq(bounties.repoId, filter.repoId) : undefined,
    filter.minAmountUsdc !== undefined ? gte(bounties.amountUsdc, filter.minAmountUsdc) : undefined,
  ].filter((condition) => condition !== undefined);

  return db
    .select({ bounty: bounties, repo: repos })
    .from(bounties)
    .innerJoin(repos, eq(bounties.repoId, repos.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bounties.createdAt))
    .limit(Math.min(filter.limit ?? 50, 100))
    .offset(filter.offset ?? 0);
}

/** A bounty with the repository it lives on, for the detail page. */
export async function bountyWithRepo(db: Database, id: string): Promise<BountyListing | undefined> {
  const [row] = await db
    .select({ bounty: bounties, repo: repos })
    .from(bounties)
    .innerJoin(repos, eq(bounties.repoId, repos.id))
    .where(eq(bounties.id, id))
    .limit(1);
  return row;
}
