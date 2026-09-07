import { keccak256, toBytes } from "viem";

/**
 * The two hashes the escrow records when a bounty settles.
 *
 * Both are stored on chain as `bytes32`, so anyone auditing a payment can recompute them
 * from public GitHub data and confirm the payout matches the work that was actually merged.
 * The version prefix means the scheme can change later without old jobs becoming unverifiable.
 */
export const DELIVERABLE_VERSION = "proofwork/v1";

export interface DeliverableRef {
  /** `owner/repo`, exactly as GitHub spells it. */
  repoFullName: string;
  prNumber: number;
  /** The commit the merge produced. */
  mergeSha: string;
}

/** The canonical string a deliverable hash is taken over. Kept public so it can be checked. */
export function deliverablePreimage({ repoFullName, prNumber, mergeSha }: DeliverableRef): string {
  if (!repoFullName.includes("/")) {
    throw new Error(`repoFullName must be "owner/repo", got "${repoFullName}"`);
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`prNumber must be a positive integer, got ${prNumber}`);
  }
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(mergeSha)) {
    throw new Error(`mergeSha must be a git object id, got "${mergeSha}"`);
  }
  return `${DELIVERABLE_VERSION}:${repoFullName}#${prNumber}@${mergeSha.toLowerCase()}`;
}

/** Identifies the merged pull request a payment was made for. */
export function deliverableHash(ref: DeliverableRef): `0x${string}` {
  return keccak256(toBytes(deliverablePreimage(ref)));
}

/** Records why the escrow released: the merge commit itself. */
export function mergedReasonHash(mergeSha: string): `0x${string}` {
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(mergeSha)) {
    throw new Error(`mergeSha must be a git object id, got "${mergeSha}"`);
  }
  return keccak256(toBytes(`merged:${mergeSha.toLowerCase()}`));
}

/** Records why the escrow refunded instead. */
export function rejectedReasonHash(reason: string): `0x${string}` {
  return keccak256(toBytes(`rejected:${reason}`));
}
