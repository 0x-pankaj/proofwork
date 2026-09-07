import { activeNetwork, circleBlockchainFor } from "@proofwork/chain";
import { CircleCompliance, CircleWallets } from "@proofwork/circle";
import { createDatabase, type Database } from "@proofwork/db";
import { GitHubAppAuth, GitHubClient } from "@proofwork/github";
import { type Env, required } from "./env";

/**
 * Long-lived clients, built once per isolate rather than once per request.
 *
 * Workers reuse an isolate across many requests, so caching here is what lets the GitHub
 * installation-token cache actually save round trips, and keeps the Neon client from
 * being rebuilt on every webhook delivery.
 */

let cachedDatabase: { url: string; instance: Database } | undefined;
let cachedAuth: { appId: string; instance: GitHubAppAuth } | undefined;
let cachedClient: { appId: string; instance: GitHubClient } | undefined;
let cachedWallets: { apiKey: string; instance: CircleWallets } | undefined;

export function db(env: Env): Database {
  const url = required(env, "DATABASE_URL");
  if (cachedDatabase?.url !== url) {
    cachedDatabase = { url, instance: createDatabase(url) };
  }
  return cachedDatabase.instance;
}

export function githubAuth(env: Env): GitHubAppAuth {
  const appId = required(env, "GITHUB_APP_ID");
  if (cachedAuth?.appId !== appId) {
    cachedAuth = {
      appId,
      instance: new GitHubAppAuth({
        appId,
        privateKey: required(env, "GITHUB_APP_PRIVATE_KEY"),
      }),
    };
  }
  return cachedAuth.instance;
}

/** The verifier wallet's client. Built once so its HTTP agent and keys are reused. */
export function circleWallets(env: Env): CircleWallets {
  const apiKey = required(env, "CIRCLE_API_KEY");
  if (cachedWallets?.apiKey !== apiKey) {
    cachedWallets = {
      apiKey,
      instance: new CircleWallets({
        apiKey,
        entitySecret: required(env, "CIRCLE_ENTITY_SECRET"),
      }),
    };
  }
  return cachedWallets.instance;
}

/**
 * Compliance screening. Cheap to construct, and the mode is read per request so it can
 * be switched with a Worker variable rather than a deploy.
 */
export function circleCompliance(env: Env): CircleCompliance {
  return new CircleCompliance({
    apiKey: required(env, "CIRCLE_API_KEY"),
    chain: circleBlockchainFor(activeNetwork(env), env),
    mode: env.COMPLIANCE_MODE === "engine" ? "engine" : "wallet-only",
  });
}

export function github(env: Env): GitHubClient {
  const auth = githubAuth(env);
  const appId = required(env, "GITHUB_APP_ID");
  if (cachedClient?.appId !== appId) {
    cachedClient = { appId, instance: new GitHubClient(auth) };
  }
  return cachedClient.instance;
}
