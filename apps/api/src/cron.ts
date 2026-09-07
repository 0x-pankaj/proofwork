import {
  activeNetwork,
  chainIdFor,
  deploymentFor,
  proofworkJobsAbi,
  proofworkJobsAddress,
  publicClient,
} from "@proofwork/chain";
import type { Hex } from "viem";
import { parseEventLogs } from "viem";
import type { Env } from "./env";
import type { Store } from "./store";

/**
 * The two scheduled jobs.
 *
 * Webhooks and transaction receipts already keep the database current; these exist for
 * when they do not. A missed delivery, a Worker that died mid-handler, or someone calling
 * the escrow contract directly all end the same way: the chain says one thing and we say
 * another. The reconciler makes the chain win.
 */

/** The hourly sweep; anything else on the schedule is the chain reconciler. */
export const HOURLY_SWEEP = "0 * * * *";

/** Arc produces blocks quickly, so a minute of catching up is a small window. */
export const MAX_BLOCK_SPAN = 2_000n;

export interface CronDeps {
  store: Store;
  env: Env;
}

export interface ReconcileResult {
  fromBlock: string;
  toBlock: string;
  applied: number;
}

export async function reconcileChain(deps: CronDeps): Promise<ReconcileResult> {
  const { env, store } = deps;
  const network = activeNetwork(env);
  const chainId = chainIdFor(network, env);
  const address = proofworkJobsAddress(network, env) as Hex;
  const client = publicClient(env);

  const head = await client.getBlockNumber();
  const cursor = await store.readChainCursor(chainId);
  const start = cursor ?? BigInt(deploymentFor(chainId)?.block ?? Number(head));
  const fromBlock = start + 1n;
  const toBlock = fromBlock + MAX_BLOCK_SPAN < head ? fromBlock + MAX_BLOCK_SPAN : head;

  if (fromBlock > toBlock) {
    return { fromBlock: String(fromBlock), toBlock: String(head), applied: 0 };
  }

  const logs = await client.getLogs({ address, fromBlock, toBlock });
  const events = parseEventLogs({ abi: proofworkJobsAbi, logs });

  let applied = 0;
  for (const event of events) {
    if (await apply(deps, event)) applied += 1;
  }

  await store.writeChainCursor(chainId, toBlock);
  return { fromBlock: String(fromBlock), toBlock: String(toBlock), applied };
}

type JobEvent = ReturnType<typeof parseEventLogs<typeof proofworkJobsAbi>>[number];

/** Applies one on-chain event to the bounty it belongs to. */
async function apply(deps: CronDeps, event: JobEvent): Promise<boolean> {
  const jobId = (event.args as { jobId?: bigint }).jobId;
  if (jobId === undefined) return false;

  const bounty = await deps.store.bountyByJobId(jobId);
  if (!bounty) return false;

  switch (event.eventName) {
    case "JobCompleted":
      return deps.store.forceBountyStatus(bounty.id, "settled", {
        settleTxHash: event.transactionHash,
      });
    case "JobExpired":
      return deps.store.forceBountyStatus(bounty.id, "expired");
    case "JobCancelled":
      return deps.store.forceBountyStatus(bounty.id, "cancelled");
    case "JobFunded":
      // Funding is normally confirmed by the funder's own receipt; this catches the case
      // where the browser closed before it could tell us.
      return bounty.status === "draft" || bounty.status === "funding"
        ? deps.store.forceBountyStatus(bounty.id, "open", { jobId })
        : false;
    default:
      return false;
  }
}

export interface SweepResult {
  bounties: number;
  claims: number;
}

/**
 * Releases what has run out of time: bounties past their deadline, and claims held
 * without a pull request for longer than the repository allows.
 */
export async function sweepExpiries(deps: CronDeps): Promise<SweepResult> {
  const now = new Date();
  const expired = await deps.store.expireBounties(now);

  const stale: string[] = [];
  for (const { claim, repo } of await deps.store.activeClaimsWithPolicy()) {
    const deadline = claim.createdAt.getTime() + repo.policy.claimTtlHours * 3_600_000;
    if (deadline < now.getTime()) stale.push(claim.id);
  }

  return { bounties: expired.length, claims: await deps.store.expireClaims(stale) };
}
