"use server";

import { currentUser } from "@/auth";
import { api } from "@/lib/api";

/**
 * The two server calls the funding flow makes. Both run on the server so the internal API
 * key never reaches the browser, and both take the signed-in user from the session rather
 * than from the request body.
 */

export interface FundingCall {
  to: string;
  data: `0x${string}`;
}

export interface DraftBounty {
  bountyId: string;
  contract: string;
  split: { contributor: string; maintainer: string; fee: string; total: string };
  calldata: { approve: FundingCall; createAndFund: FundingCall };
}

export async function createBounty(input: {
  repoId: string;
  issueNumber: number;
  amountUsdc: string;
  expiresAt: string;
  funderAddress: string;
}): Promise<DraftBounty> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub before funding a bounty.");

  return api<DraftBounty>("/v1/bounties", {
    method: "POST",
    body: input,
    actingUserId: user.id,
  });
}

export async function confirmFunding(
  bountyId: string,
  txHash: string,
): Promise<{ status: string; jobId: string }> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub before funding a bounty.");

  return api<{ status: string; jobId: string }>(`/v1/bounties/${bountyId}/confirm-funding`, {
    method: "POST",
    body: { txHash },
    actingUserId: user.id,
  });
}

export async function listIssues(repoId: string) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub first.");

  const { issues } = await api<{ issues: Array<{ number: number; title: string; url: string }> }>(
    `/v1/repos/${repoId}/issues`,
    { actingUserId: user.id },
  );
  return issues;
}
