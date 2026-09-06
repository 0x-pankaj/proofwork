// Generated from packages/contracts by "bun run contracts:export". Do not edit.

export interface Deployment {
  ProofworkJobs: string;
  paymentToken: string;
  treasury: string;
  owner: string;
  deployer: string;
  chainId: number;
  feeBps: number;
  block: number;
}

/** Deployment records, keyed by chain id, written by the deploy script. */
export const DEPLOYMENTS: Record<string, Deployment> = {};

/** The deployment for a chain, if this contract has been deployed there yet. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[String(chainId)];
}
