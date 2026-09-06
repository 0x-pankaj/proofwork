import type { Address } from "viem";
import { deploymentFor } from "./deployments";
import { type ChainEnv, chainEnv } from "./env";
import { type ArcNetwork, activeNetwork, chainIdFor } from "./networks";

/**
 * Every address the product touches. Nothing outside this package may hardcode one.
 *
 * Testnet values are from the Arc docs and the Circle skills reference (verified 3 Sept 2026).
 * Mainnet values are published on launch day and injected through the environment.
 */
export const ADDRESSES = {
  testnet: {
    /** ERC-20 view of native USDC, 6 decimals. The native 18-decimal view is gas only. */
    USDC: "0x3600000000000000000000000000000000000000",
    EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
    PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    CREATE2_FACTORY: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
    GATEWAY_WALLET: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GATEWAY_MINTER: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    ERC8004_IDENTITY: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    ERC8004_REPUTATION: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    ERC8004_VALIDATION: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
    /** Arc's AgenticCommerce ERC-8183 sample. Read-only reference, we deploy our own. */
    ERC8183_REFERENCE: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  },
  mainnet: {
    USDC: "0x3600000000000000000000000000000000000000",
  },
} as const satisfies Record<ArcNetwork, Record<string, string>>;

export type TestnetContract = keyof (typeof ADDRESSES)["testnet"];

/**
 * The address map for a network, keeping the literal type so that testnet-only
 * addresses are a compile error on mainnet until Arc publishes them.
 */
export function addressesFor<N extends ArcNetwork>(network: N): (typeof ADDRESSES)[N] {
  return ADDRESSES[network];
}

/** USDC (6-decimal ERC-20 view) for a network. Mainnet may override via environment. */
export function usdcAddress(
  network: ArcNetwork = activeNetwork(),
  env: ChainEnv = chainEnv(),
): Address {
  if (network === "mainnet" && env.ARC_MAINNET_USDC_ADDRESS) {
    return env.ARC_MAINNET_USDC_ADDRESS as Address;
  }
  return ADDRESSES[network].USDC as Address;
}

/**
 * The deployed ProofworkJobs escrow.
 *
 * An environment variable wins, so a service can be pointed at a fresh deployment without
 * a release. Otherwise the address comes from the deployment record the deploy script
 * committed, which is why a checked-out repo works with no configuration at all.
 */
export function proofworkJobsAddress(
  network: ArcNetwork = activeNetwork(),
  env: ChainEnv = chainEnv(),
): Address {
  const fromEnv =
    network === "testnet" ? env.PROOFWORK_JOBS_ADDRESS_TESTNET : env.PROOFWORK_JOBS_ADDRESS_MAINNET;
  if (fromEnv) return fromEnv as Address;

  const deployed = deploymentFor(chainIdFor(network, env))?.ProofworkJobs;
  if (deployed) return deployed as Address;

  throw new Error(
    `ProofworkJobs is not deployed on ${network}. Deploy it, or set PROOFWORK_JOBS_ADDRESS_${network.toUpperCase()}.`,
  );
}
