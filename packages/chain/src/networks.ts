import { defineChain } from "viem";
import { arcTestnet } from "viem/chains";
import { type ChainEnv, chainEnv } from "./env";

export type ArcNetwork = "testnet" | "mainnet";

export const ARC_NETWORKS = ["testnet", "mainnet"] as const;

/** Arc testnet, as shipped by viem. Chain id 5042002. */
export { arcTestnet };

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_TESTNET_WS_URL = "wss://rpc.testnet.arc.network";
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
/** Blockscout-compatible API, used for contract verification and as a fallback indexer. */
export const ARC_TESTNET_EXPLORER_API_URL = "https://testnet.arcscan.app/api";

/** CCTP / Gateway domain for Arc (both networks). */
export const ARC_CCTP_DOMAIN = 26;
/** Blockchain id used by the Circle Wallets and Contracts APIs. */
export const CIRCLE_BLOCKCHAIN_TESTNET = "ARC-TESTNET";
/** Chain id used by Circle App Kit. */
export const APP_KIT_CHAIN_TESTNET = "Arc_Testnet";
/** Chain key used by the Circle x402 / Gateway client. */
export const X402_CHAIN_TESTNET = "arcTestnet";
/** CAIP-2 network id used in x402 payment payloads. */
export const X402_NETWORK_TESTNET = "eip155:5042002";

/**
 * USDC on Arc is one balance behind two interfaces: the native view used for gas and
 * `msg.value` (18 decimals) and the ERC-20 view used for everything else (6 decimals).
 * Every amount in this codebase is a 6-decimal bigint. Never sum the two views.
 */
export const USDC_DECIMALS = 6;
export const NATIVE_USDC_DECIMALS = 18;

/** Recommended priority fee for faster inclusion on Arc (1 gwei). */
export const ARC_PRIORITY_FEE_WEI = 1_000_000_000n;

/**
 * Arc mainnet. Parameters are published on launch day (16 Sept 2026) and supplied by
 * environment, so nothing here needs a code change to point at mainnet.
 */
export function defineArcMainnet(env: ChainEnv = chainEnv()) {
  const chainId = Number(env.ARC_MAINNET_CHAIN_ID ?? Number.NaN);
  const rpcUrl = env.ARC_MAINNET_RPC_URL ?? "";
  if (!Number.isInteger(chainId) || chainId <= 0 || rpcUrl.length === 0) {
    throw new Error(
      "Arc mainnet is not configured. Set ARC_MAINNET_CHAIN_ID and ARC_MAINNET_RPC_URL " +
        "(see the mainnet runbook) before running with ARC_NETWORK=mainnet.",
    );
  }
  return defineChain({
    id: chainId,
    name: "Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_USDC_DECIMALS },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: {
      default: { name: "ArcScan", url: env.ARC_MAINNET_EXPLORER_URL ?? "https://arcscan.app" },
    },
  });
}

/** The network this process is configured for. Defaults to testnet. */
export function activeNetwork(env: ChainEnv = chainEnv()): ArcNetwork {
  const value = env.ARC_NETWORK ?? "testnet";
  if (value !== "testnet" && value !== "mainnet") {
    throw new Error(`ARC_NETWORK must be "testnet" or "mainnet", got "${value}"`);
  }
  return value;
}

/** The viem chain for a given network. */
export function chainFor(network: ArcNetwork, env: ChainEnv = chainEnv()) {
  return network === "testnet" ? arcTestnet : defineArcMainnet(env);
}

/** The viem chain this process is configured for. */
export function activeChain(env: ChainEnv = chainEnv()) {
  return chainFor(activeNetwork(env), env);
}

/** The RPC URL for a given network, overridable by environment. */
export function rpcUrlFor(network: ArcNetwork, env: ChainEnv = chainEnv()): string {
  if (network === "testnet") return env.ARC_TESTNET_RPC_URL ?? ARC_TESTNET_RPC_URL;
  const url = env.ARC_MAINNET_RPC_URL;
  if (!url) throw new Error("ARC_MAINNET_RPC_URL is not set");
  return url;
}

/** Base explorer URL for a given network. */
export function explorerUrlFor(network: ArcNetwork, env: ChainEnv = chainEnv()): string {
  return network === "testnet"
    ? ARC_TESTNET_EXPLORER_URL
    : (env.ARC_MAINNET_EXPLORER_URL ?? "https://arcscan.app");
}

/** Explorer link for a transaction hash, for comments, the UI and the demo. */
export function txUrl(hash: string, env: ChainEnv = chainEnv()): string {
  return `${explorerUrlFor(activeNetwork(env), env)}/tx/${hash}`;
}

/** Explorer link for an address. */
export function addressUrl(address: string, env: ChainEnv = chainEnv()): string {
  return `${explorerUrlFor(activeNetwork(env), env)}/address/${address}`;
}
