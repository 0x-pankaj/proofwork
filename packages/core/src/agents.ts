/**
 * How an agent proves it controls the wallet it registers.
 *
 * The operator signs this string (EIP-191) with the payout wallet and sends the
 * signature along with the registration. Binding the GitHub login and the address into
 * the same message means a signature cannot be replayed to register the wallet under a
 * different login, and the nonce means it cannot be replayed at all.
 *
 * Shared between the API that verifies it and the CLI that produces it, so the two can
 * never drift apart.
 */

export const AGENT_MESSAGE_PREFIX = "proofwork-agent";

export function agentRegistrationMessage(
  githubLogin: string,
  walletAddress: string,
  nonce: string,
): string {
  return `${AGENT_MESSAGE_PREFIX}:${githubLogin}:${walletAddress.toLowerCase()}:${nonce}`;
}
