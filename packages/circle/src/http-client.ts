import { CIRCLE_API_BASE_URL } from "./compliance";
import type { CircleClient, FeeLevel } from "./wallets";

/**
 * Circle's REST API over plain `fetch`.
 *
 * The official SDK is axios-based, and axios sets `cache: "default"` on its requests,
 * which Cloudflare Workers reject outright ("Unsupported cache mode: default"). Since the
 * API is a handful of JSON calls and the entity-secret encryption is Web Crypto either
 * way, talking to it directly is both smaller and portable: the same client runs on
 * workerd, Bun and Node.
 */

const CONTRACT_EXECUTION_PATH = "/v1/w3s/developer/transactions/contractExecution";
const PUBLIC_KEY_PATH = "/v1/w3s/config/entity/publicKey";
const TRANSFER_PATH = "/v1/w3s/developer/transactions/transfer";
const TRANSACTION_PATH = "/v1/w3s/transactions";

export interface CircleHttpConfig {
  apiKey: string;
  /** 32 bytes, hex encoded. Circle never stores it; it is encrypted per request. */
  entitySecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Extra attempts after a transient failure. Two by default: three tries in all. */
  retries?: number;
  /** First back-off; doubles each attempt. */
  retryDelayMs?: number;
}

/** Answers that mean "not now" rather than "no". Everything else is final. */
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export class CircleHttpClient implements CircleClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** Circle's key does not rotate mid-process, so it is fetched and imported once. */
  private encryptionKey: Promise<CryptoKey> | undefined;

  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly config: CircleHttpConfig) {
    if (!config.apiKey) throw new Error("CIRCLE_API_KEY is required");
    if (!config.entitySecret) throw new Error("CIRCLE_ENTITY_SECRET is required");
    this.baseUrl = config.baseUrl ?? CIRCLE_API_BASE_URL;
    // Bound: workerd rejects `fetch` called with a class instance as its `this`.
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
    this.retries = config.retries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 500;
  }

  async createContractExecutionTransaction(input: {
    walletId: string;
    contractAddress: string;
    abiFunctionSignature?: string;
    abiParameters?: (string | number | boolean)[];
    callData?: string;
    fee: { type: "level"; config: { feeLevel: FeeLevel } };
    idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } | null } | null> {
    const { fee, ...rest } = input;
    // Fixed before the first attempt, so a retry is the same request to Circle.
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
    return this.send<{ data?: { id?: string } | null }>(
      "POST",
      CONTRACT_EXECUTION_PATH,
      async () => ({
        ...rest,
        // The REST API takes a flat `feeLevel`; the nested shape is the SDK's own.
        feeLevel: fee.config.feeLevel,
        idempotencyKey,
        // A fresh ciphertext per attempt; Circle rejects a replayed one.
        entitySecretCiphertext: await this.entitySecretCiphertext(),
      }),
    );
  }

  async createTransferTransaction(input: {
    walletId: string;
    /** Circle rejects a token address without the chain it lives on. */
    blockchain: string;
    tokenAddress: string;
    destinationAddress: string;
    /** Decimal strings, as Circle wants them — not the 6-decimal integer. */
    amounts: string[];
    fee: { type: "level"; config: { feeLevel: FeeLevel } };
    idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } | null } | null> {
    const { fee, ...rest } = input;
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
    return this.send<{ data?: { id?: string } | null }>("POST", TRANSFER_PATH, async () => ({
      ...rest,
      feeLevel: fee.config.feeLevel,
      idempotencyKey,
      entitySecretCiphertext: await this.entitySecretCiphertext(),
    }));
  }

  async getTransaction(input: { id: string }): Promise<{
    data?: { transaction?: Record<string, unknown> | null } | null;
  } | null> {
    return this.send(`GET`, `${TRANSACTION_PATH}/${input.id}`);
  }

  /** The entity secret, RSA-OAEP encrypted to Circle's public key, base64 encoded. */
  async entitySecretCiphertext(): Promise<string> {
    const key = await this.publicKey();
    const encrypted = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      key,
      hexToBytes(this.config.entitySecret),
    );
    return base64(new Uint8Array(encrypted));
  }

  private publicKey(): Promise<CryptoKey> {
    if (!this.encryptionKey) {
      this.encryptionKey = (async () => {
        const response = await this.send<{ data?: { publicKey?: string } }>("GET", PUBLIC_KEY_PATH);
        const pem = response?.data?.publicKey;
        if (!pem) throw new Error("Circle did not return an entity public key");

        return crypto.subtle.importKey(
          "spki",
          spkiFromPem(pem),
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"],
        );
      })();
    }
    return this.encryptionKey;
  }

  /**
   * One call to Circle, retried on the answers that mean "not now". A POST is retried too:
   * both carry an idempotency key, so Circle treats the retry as the same request, and
   * the body is rebuilt each time so the entity-secret ciphertext is never replayed.
   */
  private async send<T>(method: string, path: string, body?: () => Promise<unknown>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= this.retries;
      let response: Response;
      try {
        const payload = body ? JSON.stringify(await body()) : undefined;
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            accept: "application/json",
            ...(payload === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(payload === undefined ? {} : { body: payload }),
        });
      } catch (error) {
        if (last) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `circle ${method} ${path} unreachable after ${attempt + 1} attempts: ${detail}`,
          );
        }
        await this.backOff(attempt);
        continue;
      }

      if (response.ok) return (await response.json()) as T;

      const detail = await response.text();
      if (TRANSIENT.has(response.status) && !last) {
        await this.backOff(attempt);
        continue;
      }
      throw new Error(`circle ${method} ${path} failed: ${response.status} ${detail}`);
    }
  }

  private backOff(attempt: number): Promise<void> {
    const delay = this.retryDelayMs * 2 ** attempt;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function spkiFromPem(pem: string): Uint8Array<ArrayBuffer> {
  const body = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(pem)?.[1];
  if (!body) throw new Error("Circle's public key is not a PEM SubjectPublicKeyInfo");

  const binary = atob(body.replace(/\s+/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("the entity secret is not hex encoded");

  const bytes = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
