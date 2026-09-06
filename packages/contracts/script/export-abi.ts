#!/usr/bin/env bun
/**
 * Turns Foundry build output into typed TypeScript for the rest of the monorepo.
 *
 * Run after `forge build`. The generated files are committed so that nothing outside
 * packages/contracts needs Foundry installed to build.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const contractsDir = new URL("..", import.meta.url).pathname;
const abisDir = join(contractsDir, "..", "chain", "src", "abis");

function artifactAbi(contract: string): unknown[] {
  const path = join(contractsDir, "out", `${contract}.sol`, `${contract}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing build artifact for ${contract}. Run "forge build" first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")).abi as unknown[];
}

function writeAbi(contract: string, fileName: string, constName: string): void {
  const abi = artifactAbi(contract);
  const body = `// Generated from packages/contracts by "bun run contracts:export". Do not edit.

export const ${constName} = ${JSON.stringify(abi, null, 2)} as const;
`;
  writeFileSync(join(abisDir, fileName), body);
  console.log(`abis/${fileName}  (${abi.length} entries)`);
}

/** Collects every `deployments/<chainId>.json` into one typed record. */
function writeDeployments(): void {
  const dir = join(contractsDir, "deployments");
  const entries: Record<string, unknown> = {};
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
      const chainId = file.replace(".json", "");
      if (chainId === "31337") continue;
      entries[chainId] = JSON.parse(readFileSync(join(dir, file), "utf8"));
    }
  }
  const body = `// Generated from packages/contracts by "bun run contracts:export". Do not edit.

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
export const DEPLOYMENTS: Record<string, Deployment> = ${JSON.stringify(entries, null, 2)};

/** The deployment for a chain, if this contract has been deployed there yet. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[String(chainId)];
}
`;
  writeFileSync(join(abisDir, "..", "deployments.ts"), body);
  console.log(`deployments.ts  (${Object.keys(entries).length} networks)`);
}

writeAbi("ProofworkJobs", "proofworkJobs.ts", "proofworkJobsAbi");
writeDeployments();
