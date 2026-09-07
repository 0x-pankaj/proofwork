import { setChainEnv } from "@proofwork/chain";
import { createDatabase, type Database, repoWithInstallationByFullName } from "@proofwork/db";
import { GitHubAppAuth, GitHubClient, type RepoRef } from "@proofwork/github";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { type Env, required } from "./env";
import { FIT_PRICE_USDC, fit } from "./fit";
import { collect, gateway } from "./gateway";
import { openapiDocument } from "./openapi";
import { recordPayment } from "./payments";
import { price } from "./price";
import type { Result } from "./result";
import { pullRequestReview, REVIEW_PRICE_USDC } from "./review";
import { stakePrice, stakeReceipt } from "./stake";

/**
 * Proofwork's paid endpoints.
 *
 * Agents pay for these per call with USDC over x402: no account, no API key, no invoice.
 * Circle's Gateway middleware handles the 402 negotiation and the batched settlement;
 * everything here is what an agent gets for the money.
 */

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", async (c, next) => {
  setChainEnv(c.env);
  await next();
});

/** Liveness. The marketplace listing stays live only while this answers. */
app.get("/health", (c) =>
  c.json({ ok: true, service: "proofwork-x402", network: c.env.ARC_NETWORK ?? "testnet" }),
);

/** What the marketplace and any agent read to find out what is for sale here. */
app.get("/openapi.json", (c) =>
  c.json(
    openapiDocument({
      baseUrl: c.env.PUBLIC_X402_URL || new URL(c.req.url).origin,
      network: c.env.ARC_NETWORK ?? "testnet",
    }),
  ),
);

/** Whether a bounty is worth claiming, for a twentieth of a cent. */
app.get("/v1/bounties/fit", async (c) => {
  const db = database(c.env);
  const paid = await collect(gateway(c.env).require(price(FIT_PRICE_USDC)), c);
  if (!paid.paid) return paid.response;

  await recordPayment(db, "/v1/bounties/fit", paid.payment);
  return respond(
    c,
    await fit(db, { bountyId: c.req.query("bountyId"), skills: c.req.query("skills") }),
  );
});

/** A pre-review of a pull request against the issue it claims to close. */
app.post("/v1/review", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  const db = database(c.env);
  const paid = await collect(gateway(c.env).require(price(REVIEW_PRICE_USDC)), c, body);
  if (!paid.paid) return paid.response;

  await recordPayment(db, "/v1/review", paid.payment);
  return respond(
    c,
    await pullRequestReview(
      { env: c.env, github: github(c.env), installationFor: installationLookup(db) },
      body,
    ),
  );
});

/**
 * The claim stake. Priced per request from the repository's policy, which is why the
 * price is read before the payment is demanded rather than fixed at route setup.
 */
app.post("/v1/claims/stake", async (c) => {
  const db = database(c.env);
  const bountyId = c.req.query("bountyId");
  const paid = await collect(gateway(c.env).require(await stakePrice(db, bountyId)), c);
  if (!paid.paid) return paid.response;

  const payment = await recordPayment(db, "/v1/claims/stake", paid.payment);
  return respond(c, stakeReceipt(payment, bountyId));
});

app.notFound((c) => c.json({ error: { code: "not_found", message: "no such endpoint" } }, 404));

app.onError((error, c) => {
  console.error("unhandled", { path: c.req.path, message: String(error) });
  return c.json(
    { error: { code: "internal_error", message: "the request could not be completed" } },
    500,
  );
});

function respond(c: { json: (body: unknown, status: never) => Response }, result: Result) {
  return c.json(result.body, result.status as never);
}

function database(env: Env): Database {
  return createDatabase(required(env, "DATABASE_URL"));
}

function github(env: Env): GitHubClient {
  return new GitHubClient(
    new GitHubAppAuth({
      appId: required(env, "GITHUB_APP_ID"),
      privateKey: required(env, "GITHUB_APP_PRIVATE_KEY"),
    }),
  );
}

/**
 * Diffs are read with the installation's own token, so a private repository that has
 * installed Proofwork is readable and one that has not is simply not for sale here.
 */
function installationLookup(db: Database) {
  return async (repoFullName: string): Promise<RepoRef | undefined> => {
    const found = await repoWithInstallationByFullName(db, repoFullName);
    if (!found?.repo.installed || found.installation.suspended) return undefined;
    return {
      fullName: found.repo.fullName,
      installationId: Number(found.installation.githubInstallationId),
    };
  };
}

export default app;
