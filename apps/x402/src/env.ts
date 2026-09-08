import type { ChainEnv } from "@proofwork/chain";

/**
 * Worker bindings for the paid endpoints.
 *
 * Circle's nanopayments middleware turns out to be transport-agnostic — it touches only
 * `url`, `headers`, `method` on the request and `setHeader`, `statusCode`, `end` on the
 * response — so it runs on Workers behind a small shim, and this service lives beside the
 * other two rather than on a separate host.
 */
export interface Env extends ChainEnv {
  DATABASE_URL: string;
  /** The treasury address every nanopayment is paid to. */
  X402_SELLER_ADDRESS: string;
  /** Testnet: https://gateway-api-testnet.circle.com */
  X402_FACILITATOR_URL?: string;

  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;

  /**
   * The reviewing model. `MODEL_*` is the name to use; the `ANTHROPIC_*` pair is still read
   * so an existing environment keeps working.
   */
  MODEL_API_KEY?: string;
  MODEL_BASE_URL?: string;
  /** Which wire format the endpoint speaks. Inferred from the host when unset. */
  MODEL_API_STYLE?: "anthropic" | "openai";
  MODEL_NAME?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;

  /** This service's own public origin, published in the OpenAPI document. */
  PUBLIC_X402_URL?: string;
}

export function required<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing binding ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

/** Circle's Gateway facilitator. Testnet by default, because that is where Arc is. */
export function facilitatorUrl(env: Env): string {
  if (env.X402_FACILITATOR_URL) return env.X402_FACILITATOR_URL;
  return env.ARC_NETWORK === "mainnet"
    ? "https://gateway-api.circle.com"
    : "https://gateway-api-testnet.circle.com";
}
