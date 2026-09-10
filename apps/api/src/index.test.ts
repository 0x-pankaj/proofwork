import { describe, expect, it } from "vitest";
import app from "./app";
import type { Env } from "./env";
import { isMalformedId } from "./http";

const env = {
  ARC_NETWORK: "testnet",
  PROOFWORK_JOBS_ADDRESS_TESTNET: "",
} as unknown as Env;

describe("health", () => {
  it("answers without touching the database or the chain", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      service: "proofwork-api",
      network: "testnet",
      chainId: 5_042_002,
      contract: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
    });
  });

  it("stays up even when the chain is misconfigured", async () => {
    const res = await app.request("/health", {}, {
      ...env,
      ARC_NETWORK: "mainnet",
    } as unknown as Env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, chainId: null, contract: null });
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

describe("cors", () => {
  const withWeb = { ...env, PUBLIC_WEB_URL: "https://app.example" } as unknown as Env;

  it("lets the web app's own origin call the api from a browser", async () => {
    const res = await app.request(
      "/v1/config",
      { headers: { origin: "https://app.example" } },
      withWeb,
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example");
  });

  it("does not hand the api to any other page", async () => {
    const res = await app.request(
      "/v1/config",
      { headers: { origin: "https://evil.example" } },
      withWeb,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the local dev server on testnet", async () => {
    const res = await app.request(
      "/v1/config",
      { headers: { origin: "http://localhost:3000" } },
      withWeb,
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});

describe("malformed ids", () => {
  it("recognises postgres refusing a non-uuid id", () => {
    expect(isMalformedId({ code: "22P02", message: "invalid input syntax for type uuid" })).toBe(
      true,
    );
    expect(isMalformedId(new Error('invalid input syntax for type uuid: "nope"'))).toBe(true);
    expect(isMalformedId(new Error("connection refused"))).toBe(false);
    expect(isMalformedId(undefined)).toBe(false);
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
