import { describe, expect, it, vi } from "vitest";
import { CircleCompliance } from "./compliance";

const ADDRESS = "0x7fb49965753A9eC3646fd5d004ee5AeD6Cc89999";

function compliance(responder: () => Response, mode: "engine" | "wallet-only" = "engine") {
  const fetchImpl = vi.fn(async () => responder());
  const client = new CircleCompliance({
    apiKey: "TEST_API_KEY:x",
    chain: "ARC-TESTNET",
    mode,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, fetchImpl };
}

describe("CircleCompliance", () => {
  it("does not call the engine when the account only has wallet screening", async () => {
    const { client, fetchImpl } = compliance(() => Response.json({}), "wallet-only");

    const outcome = await client.screenAddress(ADDRESS);

    expect(outcome.approved).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a payout to a denied address", async () => {
    const { client } = compliance(() =>
      Response.json({
        data: { result: "DENIED", decision: { ruleName: "Circle's Sanctions Blocklist" } },
      }),
    );

    const outcome = await client.screenAddress(ADDRESS);

    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toContain("denied");
    expect(outcome.raw).toMatchObject({ result: "DENIED" });
  });

  it("approves an address the engine cleared", async () => {
    const { client } = compliance(() => Response.json({ data: { result: "APPROVED" } }));

    await expect(client.screenAddress(ADDRESS)).resolves.toMatchObject({ approved: true });
  });

  it("reads the unwrapped shape the quickstart documents", async () => {
    const { client } = compliance(() => Response.json({ result: "DENIED" }));

    await expect(client.screenAddress(ADDRESS)).resolves.toMatchObject({ approved: false });
  });

  it("keeps paying people when the account is not entitled to the engine", async () => {
    const { client } = compliance(() => new Response("not entitled", { status: 403 }));

    const outcome = await client.screenAddress(ADDRESS);

    expect(outcome.approved).toBe(true);
    expect(outcome.reason).toContain("not enabled");
  });

  it("raises anything else rather than guessing", async () => {
    const { client } = compliance(() => new Response("boom", { status: 500 }));

    await expect(client.screenAddress(ADDRESS)).rejects.toThrow(/500 boom/);
  });

  it("sends the address, chain and an idempotency key", async () => {
    const { client, fetchImpl } = compliance(() => Response.json({ result: "APPROVED" }));

    await client.screenAddress(ADDRESS, "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.circle.com/v1/w3s/compliance/screening/addresses");
    expect(JSON.parse(String(init.body))).toEqual({
      idempotencyKey: "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b",
      address: ADDRESS,
      chain: "ARC-TESTNET",
    });
  });
});
