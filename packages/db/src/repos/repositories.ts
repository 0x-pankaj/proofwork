import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type Installation, installations, type Repo, type RepoPolicy, repos } from "../schema";

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

/** The same lookup by `owner/name`, which is how an agent names a repository. */
export async function repoWithInstallationByFullName(
  db: Database,
  fullName: string,
): Promise<RepoWithInstallation | undefined> {
  const [row] = await db
    .select({ repo: repos, installation: installations })
    .from(repos)
    .innerJoin(installations, eq(repos.installationId, installations.id))
    .where(eq(repos.fullName, fullName))
    .limit(1);
  return row;
}

/**
 * The repositories a signed-in user may act on: the ones installed under their own
 * account, plus any where they are recorded as the maintainer. Private repository names
 * are not something to hand out, so this is a filter rather than a full listing.
 */
export async function reposForUser(
  db: Database,
  userId: string,
  login: string,
): Promise<RepoWithInstallation[]> {
  return db
    .select({ repo: repos, installation: installations })
    .from(repos)
    .innerJoin(installations, eq(repos.installationId, installations.id))
    .where(
      and(
        eq(repos.installed, true),
        or(eq(installations.accountLogin, login), eq(repos.maintainerUserId, userId)),
      ),
    );
}

export interface RepoSettings {
  policy?: RepoPolicy;
  maintainerPayoutAddress?: string | null;
  maintainerUserId?: string | null;
}

/** A maintainer's terms. Who is allowed to call this is decided at the route. */
export async function setRepoSettings(
  db: Database,
  repoId: string,
  settings: RepoSettings,
): Promise<Repo | undefined> {
  const [row] = await db
    .update(repos)
    .set({
      ...(settings.policy ? { policy: settings.policy } : {}),
      ...(settings.maintainerPayoutAddress !== undefined
        ? { maintainerPayoutAddress: settings.maintainerPayoutAddress }
        : {}),
      ...(settings.maintainerUserId !== undefined
        ? { maintainerUserId: settings.maintainerUserId }
        : {}),
    })
    .where(eq(repos.id, repoId))
    .returning();
  return row;
}
