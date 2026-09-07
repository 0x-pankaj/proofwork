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
import { reconcileChain, sweepExpiries } from "./cron";
import { type Env, required } from "./env";
import { fail } from "./http";
import { type BountyVariables, bountyRoutes } from "./routes/bounties";
import { repoRoutes } from "./routes/repos";
import { userRoutes } from "./routes/users";
import { db } from "./services";
import { databaseStore, type Store } from "./store";
import { githubDispatcher } from "./webhooks/dispatch";
import { receiveGitHubWebhook } from "./webhooks/github";
import { databaseWebhookStore } from "./webhooks/store";

const app = new Hono<{ Bindings: Env; Variables: BountyVariables }>();

app.use("*", logger());

/**
 * Chain configuration is read from Worker bindings, which arrive per request.
 * Handing them to packages/chain once per request keeps every address lookup in
 * one place instead of scattering `env.` reads through the handlers.
 */
app.use("*", async (c, next) => {
  setChainEnv(c.env);
  let store: Store | undefined;
  c.set("store", () => {
    store ??= databaseStore(db(c.env));
    return store;
  });
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

app.route("/v1/bounties", bountyRoutes);
app.route("/v1/repos", repoRoutes);
app.route("/v1/users", userRoutes);

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

export { app };

/** The hourly sweep; anything else on the schedule is the chain reconciler. */
export const HOURLY_SWEEP = "0 * * * *";

export default {
  fetch: app.fetch,

  /**
   * Scheduled work. Both jobs are safe to run twice and safe to miss: they only ever
   * bring the database in line with the chain and the clock.
   */
  async scheduled(controller, env, ctx) {
    setChainEnv(env);
    const store = databaseStore(db(env));

    ctx.waitUntil(
      (async () => {
        try {
          const result =
            controller.cron === HOURLY_SWEEP
              ? await sweepExpiries({ store, env })
              : await reconcileChain({ store, env });
          console.log("cron", { cron: controller.cron, ...result });
        } catch (error) {
          console.error("cron failed", { cron: controller.cron, message: String(error) });
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
