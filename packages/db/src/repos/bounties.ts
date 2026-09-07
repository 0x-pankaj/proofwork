import { and, eq, notInArray } from "drizzle-orm";
import type { Database } from "../client";
import { type Bounty, bounties } from "../schema";

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
  extra: Partial<Pick<Bounty, "acceptedAt" | "settleTxHash" | "circleTxId">> = {},
): Promise<boolean> {
  const updated = await db
    .update(bounties)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(and(eq(bounties.id, id), eq(bounties.status, from)))
    .returning({ id: bounties.id });
  return updated.length > 0;
}

/**
 * A maintainer opening a bounty for work. Returns false when it was not waiting for one,
 * which is what makes a repeated `/accept` comment harmless.
 */
export async function acceptBounty(db: Database, id: string): Promise<boolean> {
  return moveBountyStatus(db, id, "pending_accept", "open", { acceptedAt: new Date() });
}
