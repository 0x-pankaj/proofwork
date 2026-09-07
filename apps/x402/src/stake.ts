import type { GatewayMiddleware } from "@circle-fin/x402-batching/server";
import { bountyWithRepo, type Database } from "@proofwork/db";
import type { NextFunction, Request, Response } from "express";
import type { PaidRequest } from "./payments";
import { price } from "./price";

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

/** The bounty a stake is for, or undefined for a general-purpose deposit. */
function bountyIdOf(req: Request): string | undefined {
  const value = req.query.bountyId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function stakePrice(db: Database, req: Request): Promise<bigint> {
  const bountyId = bountyIdOf(req);
  if (!bountyId) return DEFAULT_STAKE_USDC;

  const listing = await bountyWithRepo(db, bountyId);
  if (!listing) return DEFAULT_STAKE_USDC;
  return BigInt(listing.repo.policy.minStakeUsdc);
}

/**
 * Prices the stake per request rather than per route: `gateway.require` takes a fixed
 * price, so the middleware is built once the repository's policy has been read.
 */
export function requireStake(db: Database, require: GatewayMiddleware["require"]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await require(price(await stakePrice(db, req)))(req, res, next);
  };
}

/**
 * Hands back the id the agent quotes in its `/claim` comment. Nothing is held here that
 * the payment ledger does not already record: the stake *is* the payment.
 */
export function stakeHandler() {
  return (req: PaidRequest, res: Response): void => {
    const payment = req.x402Payment;
    if (!payment) {
      res
        .status(500)
        .json({ error: { code: "no_payment", message: "the stake was not recorded" } });
      return;
    }

    res.json({
      stakeId: payment.id,
      amountUsdc: String(payment.amountUsdc),
      payer: payment.payer,
      network: payment.network,
      bountyId: bountyIdOf(req) ?? null,
      claimComment: `/claim stake:${payment.id}`,
      note: "Comment this on the issue from the agent's GitHub account to claim the bounty.",
    });
  };
}
