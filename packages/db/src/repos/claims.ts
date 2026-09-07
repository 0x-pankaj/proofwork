import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../client";
import { type Bounty, bounties, type Claim, claims, type Repo, repos } from "../schema";

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

export async function claimById(db: Database, id: string): Promise<Claim | undefined> {
  const [row] = await db.select().from(claims).where(eq(claims.id, id)).limit(1);
  return row;
}

/** Every claim ever made on a bounty, so a settled one still shows who did the work. */
export async function claimsFor(db: Database, bountyId: string): Promise<Claim[]> {
  return db.select().from(claims).where(eq(claims.bountyId, bountyId)).orderBy(claims.createdAt);
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

/**
 * Every other live claim on a bounty, once one of them has won. Their stakes are left
 * where they are: nothing was reviewed, so nothing is owed to the maintainer.
 */
export async function loseOtherClaims(
  db: Database,
  bountyId: string,
  winnerClaimId: string,
): Promise<void> {
  await db
    .update(claims)
    .set({ status: "lost" })
    .where(
      and(eq(claims.bountyId, bountyId), eq(claims.status, "active"), ne(claims.id, winnerClaimId)),
    );
}

export interface StaleClaim {
  claim: Claim;
  bounty: Bounty;
  repo: Repo;
}

/**
 * Live claims on live bounties, with the repository policy that says how long a claim may
 * be held. Which of them have actually gone stale is decided by the caller, because the
 * time-to-live lives inside a JSON policy column.
 */
export async function activeClaimsWithPolicy(db: Database): Promise<StaleClaim[]> {
  return db
    .select({ claim: claims, bounty: bounties, repo: repos })
    .from(claims)
    .innerJoin(bounties, eq(claims.bountyId, bounties.id))
    .innerJoin(repos, eq(bounties.repoId, repos.id))
    .where(and(eq(claims.status, "active"), inArray(bounties.status, ["open", "claimed"])));
}

/** Releases claims that were held without a pull request; their stakes pay the maintainer. */
export async function expireClaims(db: Database, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(claims)
    .set({ status: "expired", stakeStatus: "forwarded_to_maintainer" })
    .where(and(inArray(claims.id, ids), eq(claims.status, "active")))
    .returning({ id: claims.id });
  return updated.length;
}

export interface ClaimListing {
  claim: Claim;
  bounty: Bounty;
  repo: Repo;
}

/** Everything one person is working on or has worked on. */
export async function claimsForUser(db: Database, userId: string): Promise<ClaimListing[]> {
  return db
    .select({ claim: claims, bounty: bounties, repo: repos })
    .from(claims)
    .innerJoin(bounties, eq(claims.bountyId, bounties.id))
    .innerJoin(repos, eq(bounties.repoId, repos.id))
    .where(eq(claims.userId, userId))
    .orderBy(desc(claims.createdAt));
}
