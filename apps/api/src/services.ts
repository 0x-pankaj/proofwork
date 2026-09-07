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

export function github(env: Env): GitHubClient {
  const auth = githubAuth(env);
  const appId = required(env, "GITHUB_APP_ID");
  if (cachedClient?.appId !== appId) {
    cachedClient = { appId, instance: new GitHubClient(auth) };
  }
  return cachedClient.instance;
}
