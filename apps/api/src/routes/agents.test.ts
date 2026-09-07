import { Hono } from "hono";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { hashApiKey } from "../keys";
import { createFakeStore, type FakeStore, fakeAgent } from "../store.fake";
import { type AgentVariables, agentRoutes, registrationMessage } from "./agents";

const env = {
  ARC_NETWORK: "testnet",
  PUBLIC_WEB_URL: "https://proofwork.test",
  PUBLIC_API_URL: "https://api.proofwork.test",
} as unknown as Env;

function serve(store: FakeStore) {
  const app = new Hono<{ Bindings: Env; Variables: AgentVariables }>();
  app.use("*", async (c, next) => {
    c.set("store", () => store);
    await next();
  });
  app.route("/v1/agents", agentRoutes);
  return app;
}

async function signedRegistration(overrides: Record<string, unknown> = {}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const githubLogin = (overrides.githubLogin as string) ?? "helpful-bot";
  const nonce = "nonce-12345678";
  const signature = await account.signMessage({
    message: registrationMessage(githubLogin, account.address, nonce),
  });

  return {
    account,
    body: {
      name: "Helpful bot",
      walletAddress: account.address,
      githubLogin,
      nonce,
      signature,
      ...overrides,
    },
  };
}

function post(store: FakeStore, body: unknown) {
  return serve(store).request(
    "/v1/agents/register",
    { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } },
    env,
  );
}

describe("POST /v1/agents/register", () => {
  it("registers an agent that proves it holds its payout key", async () => {
    const store = createFakeStore();
    const { account, body } = await signedRegistration();

    const res = await post(store, body);

    expect(res.status).toBe(201);
    const registered = (await res.json()) as { apiKey: string; metadataUri: string };
    expect(registered.apiKey.startsWith("pwk_")).toBe(true);
    expect(registered.metadataUri).toContain("https://api.proofwork.test/v1/agents/");

    const stored = await store.agentByGithubLogin("helpful-bot");
    expect(stored?.walletAddress).toBe(account.address);
    // Only the hash is kept, so a database leak does not hand over the identity.
    expect(stored?.apiKeyHash).toBe(await hashApiKey(registered.apiKey));
    expect(stored?.apiKeyHash).not.toBe(registered.apiKey);
  });

  it("refuses a signature from a different key", async () => {
    const store = createFakeStore();
    const { body } = await signedRegistration();
    const other = privateKeyToAccount(generatePrivateKey());

    const res = await post(store, { ...body, walletAddress: other.address });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "bad_signature" } });
  });

  it("refuses a login that is already an agent", async () => {
    const store = createFakeStore({ agents: [fakeAgent({ githubLogin: "helpful-bot" })] });
    const { body } = await signedRegistration();

    const res = await post(store, body);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "already_registered" } });
  });
});

describe("GET /v1/agents/me", () => {
  it("answers what the agent has earned", async () => {
    const apiKey = "pwk_a-key-long-enough-to-look-like-a-key";
    const store = createFakeStore({
      agents: [fakeAgent({ apiKeyHash: await hashApiKey(apiKey) })],
    });

    const res = await serve(store).request(
      "/v1/agents/me",
      { headers: { authorization: `Bearer ${apiKey}` } },
      env,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      githubLogin: "proofwork-agent",
      settled: 0,
      earnedUsdc: "0",
    });
  });

  it("refuses an unknown key", async () => {
    const store = createFakeStore();
    const res = await serve(store).request(
      "/v1/agents/me",
      { headers: { authorization: "Bearer pwk_not-a-registered-key-but-long-enough" } },
      env,
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /v1/agents/:id/metadata.json", () => {
  it("serves ERC-8004 metadata the registry can point at", async () => {
    const store = createFakeStore({ agents: [fakeAgent({ erc8004AgentId: 42n })] });

    const res = await serve(store).request("/v1/agents/agent-1/metadata.json", {}, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      name: "proofwork-reference-agent",
      registrations: [{ agentId: "42" }],
    });
  });
});
