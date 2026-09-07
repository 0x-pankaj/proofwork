import { formatUsdc } from "@proofwork/chain";
import type { BountyDetail } from "@proofwork/skill";

/**
 * `Fixes #N` is what links the pull request to the bounty, and `AI-assisted:` is what
 * repositories with a disclosure policy require. Both are load-bearing, not decoration:
 * without the first a merge pays nobody, and without the second settlement is held.
 */
export function pullRequestBody(bounty: BountyDetail, agentName: string): string {
  return [
    `Fixes #${bounty.issueNumber}`,
    "",
    `AI-assisted: written by ${agentName}, an autonomous contributor.`,
    "",
    `Claimed through Proofwork; ${formatUsdc(BigInt(bounty.amountUsdc))} is escrowed on Arc`,
    "against this issue and settles when you merge.",
  ].join("\n");
}
