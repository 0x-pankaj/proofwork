import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  type Agent,
  agents,
  bounties,
  claims,
  type NewAgent,
  type ReputationEvent,
  reputationEvents,
  settlements,
} from "../schema";

export async function agentByGithubLogin(
  db: Database,
  githubLogin: string,
): Promise<Agent | undefined> {
  const [row] = await db.select().from(agents).where(eq(agents.githubLogin, githubLogin)).limit(1);
  return row;
}

export async function agentById(db: Database, id: string): Promise<Agent | undefined> {
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return row;
}

export async function agentByWalletAddress(
  db: Database,
  walletAddress: string,
): Promise<Agent | undefined> {
  const [row] = await db
    .select()
    .from(agents)
    .where(eq(sql`lower(${agents.walletAddress})`, walletAddress.toLowerCase()))
    .limit(1);
  return row;
}

/** The lookup behind an agent's API key. Only the hash is ever stored or compared. */
export async function agentByApiKeyHash(db: Database, hash: string): Promise<Agent | undefined> {
  const [row] = await db.select().from(agents).where(eq(agents.apiKeyHash, hash)).limit(1);
  return row;
}

export async function createAgent(db: Database, input: NewAgent): Promise<Agent> {
  const [row] = await db.insert(agents).values(input).returning();
  if (!row) throw new Error("agent insert returned nothing");
  return row;
}

/** Set once an agent proves it owns its ERC-8004 token. */
export async function setAgentIdentity(
  db: Database,
  id: string,
  input: { erc8004AgentId: bigint | null; metadataUri: string | null },
): Promise<void> {
  await db
    .update(agents)
    .set({ erc8004AgentId: input.erc8004AgentId, metadataUri: input.metadataUri })
    .where(eq(agents.id, id));
}

export interface AgentRecord {
  /** Bounties this agent was paid for. */
  settled: number;
  /** What actually landed at its wallet, in 6-decimal USDC. */
  earnedUsdc: bigint;
  reputation: ReputationEvent[];
}

/**
 * What an agent has actually done, which is the only part of its profile worth trusting:
 * every number here is derived from a settlement that moved money.
 */
export async function agentRecord(db: Database, agentId: string): Promise<AgentRecord> {
  const rows = await db
    .select({
      amountUsdc: settlements.amountUsdc,
      maintainerRewardBps: bounties.maintainerRewardBps,
    })
    .from(settlements)
    .innerJoin(claims, eq(claims.id, settlements.claimId))
    .innerJoin(bounties, eq(bounties.id, settlements.bountyId))
    .where(and(eq(claims.agentId, agentId), eq(settlements.status, "complete")));

  const earnedUsdc = rows.reduce((total, row) => {
    const maintainer = (row.amountUsdc * BigInt(row.maintainerRewardBps)) / 10_000n;
    return total + row.amountUsdc - maintainer;
  }, 0n);

  const reputation = await db
    .select()
    .from(reputationEvents)
    .where(eq(reputationEvents.agentId, agentId))
    .orderBy(desc(reputationEvents.createdAt))
    .limit(50);

  return { settled: rows.length, earnedUsdc, reputation };
}
