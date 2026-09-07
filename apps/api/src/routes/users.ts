import { zValidator } from "@hono/zod-validator";
import { bpsOf, txUrl } from "@proofwork/chain";
import { Hono } from "hono";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";
import { internalKeyOnly, internalOnly } from "../auth";
import type { Env } from "../env";
import { fail } from "../http";
import type { BountyVariables } from "./bounties";

/**
 * Who someone is, and where they get paid.
 *
 * A payout address is only accepted with a signature over a message naming the user, so
 * pasting someone else's address does nothing: the money follows a key its owner proved
 * they hold.
 */

export const PAYOUT_MESSAGE_PREFIX = "proofwork-payout";

export function payoutMessage(userId: string, nonce: string): string {
  return `${PAYOUT_MESSAGE_PREFIX}:${userId}:${nonce}`;
}

const signInSchema = z.object({
  githubId: z.string().regex(/^\d+$/),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});

const payoutSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().min(8),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const userRoutes = new Hono<{ Bindings: Env; Variables: BountyVariables }>();

/** Called by the web app when someone signs in with GitHub. */
userRoutes.post("/", internalKeyOnly, zValidator("json", signInSchema), async (c) => {
  const input = c.req.valid("json");
  const user = await c
    .get("store")()
    .upsertUser({
      githubId: BigInt(input.githubId),
      login: input.login,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
    });

  return c.json({
    id: user.id,
    login: user.login,
    payoutAddress: user.payoutAddress,
  });
});

userRoutes.get("/me", internalOnly, async (c) => {
  const user = await c.get("store")().userById(c.get("actingUserId"));
  if (!user) return fail(c, 404, "not_found", "no such user");

  return c.json({
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    payoutAddress: user.payoutAddress,
    payoutKind: user.payoutKind,
  });
});

/** Proves control of an address before we agree to send USDC to it. */
userRoutes.post("/me/payout", internalOnly, zValidator("json", payoutSchema), async (c) => {
  const { address, nonce, signature } = c.req.valid("json");
  const userId = c.get("actingUserId");

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: payoutMessage(userId, nonce),
    signature: signature as `0x${string}`,
  });
  if (!valid) {
    return fail(c, 400, "bad_signature", "that signature does not match the address");
  }

  const checksummed = getAddress(address);
  await c.get("store")().setPayoutAddress(userId, checksummed);
  return c.json({ payoutAddress: checksummed });
});

userRoutes.get("/me/bounties", internalOnly, async (c) => {
  const listings = await c.get("store")().bountiesForFunder(c.get("actingUserId"));
  return c.json({
    bounties: listings.map(({ bounty, repo }) => ({
      id: bounty.id,
      repo: repo.fullName,
      issueNumber: bounty.issueNumber,
      issueTitle: bounty.issueTitle,
      status: bounty.status,
      amountUsdc: String(bounty.amountUsdc),
      createdAt: bounty.createdAt,
    })),
  });
});

userRoutes.get("/me/claims", internalOnly, async (c) => {
  const listings = await c.get("store")().claimsForUser(c.get("actingUserId"));
  return c.json({
    claims: listings.map(({ claim, bounty, repo }) => ({
      id: claim.id,
      status: claim.status,
      claimedAt: claim.createdAt,
      bountyId: bounty.id,
      repo: repo.fullName,
      issueNumber: bounty.issueNumber,
      issueTitle: bounty.issueTitle,
      amountUsdc: String(bounty.amountUsdc),
      bountyStatus: bounty.status,
    })),
  });
});

userRoutes.get("/me/settlements", internalOnly, async (c) => {
  const listings = await c.get("store")().settlementsForUser(c.get("actingUserId"));
  return c.json({
    settlements: listings.map(({ settlement, bounty, repo }) => ({
      id: settlement.id,
      status: settlement.status,
      /** The whole budget, of which the reviewing maintainer takes a share. */
      amountUsdc: String(settlement.amountUsdc),
      /** What actually landed at this person's payout address. */
      receivedUsdc: String(
        settlement.amountUsdc - bpsOf(settlement.amountUsdc, bounty.maintainerRewardBps),
      ),
      repo: repo.fullName,
      issueNumber: bounty.issueNumber,
      txUrl: settlement.txHash ? txUrl(settlement.txHash, c.env) : null,
      completedAt: settlement.completedAt,
    })),
  });
});
