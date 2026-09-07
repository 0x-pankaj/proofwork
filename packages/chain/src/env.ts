/**
 * Environment access for chain configuration.
 *
 * Node, Bun and Vitest read `process.env` directly. Cloudflare Workers pass their
 * bindings per request, so the entrypoint calls `setChainEnv(env)` once at startup
 * and every helper below picks it up.
 */
export interface ChainEnv {
  ARC_NETWORK?: string | undefined;
  ARC_TESTNET_RPC_URL?: string | undefined;
  ARC_MAINNET_CHAIN_ID?: string | undefined;
  ARC_MAINNET_RPC_URL?: string | undefined;
  ARC_MAINNET_EXPLORER_URL?: string | undefined;
  ARC_MAINNET_USDC_ADDRESS?: string | undefined;
  PROOFWORK_JOBS_ADDRESS_TESTNET?: string | undefined;
  PROOFWORK_JOBS_ADDRESS_MAINNET?: string | undefined;
  /** Circle's blockchain id for Arc mainnet, published on launch day. */
  CIRCLE_BLOCKCHAIN_MAINNET?: string | undefined;
  /** ERC-8004 registries on Arc mainnet, published on launch day. */
  ARC_MAINNET_ERC8004_IDENTITY?: string | undefined;
  ARC_MAINNET_ERC8004_REPUTATION?: string | undefined;
}

let injected: ChainEnv | undefined;

/** Inject the environment (Cloudflare Workers). Pass `undefined` to fall back to `process.env`. */
export function setChainEnv(env: ChainEnv | undefined): void {
  injected = env;
}

/** The environment chain config is read from. */
export function chainEnv(): ChainEnv {
  if (injected) return injected;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return (proc?.env ?? {}) as ChainEnv;
}
