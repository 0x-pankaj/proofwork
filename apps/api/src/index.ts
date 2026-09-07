import {
  ARC_TESTNET_EXPLORER_URL,
  activeNetwork,
  chainIdFor,
  proofworkJobsAddress,
  setChainEnv,
  USDC_DECIMALS,
  usdcAddress,
} from "@proofwork/chain";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type Env, required } from "./env";
import { fail } from "./http";
import { db } from "./services";
import { githubDispatcher } from "./webhooks/dispatch";
import { receiveGitHubWebhook } from "./webhooks/github";
import { databaseWebhookStore } from "./webhooks/store";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());

/**
 * Chain configuration is read from Worker bindings, which arrive per request.
 * Handing them to packages/chain once per request keeps every address lookup in
 * one place instead of scattering `env.` reads through the handlers.
 */
app.use("*", async (c, next) => {
  setChainEnv(c.env);
  await next();
});

app.use(
  "/v1/*",
  cors({
    origin: (origin) => origin,
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

/** Liveness. Deliberately does no I/O, so it stays honest about the Worker itself. */
app.get("/health", (c) => c.json({ ok: true, service: "proofwork-api" }));

/**
 * Everything a client needs to talk to the right chain and contract.
 * The web app and the agent skill both read this rather than hardcoding anything.
 */
app.get("/v1/config", (c) => {
  const network = activeNetwork(c.env);
  return c.json({
    network,
    chainId: chainIdFor(network, c.env),
    usdc: { address: usdcAddress(network, c.env), decimals: USDC_DECIMALS },
    proofworkJobs: proofworkJobsAddress(network, c.env),
    explorer: network === "testnet" ? ARC_TESTNET_EXPLORER_URL : c.env.ARC_MAINNET_EXPLORER_URL,
  });
});

/**
 * GitHub deliveries. Verified against the app's webhook secret, written down, then acted
 * on; an unsigned request never reaches the database.
 */
app.post("/webhooks/github", async (c) => {
  const outcome = await receiveGitHubWebhook(c.req.raw, {
    secret: required(c.env, "GITHUB_WEBHOOK_SECRET"),
    store: databaseWebhookStore(db(c.env), "github"),
    handle: githubDispatcher(c.env),
  });
  return c.json(outcome.body, outcome.status);
});

app.notFound((c) => fail(c, 404, "not_found", `no route for ${c.req.method} ${c.req.path}`));

app.onError((error, c) => {
  console.error("unhandled", { path: c.req.path, message: String(error) });
  return fail(c, 500, "internal_error", "the request could not be completed");
});

export default app;
