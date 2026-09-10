import { describe, expect, it } from "vitest";
import { AgentWallet, type GatewayLike, MIN_DEPOSIT_USDC, topUpFor } from "./wallet";

// Anvil's first account. A test key, never funded anywhere that matters.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

interface FakeGateway extends GatewayLike {
  deposits: string[];
  paid: string[];
}

/**
 * A Gateway that, like the real one, credits a deposit one balance read after the receipt
 * — or never, when `credits` is false.
 */
function gateway(
  balances: { wallet: bigint; gateway: bigint },
  status = 200,
  credits = true,
): FakeGateway {
  let pending = 0n;
  let reads = 0;
  const fake: FakeGateway = {
    deposits: [],
    paid: [],
    async getBalances() {
      reads += 1;
      if (pending > 0n && reads > 1 && credits) {
        balances.gateway += pending;
        pending = 0n;
      }
      return { wallet: { balance: balances.wallet }, gateway: { available: balances.gateway } };
    },
    async deposit(amount) {
      fake.deposits.push(amount);
      const deposited = BigInt(Number(amount) * 1_000_000);
      balances.wallet -= deposited;
      pending += deposited;
      reads = 0;
      return { depositTxHash: "0xdeadbeef", amount: deposited };
    },
    async pay(url) {
      fake.paid.push(url);
      return { data: { score: 80 } as never, amount: 500n, status };
    },
  };
  return fake;
}

function fetchAnswering(status: number): typeof fetch {
  return (async () =>
    new Response(status === 402 ? "{}" : '{"error":"down"}', {
      status,
    })) as unknown as typeof fetch;
}

describe("topUpFor", () => {
  it("does nothing when the floor is already covered", () => {
    expect(topUpFor(1_500_000n, 1_100_000n)).toBe(0n);
  });

  it("deposits at least the minimum rather than a few cents at a time", () => {
    expect(topUpFor(1_000_000n, 1_100_000n)).toBe(MIN_DEPOSIT_USDC);
  });

  it("deposits the whole shortfall when it is larger than the minimum", () => {
    expect(topUpFor(0n, 5_000_000n)).toBe(5_000_000n);
  });
});

describe("AgentWallet", () => {
  it("derives its address from the key", () => {
    const wallet = new AgentWallet({
      privateKey: KEY,
      client: gateway({ wallet: 0n, gateway: 0n }),
    });
    expect(wallet.address).toBe(ADDRESS);
  });

  it("deposits only when the gateway balance is short", async () => {
    const enough = gateway({ wallet: 10_000_000n, gateway: 3_000_000n });
    await new AgentWallet({ privateKey: KEY, client: enough, log: () => {} }).ensureGatewayBalance(
      1_100_000n,
    );
    expect(enough.deposits).toEqual([]);

    const short = gateway({ wallet: 10_000_000n, gateway: 0n });
    const lines: string[] = [];
    await new AgentWallet({
      privateKey: KEY,
      client: short,
      log: (line) => lines.push(line),
      creditPollMs: 0,
    }).ensureGatewayBalance(1_100_000n);
    expect(short.deposits).toEqual(["2"]);
    expect(lines.at(-1)).toBe("gateway balance $2.00 USDC, spendable");
  });

  it("waits for gateway to credit the deposit before calling it spendable", async () => {
    const slow = gateway({ wallet: 10_000_000n, gateway: 0n });
    const wallet = new AgentWallet({
      privateKey: KEY,
      client: slow,
      log: () => {},
      creditPollMs: 0,
    });

    await wallet.ensureGatewayBalance(1_100_000n);

    expect((await slow.getBalances()).gateway.available).toBe(2_000_000n);
  });

  it("gives up when the deposit is never credited", async () => {
    const stuck = gateway({ wallet: 10_000_000n, gateway: 0n }, 200, false);
    const wallet = new AgentWallet({
      privateKey: KEY,
      client: stuck,
      log: () => {},
      creditPollMs: 0,
      creditTimeoutMs: 0,
    });

    await expect(wallet.ensureGatewayBalance(1_100_000n)).rejects.toThrow(/still shows \$0\.00/);
    expect(stuck.deposits).toEqual(["2"]);
  });

  it("points at the faucet when the wallet cannot cover the deposit", async () => {
    const broke = gateway({ wallet: 100_000n, gateway: 0n });
    const wallet = new AgentWallet({ privateKey: KEY, client: broke, log: () => {} });

    await expect(wallet.ensureGatewayBalance(1_100_000n)).rejects.toThrow(/faucet\.circle\.com/);
    expect(broke.deposits).toEqual([]);
  });

  it("shows the 402 first, then pays and returns the body", async () => {
    const lines: string[] = [];
    const client = gateway({ wallet: 0n, gateway: 0n });
    const wallet = new AgentWallet({
      privateKey: KEY,
      client,
      fetch: fetchAnswering(402),
      log: (line) => lines.push(line),
    });

    const paid = await wallet.pay<{ score: number }>(
      "https://x402.example/v1/bounties/fit?bountyId=b1",
    );

    expect(paid.data.score).toBe(80);
    expect(paid.amountUsdc).toBe(500n);
    expect(client.paid).toEqual(["https://x402.example/v1/bounties/fit?bountyId=b1"]);
    expect(lines).toEqual([
      "GET /v1/bounties/fit → 402 payment required",
      "GET /v1/bounties/fit → 200, paid $0.0005 USDC",
    ]);
  });

  it("refuses to pay an endpoint that fails before asking for money", async () => {
    const client = gateway({ wallet: 0n, gateway: 0n });
    const wallet = new AgentWallet({
      privateKey: KEY,
      client,
      fetch: fetchAnswering(503),
      log: () => {},
    });

    await expect(
      wallet.pay("https://x402.example/v1/review", { method: "POST", body: {} }),
    ).rejects.toThrow(/answered 503 before any payment/);
    expect(client.paid).toEqual([]);
  });

  it("treats a paid failure as a failure", async () => {
    const client = gateway({ wallet: 0n, gateway: 0n }, 404);
    const wallet = new AgentWallet({
      privateKey: KEY,
      client,
      fetch: fetchAnswering(402),
      log: () => {},
    });

    await expect(wallet.pay("https://x402.example/v1/bounties/fit?bountyId=nope")).rejects.toThrow(
      /paid for and still failed: 404/,
    );
  });
});
