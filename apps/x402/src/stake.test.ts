import type { X402Payment } from "@proofwork/db";
import { describe, expect, it } from "vitest";
import { price } from "./price";
import { stakeReceipt } from "./stake";

const payment: X402Payment = {
  id: "payment-1",
  endpoint: "/v1/claims/stake",
  payer: "0xa11ce",
  amountUsdc: 1_000_000n,
  network: "eip155:5042002",
  requestId: "request-1",
  createdAt: new Date("2026-09-07T00:00:00Z"),
};

describe("price", () => {
  it("keeps sub-cent prices exact and gives whole amounts their cents", () => {
    expect(price(1_000_000n)).toBe("$1.00");
    expect(price(500n)).toBe("$0.0005");
    expect(price(50_000n)).toBe("$0.05");
  });
});

describe("stakeReceipt", () => {
  it("hands back the comment the agent has to post", () => {
    const result = stakeReceipt(payment, "bounty-1");

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      stakeId: "payment-1",
      amountUsdc: "1000000",
      bountyId: "bounty-1",
      claimComment: "/claim stake:payment-1",
    });
  });

  it("allows a stake with no bounty attached", () => {
    expect(stakeReceipt(payment, undefined).body).toMatchObject({ bountyId: null });
  });
});
