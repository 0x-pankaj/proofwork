import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type Installation, installations, type Repo, repos } from "../schema";

export interface RepositoryInput {
  githubRepoId: bigint;
  fullName: string;
  private: boolean;
}

/**
 * Brings the repositories of one installation up to date.
 *
 * A repository that comes back after being removed is reactivated rather than recreated,
 * so its bounties, claims and settlements are still attached to it.
 */
export async function syncRepos(
  db: Database,
  installationId: string,
  repositories: RepositoryInput[],
): Promise<Repo[]> {
  if (repositories.length === 0) return [];

  return db
    .insert(repos)
    .values(
      repositories.map((repository) => ({
        githubRepoId: repository.githubRepoId,
        fullName: repository.fullName,
        private: repository.private,
        installationId,
        installed: true,
      })),
    )
    .onConflictDoUpdate({
      target: repos.githubRepoId,
      // `excluded` is the row postgres could not insert: the values we just supplied.
      set: {
        fullName: sql`excluded.full_name`,
        private: sql`excluded.private`,
        installationId: sql`excluded.installation_id`,
        installed: sql`excluded.installed`,
      },
    })
    .returning();
}

/** Marks repositories as no longer installed, keeping every row they own. */
export async function markReposUninstalled(db: Database, githubRepoIds: bigint[]): Promise<void> {
  if (githubRepoIds.length === 0) return;
  await db
    .update(repos)
    .set({ installed: false })
    .where(inArray(repos.githubRepoId, githubRepoIds));
}

/** Used when the whole app is uninstalled or suspended for an account. */
export async function markInstallationReposUninstalled(
  db: Database,
  installationId: string,
): Promise<void> {
  await db.update(repos).set({ installed: false }).where(eq(repos.installationId, installationId));
}

export async function repoByGithubId(
  db: Database,
  githubRepoId: bigint,
): Promise<Repo | undefined> {
  const [row] = await db.select().from(repos).where(eq(repos.githubRepoId, githubRepoId)).limit(1);
  return row;
}

export async function repoByFullName(db: Database, fullName: string): Promise<Repo | undefined> {
  const [row] = await db.select().from(repos).where(eq(repos.fullName, fullName)).limit(1);
  return row;
}

export interface RepoWithInstallation {
  repo: Repo;
  installation: Installation;
}

/**
 * A repository together with the installation that owns it. Every GitHub call needs the
 * numeric installation id to mint a token, so the two are almost always read together.
 */
export async function repoWithInstallationByGithubId(
  db: Database,
  githubRepoId: bigint,
): Promise<RepoWithInstallation | undefined> {
  const [row] = await db
    .select({ repo: repos, installation: installations })
    .from(repos)
    .innerJoin(installations, eq(repos.installationId, installations.id))
    .where(eq(repos.githubRepoId, githubRepoId))
    .limit(1);
  return row;
}

export async function repoWithInstallationById(
  db: Database,
  repoId: string,
): Promise<RepoWithInstallation | undefined> {
  const [row] = await db
    .select({ repo: repos, installation: installations })
    .from(repos)
    .innerJoin(installations, eq(repos.installationId, installations.id))
    .where(eq(repos.id, repoId))
    .limit(1);
  return row;
}
