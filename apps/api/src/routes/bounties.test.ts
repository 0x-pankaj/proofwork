import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  createFakeStore,
  type FakeStore,
  fakeBounty,
  fakeInstallation,
  fakeRepo,
} from "../store.fake";
import { type BountyVariables, bountyRoutes } from "./bounties";

const env = { ARC_NETWORK: "testnet", INTERNAL_API_KEY: "internal-key" } as unknown as Env;

function serve(store: FakeStore) {
  const app = new Hono<{ Bindings: Env; Variables: BountyVariables }>();
  app.use("*", async (c, next) => {
    c.set("store", () => store);
    await next();
  });
  app.route("/v1/bounties", bountyRoutes);
  return app;
}

function seeded() {
  return createFakeStore({
    repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
    bounties: [
      fakeBounty(),
      fakeBounty({
        id: "bounty-2",
        issueNumber: 13,
        amountUsdc: 20_000_000n,
        status: "settled",
        settleTxHash: "0xabc",
      }),
    ],
  });
}

describe("GET /v1/bounties", () => {
  it("lists bounties with the split each one pays", async () => {
    const res = await serve(seeded()).request("/v1/bounties", {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { bounties: Array<Record<string, unknown>> };
    expect(body.bounties).toHaveLength(2);
    expect(body.bounties[0]).toMatchObject({
      repo: "0x-pankaj/proofwork",
      issueNumber: 12,
      amountUsdc: "200000000",
      split: {
        contributor: "170000000",
        maintainer: "30000000",
        fee: "6000000",
        total: "206000000",
      },
    });
  });

  it("filters by status", async () => {
    const res = await serve(seeded()).request("/v1/bounties?status=settled", {}, env);

    const body = (await res.json()) as { bounties: Array<{ id: string }> };
    expect(body.bounties.map((bounty) => bounty.id)).toEqual(["bounty-2"]);
  });

  it("filters by amount", async () => {
    const res = await serve(seeded()).request("/v1/bounties?minAmountUsdc=50000000", {}, env);

    const body = (await res.json()) as { bounties: Array<{ id: string }> };
    expect(body.bounties.map((bounty) => bounty.id)).toEqual(["bounty-1"]);
  });

  it("rejects a query it cannot make sense of", async () => {
    const res = await serve(seeded()).request("/v1/bounties?perPage=0", {}, env);
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/bounties/:id", () => {
  it("returns the bounty with its claims, submission and settlement", async () => {
    const store = seeded();
    const res = await serve(store).request("/v1/bounties/bounty-2", {}, env);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "bounty-2",
      status: "settled",
      settleTxUrl: "https://testnet.arcscan.app/tx/0xabc",
      claims: [],
      submission: null,
      settlement: null,
    });
  });

  it("answers 404 for a bounty that does not exist", async () => {
    const res = await serve(seeded()).request("/v1/bounties/nope", {}, env);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });
});

describe("write routes", () => {
  it("refuse a request without the internal key", async () => {
    const res = await serve(seeded()).request(
      "/v1/bounties",
      { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
      env,
    );

    expect(res.status).toBe(401);
  });

  it("refuse a request that does not say who it is acting for", async () => {
    const res = await serve(seeded()).request(
      "/v1/bounties",
      {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", "x-internal-key": "internal-key" },
      },
      env,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "no_acting_user" } });
  });

  it("reject a body that is not a bounty", async () => {
    const res = await serve(seeded()).request(
      "/v1/bounties",
      {
        method: "POST",
        body: JSON.stringify({ repoId: "not-a-uuid", issueNumber: 0, amountUsdc: "x" }),
        headers: {
          "content-type": "application/json",
          "x-internal-key": "internal-key",
          "x-acting-user": "user-1",
        },
      },
      env,
    );

    expect(res.status).toBe(400);
  });
});
