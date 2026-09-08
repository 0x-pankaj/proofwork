import { activeNetwork, usdcAddress } from "@proofwork/chain";
import { type CircleWallets, succeeded } from "@proofwork/circle";
import type { Claim } from "@proofwork/db";
import { type Env, required } from "./env";
import type { Store } from "./store";

/**
 * What happens to the dollar an agent put up to hold a claim.
 *
 * The stake exists so that holding an issue costs something — otherwise an agent can claim
 * every bounty on the board and deliver none. It is collected over x402 into the treasury,
 * which means giving it back is a transfer we have to make: nothing on chain does it for us,
 * and a `stakeStatus` of `refunded` with no transfer behind it is just a lie in a column.
 */

export type StakeOutcome = "refunded" | "forwarded_to_maintainer";

/**
 * Who ends up with the stake.
 *
 * Losing a race is not abuse — someone else merged first, and that is the system working —
 * so a lost claim is refunded like a won one. Only a claim that ran out of time forfeits:
 * it held the issue and delivered nothing, and the maintainer is the one who waited.
 */
export function stakeOutcome(
  claimStatus: Claim["status"],
  hasMaintainerAddress: boolean,
): StakeOutcome {
  if (claimStatus === "expired" && hasMaintainerAddress) return "forwarded_to_maintainer";
  return "refunded";
}

export interface StakeDeps {
  store: Store;
  wallets: CircleWallets;
  env: Env;
}

export interface StakeResolution {
  claimId: string;
  outcome: StakeOutcome;
  amountUsdc: bigint;
  destination: string;
  txHash: string | null;
}

/**
 * Settles every held stake on a bounty.
 *
 * Best effort, one claim at a time: the escrow has already paid out by the time this runs,
 * and a treasury hiccup must not turn a completed settlement into a failed one. A stake that
 * cannot be moved stays `held`, which is the honest state and leaves it retryable.
 */
export async function resolveStakes(
  deps: StakeDeps,
  bountyId: string,
  maintainerAddress: string | null,
): Promise<StakeResolution[]> {
  const resolutions: StakeResolution[] = [];

  for (const claim of await deps.store.claimsFor(bountyId)) {
    if (claim.stakeStatus !== "held" || !claim.stakePaymentId) continue;

    const payment = await deps.store.x402PaymentById(claim.stakePaymentId);
    if (!payment) continue;

    const outcome = stakeOutcome(claim.status, Boolean(maintainerAddress));
    // A forfeited stake goes to the maintainer; anything else goes back where it came from.
    const destination =
      outcome === "forwarded_to_maintainer" ? (maintainerAddress as string) : payment.payer;

    let txHash: string | null = null;
    try {
      txHash = await send(deps, {
        destination,
        amountUsdc: payment.amountUsdc,
        idempotencyKey: await stakeKey(claim.id),
      });
      await deps.store.recordStakeResolution(claim.id, outcome, txHash);
      console.log("stake", { bountyId, claimId: claim.id, outcome, txHash });
    } catch (error) {
      console.error("stake resolution failed", {
        bountyId,
        claimId: claim.id,
        error: String(error),
      });
      continue;
    }

    resolutions.push({
      claimId: claim.id,
      outcome,
      amountUsdc: payment.amountUsdc,
      destination,
      txHash,
    });
  }

  return resolutions;
}

async function send(
  deps: StakeDeps,
  input: { destination: string; amountUsdc: bigint; idempotencyKey: string },
): Promise<string | null> {
  const { id } = await deps.wallets.transfer({
    walletId: required(deps.env, "CIRCLE_TREASURY_WALLET_ID"),
    tokenAddress: usdcAddress(activeNetwork(deps.env), deps.env),
    destinationAddress: input.destination,
    amountUsdc: input.amountUsdc,
    idempotencyKey: input.idempotencyKey,
  });

  const transaction = await deps.wallets.waitForTransaction(id, { timeoutMs: 30_000 });
  if (!succeeded(transaction)) {
    throw new Error(`stake transfer ended ${transaction.state}`);
  }
  return transaction.txHash ?? null;
}

/**
 * A UUID derived from the claim id, so a replayed settlement cannot pay a stake back twice.
 * Same trick as the settlement and feedback keys, keyed on a different string.
 */
export async function stakeKey(claimId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`stake:${claimId}`)),
  );
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
