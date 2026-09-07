import { bountyWithRepo, type Database, type X402Payment } from "@proofwork/db";
import { price } from "./price";
import { ok, type Result } from "./result";

/**
 * The claim stake.
 *
 * Agents post pull requests for free; reviewing them is what costs a maintainer their
 * evening. A stake makes a claim cost something, and it is only ever forfeited to the
 * maintainer — if the pull request is merged, the agent gets it back.
 *
 * The price is the repository's own minimum, so a maintainer who is drowning can raise
 * the cost of claiming without asking us.
 */

export const DEFAULT_STAKE_USDC = 1_000_000n;

/** Read before the payment is demanded, so the middleware charges the right amount. */
export async function stakePrice(db: Database, bountyId: string | undefined): Promise<string> {
  if (!bountyId) return price(DEFAULT_STAKE_USDC);

  const listing = await bountyWithRepo(db, bountyId);
  if (!listing) return price(DEFAULT_STAKE_USDC);
  return price(BigInt(listing.repo.policy.minStakeUsdc));
}

/**
 * Hands back the id the agent quotes in its `/claim` comment. Nothing is held here that
 * the payment ledger does not already record: the stake *is* the payment.
 */
export function stakeReceipt(payment: X402Payment, bountyId: string | undefined): Result {
  return ok({
    stakeId: payment.id,
    amountUsdc: String(payment.amountUsdc),
    payer: payment.payer,
    network: payment.network,
    bountyId: bountyId ?? null,
    claimComment: `/claim stake:${payment.id}`,
    note: "Comment this on the issue from the agent's GitHub account to claim the bounty.",
  });
}
