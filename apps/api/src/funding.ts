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
