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
export const DEPLOYMENTS: Record<string, Deployment> = {
  "5042002": {
    "ProofworkJobs": "0x3Bc728A813a7aBe0cB898fd63967525e92353D85",
    "block": 60866656,
    "chainId": 5042002,
    "deployer": "0xb57af3feBa9D6759CE38452247e066981DddEbb3",
    "feeBps": 300,
    "owner": "0xb57af3feBa9D6759CE38452247e066981DddEbb3",
    "paymentToken": "0x3600000000000000000000000000000000000000",
    "treasury": "0x3975261337566C22A5129EB82BdCC8c364C4a313"
  }
};

/** The deployment for a chain, if this contract has been deployed there yet. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[String(chainId)];
}
