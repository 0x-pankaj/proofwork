import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import type { Database } from "@proofwork/db";
import type { GitHubClient, RepoRef } from "@proofwork/github";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { type Env, facilitatorUrl, required } from "./env";
import { recording } from "./payments";
import { price } from "./price";
import { REVIEW_PRICE_USDC, reviewHandler } from "./review";
import { requireStake, stakeHandler } from "./stake";

/**
 * Proofwork's paid endpoints.
 *
 * Agents pay for these per call with USDC over x402: no account, no API key, no invoice.
 * Circle's Gateway middleware handles the 402 negotiation and the batched settlement;
 * everything here is what an agent gets for the money.
 *
 * Express rather than Hono on Workers because Circle documents the seller middleware for
 * Express, and the money path is not where to be clever about a framework.
 */

export interface AppDeps {
  env: Env;
  db: Database;
  github: GitHubClient;
  /** Which installation can read a repository, so a private diff stays readable. */
  installationFor(repoFullName: string): Promise<RepoRef | undefined>;
}

export function createApp(deps: AppDeps): Express {
  const { env } = deps;
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const gateway = createGatewayMiddleware({
    sellerAddress: required(env, "X402_SELLER_ADDRESS"),
    facilitatorUrl: facilitatorUrl(env),
    description: "Proofwork — escrowed open-source bounties settled on Arc",
  });

  /** Liveness. The marketplace listing stays up only while this answers. */
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "proofwork-x402", network: env.ARC_NETWORK ?? "testnet" });
  });

  /** A pre-review of a pull request against the issue it claims to close. */
  app.post(
    "/v1/review",
    gateway.require(price(REVIEW_PRICE_USDC)),
    recording(deps.db, "/v1/review"),
    reviewHandler({
      env,
      github: deps.github,
      installationFor: deps.installationFor,
    }),
  );

  /**
   * The claim stake. Priced per request from the repository's policy, which is why the
   * gateway middleware is built inside the handler chain rather than at route setup.
   */
  app.post(
    "/v1/claims/stake",
    requireStake(deps.db, gateway.require),
    recording(deps.db, "/v1/claims/stake"),
    stakeHandler(),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "no such endpoint" } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("unhandled", { message: String(error) });
    res
      .status(500)
      .json({ error: { code: "internal_error", message: "the request could not be completed" } });
  });

  return app;
}
