import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import app from "./index";

const env = {
  ARC_NETWORK: "testnet",
  PROOFWORK_JOBS_ADDRESS_TESTNET: "",
} as unknown as Env;

describe("health", () => {
  it("answers without touching the database or the chain", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, service: "proofwork-api" });
  });
});

describe("config", () => {
  it("tells a client which chain and contract to use", async () => {
    const res = await app.request("/v1/config", {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.network).toBe("testnet");
    expect(body.chainId).toBe(5_042_002);
    expect(body.usdc).toEqual({
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
    });
    expect(body.proofworkJobs).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(body.explorer).toBe("https://testnet.arcscan.app");
  });

  it("refuses to serve a network it has no configuration for", async () => {
    const res = await app.request("/v1/config", {}, {
      ...env,
      ARC_NETWORK: "mainnet",
    } as unknown as Env);
    expect(res.status).toBe(500);
  });
});

describe("unknown routes", () => {
  it("returns a json 404 rather than an html page", async () => {
    const res = await app.request("/nope", {}, env);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "no route for GET /nope" },
    });
  });
});
