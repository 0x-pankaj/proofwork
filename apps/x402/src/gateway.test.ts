import { X402_NETWORK_TESTNET } from "@proofwork/chain";
import { describe, expect, it } from "vitest";
import app from "./index";

/**
 * The 402 is the product. An agent's wallet reads the `payment-required` header to learn
 * what to sign, so this checks the whole shim end to end: the real Circle middleware,
 * driven through the Workers request/response objects, answering an unpaid call.
 */

const SELLER = "0x3975261337566C22A5129EB82BdCC8c364C4a313";

const env = {
  ARC_NETWORK: "testnet",
  X402_SELLER_ADDRESS: SELLER,
  X402_FACILITATOR_URL: "https://gateway-api-testnet.circle.com",
  // Never reached: the payment gate answers before any query is made.
  DATABASE_URL: "postgres://nobody:nothing@localhost/proofwork",
};

interface PaymentRequired {
  x402Version: number;
  accepts: Array<{ network: string; asset: string; amount: string; payTo: string }>;
}

function requirements(response: Response): PaymentRequired {
  const header = response.headers.get("payment-required");
  expect(header, "a 402 without payment requirements is useless to a wallet").toBeTruthy();
  return JSON.parse(Buffer.from(header as string, "base64").toString()) as PaymentRequired;
}

describe("the payment gate", () => {
  it("answers an unpaid fit request with a 402 an Arc wallet can pay", async () => {
    const response = await app.request("/v1/bounties/fit?bountyId=b1", {}, env);

    expect(response.status).toBe(402);
    const required = requirements(response);
    expect(required.x402Version).toBe(2);

    const arc = required.accepts.find((offer) => offer.network === X402_NETWORK_TESTNET);
    expect(arc, "Arc testnet must be among the networks offered").toBeDefined();
    expect(arc?.amount).toBe("500");
    expect(arc?.asset.toLowerCase()).toBe("0x3600000000000000000000000000000000000000");
    expect(arc?.payTo.toLowerCase()).toBe(SELLER.toLowerCase());
  });

  it("prices the default stake at a dollar when no bounty is named", async () => {
    const stake = await app.request("/v1/claims/stake", { method: "POST" }, env);
    expect(stake.status).toBe(402);
    expect(requirements(stake).accepts[0]?.amount).toBe("1000000");
  });

  it("refuses a forged payment header rather than serving for free", async () => {
    // No facilitator is reachable here, so nothing can vouch for the forged header.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;

    let response: Response;
    try {
      response = await app.request(
        "/v1/bounties/fit?bountyId=b1",
        { headers: { "payment-signature": Buffer.from("{}").toString("base64") } },
        env,
      );
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(response.status).not.toBe(200);
  });
});
