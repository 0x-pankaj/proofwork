"use server";

import { api } from "@/lib/api";

/**
 * Getting an escrow back.
 *
 * Both calls run on the server so the internal API key never reaches the browser. The
 * transaction itself is not sent here — the funder signs it in their own wallet, exactly
 * as they signed the funding, and the API only ever reads the receipt back off Arc.
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

export async function confirmReclaim(bountyId: string, txHash: string): Promise<ReclaimResult> {
  return api<ReclaimResult>(`/v1/bounties/${bountyId}/reclaim`, {
    method: "POST",
    body: { txHash },
  });
}
