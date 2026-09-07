import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { type User, users } from "../schema";

export interface UserInput {
  githubId: bigint;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
}

/**
 * Records a GitHub account, keyed by its numeric id rather than its login: logins are
 * renameable and get reused, and a payout address must not follow the wrong person.
 */
export async function upsertUser(db: Database, input: UserInput): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      githubId: input.githubId,
      login: input.login,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: { login: input.login },
    })
    .returning();

  if (!row) throw new Error(`failed to upsert user ${input.login}`);
  return row;
}

export async function userByGithubId(db: Database, githubId: bigint): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
  return row;
}

export async function userById(db: Database, id: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function userByLogin(db: Database, login: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.login, login)).limit(1);
  return row;
}

/** Sets where a user is paid. Verified by signature at the route, not here. */
export async function setPayoutAddress(
  db: Database,
  userId: string,
  payoutAddress: string,
  payoutKind: User["payoutKind"] = "eoa",
): Promise<void> {
  await db.update(users).set({ payoutAddress, payoutKind }).where(eq(users.id, userId));
}
