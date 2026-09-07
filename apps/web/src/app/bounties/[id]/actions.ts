"use server";

import { currentUser } from "@/auth";
import { api } from "@/lib/api";

/**
 * Getting an escrow back.
 *
 * The transaction is not sent here — the funder signs it in their own wallet, exactly as
 * they signed the funding, and the API only ever reads the receipt back off Arc.
 */

export interface ReclaimCall {
  to: string;
  data: `0x${string}`;
}

export type ReclaimQuote =
  | { reclaimable: false; reason: string }
  | {
      reclaimable: true;
      /** `cancel` is the funder's alone; `claimRefund` is open to anyone once expired. */
      kind: "cancel" | "claimRefund";
      reason: string;
      funderAddress: string;
      amountUsdc: string;
      call: ReclaimCall;
    };

export async function reclaimQuote(bountyId: string): Promise<ReclaimQuote> {
  return api<ReclaimQuote>(`/v1/bounties/${bountyId}/reclaim`);
}

export interface ReclaimResult {
  status: string;
  amountUsdc: string;
  txUrl: string;
}

/**
 * Writes the refund down, if we can.
 *
 * Recording it needs a signed-in account, but *sending* it does not: an expired bounty can
 * be refunded by anyone, and that has to keep working for a visitor who never signed in.
 * When there is no session this returns null and the sweeper picks the refund up from the
 * chain within the minute — the money has already moved either way.
 */
export async function confirmReclaim(
  bountyId: string,
  txHash: string,
): Promise<ReclaimResult | null> {
  const user = await currentUser();
  if (!user) return null;

  return api<ReclaimResult>(`/v1/bounties/${bountyId}/reclaim`, {
    method: "POST",
    actingUserId: user.id,
    body: { txHash },
  });
}
