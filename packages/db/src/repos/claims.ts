import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { type Claim, claims } from "../schema";

export interface ClaimInput {
  bountyId: string;
  claimantKind: Claim["claimantKind"];
  userId?: string | null;
  agentId?: string | null;
  githubLogin: string;
  payoutAddress: string;
  stakePaymentId?: string | null;
  stakeStatus?: Claim["stakeStatus"];
}

export async function activeClaimsFor(db: Database, bountyId: string): Promise<Claim[]> {
  return db
    .select()
    .from(claims)
    .where(and(eq(claims.bountyId, bountyId), eq(claims.status, "active")));
}

export async function activeClaimBy(
  db: Database,
  bountyId: string,
  githubLogin: string,
): Promise<Claim | undefined> {
  const [row] = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.bountyId, bountyId),
        eq(claims.githubLogin, githubLogin),
        eq(claims.status, "active"),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Claims a bounty, or returns the claim that already exists.
 *
 * Commenting `/claim` twice is normal — people do it when nothing seems to happen — so a
 * repeat is answered with the original claim rather than an error or a duplicate.
 */
export async function claimBounty(db: Database, input: ClaimInput): Promise<Claim> {
  const [inserted] = await db
    .insert(claims)
    .values({
      bountyId: input.bountyId,
      claimantKind: input.claimantKind,
      userId: input.userId ?? null,
      agentId: input.agentId ?? null,
      githubLogin: input.githubLogin,
      payoutAddress: input.payoutAddress,
      stakePaymentId: input.stakePaymentId ?? null,
      stakeStatus: input.stakeStatus ?? "none",
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const existing = await activeClaimBy(db, input.bountyId, input.githubLogin);
  if (!existing) {
    throw new Error(
      `claim by ${input.githubLogin} on ${input.bountyId} was neither created nor found`,
    );
  }
  return existing;
}

/** Releases a claim. Returns false when there was nothing active to release. */
export async function withdrawClaim(
  db: Database,
  bountyId: string,
  githubLogin: string,
): Promise<boolean> {
  const updated = await db
    .update(claims)
    .set({ status: "withdrawn" })
    .where(
      and(
        eq(claims.bountyId, bountyId),
        eq(claims.githubLogin, githubLogin),
        eq(claims.status, "active"),
      ),
    )
    .returning({ id: claims.id });
  return updated.length > 0;
}
