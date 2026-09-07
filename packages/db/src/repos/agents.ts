import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { type Agent, agents } from "../schema";

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
