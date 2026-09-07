import type { Response } from "express";
import { describe, expect, it } from "vitest";
import type { PaidRequest } from "./payments";
import { price } from "./price";
import { stakeHandler } from "./stake";

describe("price", () => {
  it("keeps sub-cent prices exact and gives whole amounts their cents", () => {
    expect(price(1_000_000n)).toBe("$1.00");
    expect(price(500n)).toBe("$0.0005");
    expect(price(50_000n)).toBe("$0.05");
  });
});

describe("stakeHandler", () => {
  function respond() {
    const sent: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      json(body: unknown) {
        sent.body = body;
      },
    } as unknown as Response;
    return { res, sent };
  }

  it("hands back the comment the agent has to post", () => {
    const { res, sent } = respond();
    const req = {
      query: { bountyId: "bounty-1" },
      x402Payment: {
        id: "payment-1",
        endpoint: "/v1/claims/stake",
        payer: "0xa11ce",
        amountUsdc: 1_000_000n,
        network: "eip155:5042002",
        requestId: "request-1",
        createdAt: new Date(),
      },
    } as unknown as PaidRequest;

    stakeHandler()(req, res);

    expect(sent.body).toMatchObject({
      stakeId: "payment-1",
      amountUsdc: "1000000",
      bountyId: "bounty-1",
      claimComment: "/claim stake:payment-1",
    });
  });

  it("refuses to invent a stake when no payment was recorded", () => {
    const { res, sent } = respond();

    stakeHandler()({ query: {} } as unknown as PaidRequest, res);

    expect(sent.status).toBe(500);
  });
});
