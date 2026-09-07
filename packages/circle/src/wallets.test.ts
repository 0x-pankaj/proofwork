import { describe, expect, it, vi } from "vitest";
import { type CircleClient, CircleTransactionError, CircleWallets, succeeded } from "./wallets";

const TX_HASH = "0xdeadbeef";

function client(states: string[], overrides: Partial<CircleClient> = {}): CircleClient {
  const queue = [...states];
  return {
    async createContractExecutionTransaction() {
      return { data: { id: "circle-tx-1" } };
    },
    async getTransaction() {
      const state = queue.length > 1 ? queue.shift() : queue[0];
      return {
        data: {
          transaction: {
            state,
            txHash: state === "CONFIRMED" || state === "COMPLETE" ? TX_HASH : null,
            errorReason: state === "FAILED" ? "INSUFFICIENT_FUNDS" : undefined,
          },
        },
      };
    },
    ...overrides,
  };
}

function wallets(circle: CircleClient) {
  return new CircleWallets({ apiKey: "k", entitySecret: "s", client: circle });
}

describe("executeContract", () => {
  it("sends the call and returns the id to poll", async () => {
    const create = vi.fn(async () => ({ data: { id: "circle-tx-1" } }));
    const circle = client(["COMPLETE"], { createContractExecutionTransaction: create });

    const result = await wallets(circle).executeContract({
      walletId: "wallet-1",
      contractAddress: "0x3Bc728A813a7aBe0cB898fd63967525e92353D85",
      abiFunctionSignature: "settle(uint256,address,bytes32,bytes32)",
      abiParameters: ["1", "0xabc", "0xdead", "0xbeef"],
      idempotencyKey: "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b",
    });

    expect(result).toEqual({ id: "circle-tx-1" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-1",
        abiFunctionSignature: "settle(uint256,address,bytes32,bytes32)",
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        idempotencyKey: "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b",
      }),
    );
  });

  it("refuses to pretend a missing id is a submitted transaction", async () => {
    const circle = client(["COMPLETE"], {
      createContractExecutionTransaction: async () => ({ data: null }),
    });

    await expect(
      wallets(circle).executeContract({
        walletId: "wallet-1",
        contractAddress: "0x00",
        abiFunctionSignature: "settle()",
        abiParameters: [],
      }),
    ).rejects.toThrow(/returned no id/);
  });
});

describe("waitForTransaction", () => {
  it("polls through the intermediate states until the money has moved", async () => {
    const circle = client(["QUEUED", "SENT", "CONFIRMED"]);

    const transaction = await wallets(circle).waitForTransaction("circle-tx-1", {
      intervalMs: 0,
    });

    expect(transaction.state).toBe("CONFIRMED");
    expect(transaction.txHash).toBe(TX_HASH);
    expect(succeeded(transaction)).toBe(true);
  });

  it("stops at a denial rather than waiting for it to change", async () => {
    const circle = client(["DENIED"]);

    const transaction = await wallets(circle).waitForTransaction("circle-tx-1", {
      intervalMs: 0,
    });

    expect(transaction.state).toBe("DENIED");
    expect(succeeded(transaction)).toBe(false);
  });

  it("reports a failure with Circle's reason", async () => {
    const circle = client(["FAILED"]);

    const transaction = await wallets(circle).waitForTransaction("circle-tx-1", {
      intervalMs: 0,
    });

    expect(transaction.errorReason).toBe("INSUFFICIENT_FUNDS");
    expect(succeeded(transaction)).toBe(false);
  });

  it("waits for COMPLETE when confirmation alone is not enough", async () => {
    const circle = client(["CONFIRMED", "CONFIRMED", "COMPLETE"]);

    const transaction = await wallets(circle).waitForTransaction("circle-tx-1", {
      intervalMs: 0,
      acceptConfirmed: false,
    });

    expect(transaction.state).toBe("COMPLETE");
  });

  it("throws rather than returning an ambiguous result on timeout", async () => {
    const circle = client(["SENT"]);

    await expect(
      wallets(circle).waitForTransaction("circle-tx-1", { intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(CircleTransactionError);
  });

  it("does not call a confirmed transaction with no hash a success", async () => {
    expect(succeeded({ id: "1", state: "CONFIRMED" })).toBe(false);
  });
});
