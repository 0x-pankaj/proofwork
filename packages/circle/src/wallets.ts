import { CircleHttpClient } from "./http-client";

/**
 * The verifier wallet, which is the only thing allowed to release escrow.
 *
 * Circle holds the key; we ask it to call `settle` and then watch the transaction until
 * it is on chain. Every state Circle can end in is handled explicitly, because "it went
 * quiet" is not an acceptable outcome for a payment.
 */

/** Circle's transaction lifecycle. Anything not listed here is still in flight. */
export const TERMINAL_STATES = ["COMPLETE", "FAILED", "DENIED", "CANCELLED"] as const;

export type FeeLevel = "LOW" | "MEDIUM" | "HIGH";

export interface CircleWalletsConfig {
  apiKey: string;
  entitySecret: string;
  /** Injectable in tests; defaults to a real Circle SDK client. */
  client?: CircleClient;
}

/**
 * The two SDK calls this wrapper makes. Declaring them narrowly means the polling logic
 * — the part that decides whether money moved — can be tested without a network.
 */
export interface CircleClient {
  createContractExecutionTransaction(input: {
    walletId: string;
    contractAddress: string;
    abiFunctionSignature?: string;
    abiParameters?: (string | number | boolean)[];
    callData?: string;
    fee: { type: "level"; config: { feeLevel: FeeLevel } };
    idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } | null } | null>;
  createTransferTransaction(input: {
    walletId: string;
    tokenAddress: string;
    destinationAddress: string;
    amounts: string[];
    fee: { type: "level"; config: { feeLevel: FeeLevel } };
    idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } | null } | null>;
  getTransaction(input: { id: string }): Promise<{
    data?: {
      transaction?: {
        state?: unknown;
        txHash?: string | null;
        errorReason?: unknown;
        transactionScreeningEvaluation?: unknown;
      } | null;
    } | null;
  } | null>;
}

export interface ContractExecutionRequest {
  walletId: string;
  contractAddress: string;
  /**
   * For example `settle(uint256,address,bytes32,bytes32)`. Mutually exclusive with
   * `callData`: pass a signature when the call is written here, and pre-encoded bytes
   * when they came from somewhere that already knows the ABI.
   */
  abiFunctionSignature?: string;
  abiParameters?: (string | number | boolean)[];
  /** Pre-encoded calldata, for example the bytes the API hands a funder's browser. */
  callData?: string;
  /**
   * A UUID Circle uses to collapse retries. Passing the bounty id makes a replayed
   * settlement a no-op at Circle's end as well as ours.
   */
  idempotencyKey?: string;
  feeLevel?: FeeLevel;
}

export interface TransferRequest {
  walletId: string;
  /** The USDC contract. On Arc that is the 6-decimal ERC-20 view, never the native one. */
  tokenAddress: string;
  destinationAddress: string;
  /** 6-decimal integer amount, converted to the decimal string Circle expects. */
  amountUsdc: bigint;
  idempotencyKey?: string;
  feeLevel?: FeeLevel;
}

export interface CircleTransaction {
  id: string;
  state: string;
  txHash?: string;
  /** Circle's reason for a FAILED or DENIED transaction, when it gives one. */
  errorReason?: string;
  /** Present when embedded compliance screening had something to say. */
  screening?: unknown;
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /**
   * Treat `CONFIRMED` as done. The transaction is in a block by then and Arc finalises in
   * about a second, so waiting for `COMPLETE` only makes the comment slower to post.
   */
  acceptConfirmed?: boolean;
}

export class CircleTransactionError extends Error {
  constructor(
    readonly transaction: CircleTransaction,
    message: string,
  ) {
    super(message);
    this.name = "CircleTransactionError";
  }
}

export class CircleWallets {
  private readonly client: CircleClient;

  constructor(config: CircleWalletsConfig) {
    if (config.client) {
      this.client = config.client;
      return;
    }
    this.client = new CircleHttpClient({
      apiKey: config.apiKey,
      entitySecret: config.entitySecret,
    });
  }

  /** Submits a contract call and returns Circle's transaction id to poll. */
  async executeContract(request: ContractExecutionRequest): Promise<{ id: string }> {
    if (!request.callData && !request.abiFunctionSignature) {
      throw new Error("a contract execution needs either a function signature or calldata");
    }

    const response = await this.client.createContractExecutionTransaction({
      walletId: request.walletId,
      contractAddress: request.contractAddress,
      ...(request.callData
        ? { callData: request.callData }
        : {
            abiFunctionSignature: request.abiFunctionSignature,
            abiParameters: request.abiParameters ?? [],
          }),
      fee: { type: "level", config: { feeLevel: request.feeLevel ?? "MEDIUM" } },
      ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
    });

    const id = response?.data?.id;
    if (!id) throw new Error("Circle accepted the contract execution but returned no id");
    return { id };
  }

  /**
   * Sends USDC out of a wallet we hold.
   *
   * Used to give a claim stake back. The escrow itself never goes through here — that is
   * the contract's job — so this only ever moves money the treasury is already holding.
   */
  async transfer(request: TransferRequest): Promise<{ id: string }> {
    if (request.amountUsdc <= 0n) {
      throw new Error("a transfer needs a positive amount");
    }

    const response = await this.client.createTransferTransaction({
      walletId: request.walletId,
      tokenAddress: request.tokenAddress,
      destinationAddress: request.destinationAddress,
      amounts: [decimalUsdc(request.amountUsdc)],
      fee: { type: "level", config: { feeLevel: request.feeLevel ?? "MEDIUM" } },
      ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
    });

    const id = response?.data?.id;
    if (!id) throw new Error("Circle accepted the transfer but returned no id");
    return { id };
  }

  async getTransaction(id: string): Promise<CircleTransaction> {
    const response = await this.client.getTransaction({ id });
    const transaction = response?.data?.transaction;
    if (!transaction) throw new Error(`Circle has no transaction ${id}`);

    return {
      id,
      state: String(transaction.state),
      txHash: transaction.txHash ?? undefined,
      errorReason: transaction.errorReason ? String(transaction.errorReason) : undefined,
      screening: transaction.transactionScreeningEvaluation ?? undefined,
    };
  }

  /**
   * Polls until the transaction settles one way or the other. Throws on timeout rather
   * than returning an ambiguous result, so a caller can never record a payment that may
   * or may not have happened.
   */
  async waitForTransaction(id: string, options: WaitOptions = {}): Promise<CircleTransaction> {
    const timeoutMs = options.timeoutMs ?? 90_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const acceptConfirmed = options.acceptConfirmed ?? true;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const transaction = await this.getTransaction(id);

      if (acceptConfirmed && transaction.state === "CONFIRMED" && transaction.txHash) {
        return transaction;
      }
      if ((TERMINAL_STATES as readonly string[]).includes(transaction.state)) {
        return transaction;
      }
      if (Date.now() >= deadline) {
        throw new CircleTransactionError(
          transaction,
          `Circle transaction ${id} was still ${transaction.state} after ${timeoutMs}ms`,
        );
      }

      await sleep(intervalMs);
    }
  }
}

/** Whether a finished transaction actually moved money. */
/**
 * A 6-decimal bigint as the decimal string Circle's API wants.
 *
 * Deliberately string arithmetic: 1_000_000n is $1.00, and routing that through a float
 * to format it is how a payment loses a cent.
 */
export function decimalUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function succeeded(transaction: CircleTransaction): boolean {
  return (
    (transaction.state === "COMPLETE" || transaction.state === "CONFIRMED") &&
    Boolean(transaction.txHash)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
