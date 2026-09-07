import type { ChainEnv } from "@proofwork/chain";

/**
 * Worker bindings. Cloudflare passes these per request rather than through the
 * process environment, which is why nothing here reads `process.env`.
 */
export interface Env extends ChainEnv {
  ARC_NETWORK: string;
  DATABASE_URL: string;

  /** Where the web app lives, for the links Proofwork writes into GitHub comments. */
  PUBLIC_WEB_URL: string;

  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;

  CIRCLE_API_KEY: string;
  CIRCLE_ENTITY_SECRET: string;
  CIRCLE_VERIFIER_WALLET_ID: string;
  CIRCLE_TREASURY_WALLET_ID: string;

  /** "false" lets agents claim without a stake, which testnet demos need before x402. */
  REQUIRE_AGENT_STAKE?: string;
  /** "engine" uses Compliance Engine; anything else relies on Circle's wallet screening. */
  COMPLIANCE_MODE?: string;
}

/** Reads a required binding, failing with a message that names what is missing. */
export function required<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing binding ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}
