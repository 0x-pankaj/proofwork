import {
  activeNetwork,
  proofworkJobsAbi,
  proofworkJobsAddress,
  publicClient,
  usdcAddress,
} from "@proofwork/chain";
import { encodeFunctionData, erc20Abi, type Hex, parseEventLogs } from "viem";
import type { Env } from "./env";

/**
 * The funding half of a bounty: what the funder has to sign, and how we prove afterwards
 * that they actually did.
 *
 * The API never holds a funder's key. It hands back calldata the browser sends from the
 * funder's own wallet, then reads the receipt back off Arc. Nothing is trusted from the
 * client except the transaction hash, and even that is only a pointer to a chain we read.
 */

export interface Call {
  to: string;
  data: Hex;
}

export interface FundingCalls {
  /** Approve the escrow to pull budget plus fee. */
  approve: Call;
  /** Create the job and fund it in one transaction. */
  createAndFund: Call;
}

export interface FundingInput {
  amountUsdc: bigint;
  feeUsdc: bigint;
  evaluator: string;
  expiresAt: Date;
  description: string;
  maintainer: string | null;
  maintainerRewardBps: number;
}

export function fundingCalls(env: Env, input: FundingInput): FundingCalls {
  const network = activeNetwork(env);
  const contract = proofworkJobsAddress(network, env);
  const total = input.amountUsdc + input.feeUsdc;

  return {
    approve: {
      to: usdcAddress(network, env),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [contract as Hex, total],
      }),
    },
    createAndFund: {
      to: contract,
      data: encodeFunctionData({
        abi: proofworkJobsAbi,
        functionName: "createAndFund",
        args: [
          input.evaluator as Hex,
          BigInt(Math.floor(input.expiresAt.getTime() / 1000)),
          input.description,
          input.amountUsdc,
          (input.maintainer ?? "0x0000000000000000000000000000000000000000") as Hex,
          input.maintainerRewardBps,
        ],
      }),
    },
  };
}

/** The protocol fee, read from the contract rather than assumed. */
export async function readFeeBps(env: Env): Promise<number> {
  const network = activeNetwork(env);
  const feeBps = await publicClient(env).readContract({
    address: proofworkJobsAddress(network, env) as Hex,
    abi: proofworkJobsAbi,
    functionName: "feeBps",
  });
  return Number(feeBps);
}

export interface ConfirmedFunding {
  jobId: bigint;
  client: string;
  amountUsdc: bigint;
}

/**
 * Reads a funding transaction back off chain.
 *
 * A funder tells us "I sent it"; this is where that claim is checked. The receipt has to
 * have succeeded, and it has to contain our contract's own `JobCreated` and `JobFunded`
 * events, or the bounty stays unfunded no matter what the caller says.
 */
export async function confirmFunding(env: Env, txHash: string): Promise<ConfirmedFunding> {
  const network = activeNetwork(env);
  const contract = proofworkJobsAddress(network, env).toLowerCase();
  const receipt = await publicClient(env).waitForTransactionReceipt({ hash: txHash as Hex });

  if (receipt.status !== "success") {
    throw new Error(`funding transaction ${txHash} reverted`);
  }

  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === contract);
  const created = parseEventLogs({ abi: proofworkJobsAbi, eventName: "JobCreated", logs })[0];
  const funded = parseEventLogs({ abi: proofworkJobsAbi, eventName: "JobFunded", logs })[0];

  if (!created || !funded) {
    throw new Error(`transaction ${txHash} did not create and fund a job on ${contract}`);
  }

  return {
    jobId: created.args.jobId,
    client: funded.args.client,
    amountUsdc: funded.args.amount,
  };
}

// --- unwinding ---------------------------------------------------------------------

/** The two ways an escrow comes back, both of them on the contract. */
export type ReclaimKind = "cancel" | "claimRefund";

export type ReclaimPlan =
  | { reclaimable: true; kind: ReclaimKind; reason: string }
  | { reclaimable: false; reason: string };

/** Statuses where the money is on chain and has not been paid out or returned. */
const HOLDS_ESCROW: ReadonlyArray<string> = [
  "pending_accept",
  "open",
  "claimed",
  "submitted",
  "expired",
];

export interface ReclaimInput {
  status: string;
  jobId: bigint | null;
  expiresAt: Date;
  activeClaims: number;
  now: Date;
}

/**
 * Which way an escrow comes back, if it can.
 *
 * The two calls are not interchangeable. `claimRefund` is permissionless once the deadline
 * passes, so a funder never needs our goodwill to be made whole. `cancel` is the funder's
 * own and only before anyone starts.
 *
 * The contract means to refuse `cancel` once a provider is assigned — but Proofwork assigns
 * the provider inside `settle`, so on chain that guard never fires before payout. The claim
 * list is checked here instead, so a funder cannot pull the escrow out from under someone
 * who is already working.
 */
export function reclaimPlan(input: ReclaimInput): ReclaimPlan {
  if (input.jobId === null) {
    return { reclaimable: false, reason: "nothing is escrowed against this bounty yet" };
  }
  if (!HOLDS_ESCROW.includes(input.status)) {
    return { reclaimable: false, reason: `a ${input.status} bounty no longer holds escrow` };
  }
  if (input.expiresAt.getTime() <= input.now.getTime()) {
    return {
      reclaimable: true,
      kind: "claimRefund",
      reason: "the deadline has passed, so anyone can return the escrow to the funder",
    };
  }
  if (input.activeClaims > 0) {
    return {
      reclaimable: false,
      reason:
        "someone is working on it — the escrow unlocks when they deliver or the deadline passes",
    };
  }
  return { reclaimable: true, kind: "cancel", reason: "nobody has claimed it yet" };
}

/** The call that returns the escrow. Sent from the funder's own wallet, like funding was. */
export function reclaimCall(env: Env, jobId: bigint, kind: ReclaimKind): Call {
  return {
    to: proofworkJobsAddress(activeNetwork(env), env),
    data: encodeFunctionData({ abi: proofworkJobsAbi, functionName: kind, args: [jobId] }),
  };
}

export interface ConfirmedRefund {
  jobId: bigint;
  client: string;
  amountUsdc: bigint;
}

/**
 * Reads a refund back off chain.
 *
 * Same rule as funding: the caller's word is only a pointer. The receipt has to have
 * succeeded and to carry our contract's own `Refunded` event, or nothing is written down.
 */
export async function confirmRefund(env: Env, txHash: string): Promise<ConfirmedRefund> {
  const network = activeNetwork(env);
  const contract = proofworkJobsAddress(network, env).toLowerCase();
  const receipt = await publicClient(env).waitForTransactionReceipt({ hash: txHash as Hex });

  if (receipt.status !== "success") {
    throw new Error(`refund transaction ${txHash} reverted`);
  }

  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === contract);
  const refunded = parseEventLogs({ abi: proofworkJobsAbi, eventName: "Refunded", logs })[0];

  if (!refunded) {
    throw new Error(`transaction ${txHash} did not refund a job on ${contract}`);
  }

  return {
    jobId: refunded.args.jobId,
    client: refunded.args.client,
    amountUsdc: refunded.args.amount,
  };
}
