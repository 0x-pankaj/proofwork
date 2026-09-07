import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { type Installation, installations } from "../schema";

export interface InstallationInput {
  githubInstallationId: bigint;
  accountLogin: string;
  accountType: "User" | "Organization";
  suspended?: boolean;
}

/** Records an installation, or updates the one we already had for this GitHub id. */
export async function upsertInstallation(
  db: Database,
  input: InstallationInput,
): Promise<Installation> {
  const values = {
    githubInstallationId: input.githubInstallationId,
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    suspended: input.suspended ?? false,
  };

  const [row] = await db
    .insert(installations)
    .values(values)
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: {
        accountLogin: values.accountLogin,
        accountType: values.accountType,
        suspended: values.suspended,
      },
    })
    .returning();

  if (!row) throw new Error(`failed to upsert installation ${input.githubInstallationId}`);
  return row;
}

/**
 * A suspended installation is one whose tokens GitHub will refuse, so nothing should act
 * on its repositories. Uninstalling is recorded the same way, which keeps the history.
 */
export async function setInstallationSuspended(
  db: Database,
  githubInstallationId: bigint,
  suspended: boolean,
): Promise<void> {
  await db
    .update(installations)
    .set({ suspended })
    .where(eq(installations.githubInstallationId, githubInstallationId));
}

export async function installationByGithubId(
  db: Database,
  githubInstallationId: bigint,
): Promise<Installation | undefined> {
  const [row] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, githubInstallationId))
    .limit(1);
  return row;
}
