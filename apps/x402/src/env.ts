/**
 * Configuration for the paid endpoints.
 *
 * This service runs on Node rather than Workers — Circle's nanopayments middleware is
 * documented for Express — so unlike the rest of Proofwork it reads `process.env`.
 */
export interface Env {
  PORT?: string;
  DATABASE_URL: string;
  /** The treasury address every nanopayment is paid to. */
  X402_SELLER_ADDRESS: string;
  /** Testnet: https://gateway-api-testnet.circle.com */
  X402_FACILITATOR_URL?: string;
  ARC_NETWORK?: string;

  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;

  ANTHROPIC_API_KEY?: string;
  /** Set when Claude is reached through a gateway rather than api.anthropic.com. */
  ANTHROPIC_BASE_URL?: string;

  PUBLIC_WEB_URL?: string;
  PUBLIC_API_URL?: string;
  /** This service's own public origin, published in the OpenAPI document. */
  PUBLIC_X402_URL?: string;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return source as unknown as Env;
}

export function required<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing environment variable ${String(key)}`);
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
