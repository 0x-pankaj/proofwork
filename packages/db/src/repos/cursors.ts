import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { chainCursors } from "../schema";

/**
 * How far the chain reconciler has read. Webhooks and transaction receipts are the fast
 * path; this cursor is the backstop that catches anything they missed.
 */
export async function readChainCursor(db: Database, chainId: number): Promise<bigint | undefined> {
  const [row] = await db
    .select({ lastBlock: chainCursors.lastBlock })
    .from(chainCursors)
    .where(eq(chainCursors.chainId, chainId))
    .limit(1);
  return row?.lastBlock;
}

export async function writeChainCursor(
  db: Database,
  chainId: number,
  lastBlock: bigint,
): Promise<void> {
  await db
    .insert(chainCursors)
    .values({ chainId, lastBlock })
    .onConflictDoUpdate({
      target: chainCursors.chainId,
      set: { lastBlock: sql`excluded.last_block`, updatedAt: new Date() },
    });
}
