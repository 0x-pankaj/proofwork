"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/auth";
import { api } from "@/lib/api";
import type { RepoPolicy } from "@/lib/types";

/** A maintainer's terms, and the accept queue. Both are permission-checked by the API. */

export async function savePolicy(
  repoId: string,
  input: Partial<RepoPolicy> & { maintainerPayoutAddress?: string | null },
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub first.");

  await api(`/v1/repos/${repoId}/policy`, {
    method: "PUT",
    body: input,
    actingUserId: user.id,
  });
  revalidatePath(`/repos/${repoId}/settings`);
}

export async function acceptBounty(repoId: string, bountyId: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub first.");

  await api(`/v1/repos/${repoId}/bounties/${bountyId}/accept`, {
    method: "POST",
    actingUserId: user.id,
  });
  revalidatePath(`/repos/${repoId}/settings`);
}
