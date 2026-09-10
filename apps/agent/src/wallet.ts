import { GatewayClient } from "@circle-fin/x402-batching/client";
import { formatUsdc, fromUsdc, rpcUrlFor, txUrl, X402_CHAIN_TESTNET } from "@proofwork/chain";
import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The agent's own money.
 *
 * Proofwork's paid endpoints are bought per call over x402, settled through Circle Gateway.
 * The agent deposits USDC into Gateway once, on Arc, and from then on every call is an
 * offchain signature: no gas, no account, no API key. The same key signs the registration
 * message, so the wallet that pays the stake is provably the wallet the payout goes to.
 */

/** What the wallet needs from Circle's client, narrow enough for a test to stand one in. */
export interface GatewayLike {
  getBalances(): Promise<{ wallet: { balance: bigint }; gateway: { available: bigint } }>;
  deposit(amount: string): Promise<{ depositTxHash: Hex; amount: bigint }>;
  pay<T>(
    url: string,
    options?: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> },
  ): Promise<{ data: T; amount: bigint; status: number }>;
}

export interface WalletOptions {
  privateKey: Hex;
  rpcUrl?: string;
  client?: GatewayLike;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

export interface PayOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

export interface Paid<T> {
  data: T;
  amountUsdc: bigint;
  status: number;
}

/** Deposits are made in whole dollars, so one covers a run rather than a call. */
export const MIN_DEPOSIT_USDC = 2_000_000n;

/** How much to move into Gateway so that at least `floor` is available. */
export function topUpFor(available: bigint, floor: bigint): bigint {
  if (available >= floor) return 0n;
  const short = floor - available;
  return short > MIN_DEPOSIT_USDC ? short : MIN_DEPOSIT_USDC;
}

export class AgentWallet {
  readonly address: Hex;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly client: GatewayLike;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;

  constructor(options: WalletOptions) {
    this.account = privateKeyToAccount(options.privateKey);
    this.address = this.account.address;
    this.client =
      options.client ??
      new GatewayClient({
        chain: X402_CHAIN_TESTNET,
        privateKey: options.privateKey,
        rpcUrl: options.rpcUrl ?? rpcUrlFor("testnet"),
      });
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.log = options.log ?? console.log;
  }

  /** EIP-191, which is what registration and the payout binding check. */
  signMessage(message: string): Promise<Hex> {
    return this.account.signMessage({ message });
  }

  /**
   * Makes sure at least `floor` is spendable in Gateway, depositing from the wallet's
   * onchain USDC when it is not. On Arc that USDC is also the gas, so a wallet fresh from
   * the faucet can do this with nothing else.
   */
  async ensureGatewayBalance(floor: bigint): Promise<void> {
    const balances = await this.client.getBalances();
    const topUp = topUpFor(balances.gateway.available, floor);
    if (topUp === 0n) {
      this.log(`gateway balance ${formatUsdc(balances.gateway.available)}, enough for this run`);
      return;
    }

    if (balances.wallet.balance < topUp) {
      throw new Error(
        `the agent wallet ${this.address} holds ${formatUsdc(balances.wallet.balance)} and needs ` +
          `${formatUsdc(topUp)} to deposit into Gateway. Top it up at https://faucet.circle.com`,
      );
    }

    this.log(`depositing ${formatUsdc(topUp)} into Gateway`);
    const result = await this.client.deposit(formatUnits(topUp, 6));
    this.log(`deposited ${formatUsdc(result.amount)} — ${txUrl(result.depositTxHash)}`);
  }

  /**
   * Buys one call. The unpaid request is made first, on purpose: the 402 it gets back is
   * the whole point of the protocol, and it should be seen, not assumed. Then the same
   * request is paid for and the body comes back.
   */
  async pay<T>(url: string, options: PayOptions = {}): Promise<Paid<T>> {
    const method = options.method ?? "GET";
    const label = `${method} ${new URL(url).pathname}`;

    const unpaid = await this.fetchImpl(url, {
      method,
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    if (unpaid.status !== 402) {
      const detail = (await unpaid.text()).slice(0, 200);
      throw new Error(
        `${label} answered ${unpaid.status} before any payment was offered: ${detail}`,
      );
    }
    this.log(`${label} → 402 payment required`);

    const result = await this.client.pay<T>(url, {
      method,
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    if (result.status >= 400) {
      throw new Error(
        `${label} was paid for and still failed: ${result.status} ${detail(result.data)}`,
      );
    }
    this.log(`${label} → ${result.status}, paid ${usd(result.amount)}`);

    return { data: result.data, amountUsdc: result.amount, status: result.status };
  }
}

/** Sub-cent prices shown exactly: a fit score costs $0.0005, not "$0.00". */
function usd(amount: bigint): string {
  const [whole, fraction = ""] = fromUsdc(amount).split(".");
  return `$${whole}.${fraction.padEnd(2, "0")} USDC`;
}

function detail(body: unknown): string {
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return String(body);
  }
}
