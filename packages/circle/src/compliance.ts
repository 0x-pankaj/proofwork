/**
 * Screening the address that is about to be paid.
 *
 * Circle screens every developer-controlled wallet transfer itself and returns `DENIED`
 * when it refuses one, so a payout can never bypass compliance. Compliance Engine adds a
 * standalone check we can run *before* submitting, which is better: the contributor gets
 * a clear answer instead of a failed transaction. It is only available to approved
 * accounts, hence the mode.
 */

export const CIRCLE_API_BASE_URL = "https://api.circle.com";

export type ComplianceMode = "engine" | "wallet-only";

export interface ScreeningOutcome {
  approved: boolean;
  /** Why, in words that can be shown to a person. */
  reason: string;
  raw?: unknown;
}

export interface ComplianceConfig {
  apiKey: string;
  /** Circle's chain id, for example `ARC-TESTNET`. */
  chain: string;
  mode?: ComplianceMode;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface ScreeningResponse {
  result?: string;
  decision?: unknown;
  data?: { result?: string; decision?: unknown };
}

export class CircleCompliance {
  private readonly mode: ComplianceMode;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ComplianceConfig) {
    this.mode = config.mode ?? "wallet-only";
    this.baseUrl = config.baseUrl ?? CIRCLE_API_BASE_URL;
    // Bound: workerd rejects `fetch` called with a class instance as its `this`.
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
  }

  async screenAddress(address: string, idempotencyKey?: string): Promise<ScreeningOutcome> {
    if (this.mode === "wallet-only") {
      return {
        approved: true,
        reason: "screened by Circle when the transaction is submitted",
      };
    }

    const response = await this.fetchImpl(`${this.baseUrl}/v1/w3s/compliance/screening/addresses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
        address,
        chain: this.config.chain,
      }),
    });

    // Compliance Engine is entitlement-gated. An account without it must not be blocked
    // from paying people; Circle still screens the transfer itself and denies it there.
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return {
        approved: true,
        reason: "Compliance Engine is not enabled; Circle screens the transaction instead",
      };
    }

    if (!response.ok) {
      throw new Error(`address screening failed: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as ScreeningResponse;
    const payload = body.data ?? body;
    const result = payload.result ?? "APPROVED";

    return {
      approved: result !== "DENIED",
      reason:
        result === "DENIED"
          ? "the payout address was denied by compliance screening"
          : "approved by compliance screening",
      raw: payload,
    };
  }
}
