import { Hono } from "hono";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  createFakeStore,
  type FakeStore,
  fakeBounty,
  fakeInstallation,
  fakeRepo,
  fakeUser,
} from "../store.fake";
import type { BountyVariables } from "./bounties";
import { payoutMessage, userRoutes } from "./users";

const env = { ARC_NETWORK: "testnet", INTERNAL_API_KEY: "internal-key" } as unknown as Env;

const internal = {
  "content-type": "application/json",
  "x-internal-key": "internal-key",
  "x-acting-user": "user-1",
};

function serve(store: FakeStore) {
  const app = new Hono<{ Bindings: Env; Variables: BountyVariables }>();
  app.use("*", async (c, next) => {
    c.set("store", () => store);
    await next();
  });
  app.route("/v1/users", userRoutes);
  return app;
}

describe("POST /v1/users", () => {
  it("records a GitHub account on sign-in", async () => {
    const store = createFakeStore();
    const res = await serve(store).request(
      "/v1/users",
      {
        method: "POST",
        body: JSON.stringify({ githubId: "5", login: "octocat" }),
        headers: { "content-type": "application/json", "x-internal-key": "internal-key" },
      },
      env,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ login: "octocat" });
  });

  it("does not need an acting user, because there is not one yet", async () => {
    const res = await serve(createFakeStore()).request(
      "/v1/users",
      {
        method: "POST",
        body: JSON.stringify({ githubId: "5", login: "octocat" }),
        headers: { "content-type": "application/json" },
      },
      env,
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /v1/users/me/payout", () => {
  const nonce = "9f2c11ab";

  it("accepts an address whose owner signed for it", async () => {
    const store = createFakeStore({ users: [fakeUser({ payoutAddress: null })] });
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: payoutMessage("user-1", nonce) });

    const res = await serve(store).request(
      "/v1/users/me/payout",
      {
        method: "POST",
        body: JSON.stringify({ address: account.address, nonce, signature }),
        headers: internal,
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await store.userByLogin("octocat"))?.payoutAddress).toBe(account.address);
  });

  it("refuses an address the caller cannot prove they hold", async () => {
    const store = createFakeStore({ users: [fakeUser({ payoutAddress: null })] });
    const owner = privateKeyToAccount(generatePrivateKey());
    const impostor = privateKeyToAccount(generatePrivateKey());
    const signature = await impostor.signMessage({ message: payoutMessage("user-1", nonce) });

    const res = await serve(store).request(
      "/v1/users/me/payout",
      {
        method: "POST",
        body: JSON.stringify({ address: owner.address, nonce, signature }),
        headers: internal,
      },
      env,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "bad_signature" } });
    expect((await store.userByLogin("octocat"))?.payoutAddress).toBeNull();
  });

  it("refuses a signature made for a different user", async () => {
    const store = createFakeStore({ users: [fakeUser({ payoutAddress: null })] });
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: payoutMessage("user-2", nonce) });

    const res = await serve(store).request(
      "/v1/users/me/payout",
      {
        method: "POST",
        body: JSON.stringify({ address: account.address, nonce, signature }),
        headers: internal,
      },
      env,
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /v1/users/me/*", () => {
  it("lists what the signed-in user funded", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      users: [fakeUser()],
      bounties: [fakeBounty({ funderUserId: "user-1" })],
    });

    const res = await serve(store).request("/v1/users/me/bounties", { headers: internal }, env);

    const body = (await res.json()) as { bounties: Array<{ id: string }> };
    expect(body.bounties).toHaveLength(1);
    expect(body.bounties[0]).toMatchObject({ id: "bounty-1", repo: "0x-pankaj/proofwork" });
  });

  it("refuses to answer without the internal key", async () => {
    const res = await serve(createFakeStore()).request("/v1/users/me", {}, env);
    expect(res.status).toBe(401);
  });
});
