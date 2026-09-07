import { describe, expect, it } from "vitest";
import { openapiDocument } from "./openapi";

describe("openapiDocument", () => {
  const document = openapiDocument({ baseUrl: "https://x402.proofwork.dev", network: "testnet" });

  it("prices every paid endpoint from the constants the routes charge", () => {
    expect(document.paths["/v1/bounties/fit"].get.summary).toContain("$0.0005");
    expect(document.paths["/v1/review"].post.summary).toContain("$0.05");
    expect(document.paths["/v1/claims/stake"].post.summary).toContain("$1");
  });

  it("documents the 402 every paid endpoint answers with", () => {
    for (const path of ["/v1/bounties/fit", "/v1/review", "/v1/claims/stake"] as const) {
      const operation = document.paths[path];
      const responses = "get" in operation ? operation.get.responses : operation.post.responses;
      expect(responses["402"]).toBeDefined();
    }
  });

  it("names the chain payments settle on", () => {
    expect(document["x-payment"]).toMatchObject({
      protocol: "x402",
      facilitator: "circle-gateway",
      asset: "USDC",
      network: "eip155:5042002",
    });
    expect(document.servers[0]?.url).toBe("https://x402.proofwork.dev");
  });

  it("leaves /health free", () => {
    expect(document.paths["/health"].get.responses).not.toHaveProperty("402");
  });
});
