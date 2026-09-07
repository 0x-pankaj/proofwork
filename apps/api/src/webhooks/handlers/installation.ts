import type { RepositoryInput } from "@proofwork/db";
import {
  accountTypeOf,
  type InstallationEvent,
  type InstallationRepositoriesEvent,
  type RepositoryPayload,
} from "@proofwork/github";
import type { Store } from "../../store";

/**
 * Keeping our idea of who installed Proofwork, and where, in step with GitHub's.
 *
 * Nothing here deletes: an uninstall marks the installation suspended and its
 * repositories not installed, so a repository that comes back still owns its bounty
 * history rather than starting empty.
 */

function toRepositoryInputs(repositories: RepositoryPayload[]): RepositoryInput[] {
  return repositories.map((repository) => ({
    githubRepoId: BigInt(repository.id),
    fullName: repository.full_name,
    private: repository.private,
  }));
}

/** True for the actions that mean "stop acting on this account's repositories". */
function isInactive(action: string, suspendedAt: string | null | undefined): boolean {
  return action === "deleted" || action === "suspend" || Boolean(suspendedAt);
}

export async function handleInstallation(store: Store, event: InstallationEvent): Promise<void> {
  const inactive = isInactive(event.action, event.installation.suspended_at);

  const installation = await store.upsertInstallation({
    githubInstallationId: BigInt(event.installation.id),
    accountLogin: event.installation.account?.login ?? "unknown",
    accountType: accountTypeOf(event.installation.account?.type),
    suspended: inactive,
  });

  if (inactive) {
    await store.markInstallationReposUninstalled(installation.id);
    return;
  }

  await store.syncRepos(installation.id, toRepositoryInputs(event.repositories ?? []));
}

export async function handleInstallationRepositories(
  store: Store,
  event: InstallationRepositoriesEvent,
): Promise<void> {
  const installation = await store.upsertInstallation({
    githubInstallationId: BigInt(event.installation.id),
    accountLogin: event.installation.account?.login ?? "unknown",
    accountType: accountTypeOf(event.installation.account?.type),
    suspended: Boolean(event.installation.suspended_at),
  });

  await store.syncRepos(installation.id, toRepositoryInputs(event.repositories_added));
  await store.markReposUninstalled(
    event.repositories_removed.map((repository) => BigInt(repository.id)),
  );
}
