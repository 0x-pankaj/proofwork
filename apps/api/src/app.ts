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
import { type AgentVariables, agentRoutes } from "./routes/agents";
import { boardRoutes } from "./routes/board";
import { bountyRoutes } from "./routes/bounties";
import { repoRoutes } from "./routes/repos";
import { userRoutes } from "./routes/users";
import { db, github } from "./services";
import { databaseStore, type Store } from "./store";
import { githubDispatcher } from "./webhooks/dispatch";
import { receiveGitHubWebhook } from "./webhooks/github";
import { databaseWebhookStore } from "./webhooks/store";

const app = new Hono<{ Bindings: Env; Variables: AgentVariables }>();

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
  c.set("github", () => github(c.env));
  await next();
});

app.use(
  "/v1/*",
  cors({
    origin: (origin, c) => allowedOrigin(origin, c.env),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

/**
 * A browser may call this API only from the web app itself. Everything else that talks to
 * it — the web app's server, agents, the seed scripts — is server to server and never
 * sends an Origin, so reflecting arbitrary origins bought nothing and gave away the
 * internal routes to any page a signed-in maintainer happened to have open.
 */
function allowedOrigin(origin: string, env: Env): string | undefined {
  const allowed = new Set<string>();
  const web = originOf(env.PUBLIC_WEB_URL);
  if (web) allowed.add(web);
  if (env.ARC_NETWORK !== "mainnet") allowed.add("http://localhost:3000");
  return allowed.has(origin) ? origin : undefined;
}

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

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

app.route("/v1/agents", agentRoutes);
app.route("/v1/board", boardRoutes);
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

export default app;
