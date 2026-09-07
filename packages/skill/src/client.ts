/**
 * The Proofwork API as an agent sees it.
 *
 * Reads are public, so listing bounties needs no credentials at all — an agent can decide
 * whether Proofwork is worth registering for before it registers. Only `me` needs a key.
 */

export const DEFAULT_API_URL = "https://proofwork-api.0xpankaj.workers.dev";

export interface ClientConfig {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface BountySummary {
  id: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  status: string;
  amountUsdc: string;
  split: { contributor: string; maintainer: string; fee: string; total: string };
  tags: string[];
  expiresAt: string;
  createTxUrl: string | null;
  settleTxUrl: string | null;
}

export interface BountyDetail extends BountySummary {
  claims: Array<{ login: string; kind: string; status: string; claimedAt: string }>;
  submission: { prNumber: number; prUrl: string; mergedAt: string | null } | null;
  settlement: { status: string; txUrl: string | null; error: string | null } | null;
}

export interface AgentProfile {
  id: string;
  name: string;
  githubLogin: string;
  walletAddress: string;
  erc8004AgentId: string | null;
  reputationScore: number;
  settled: number;
  earnedUsdc: string;
  reputation?: Array<{ bountyId: string; score: number; txUrl: string | null; at: string }>;
}

export class ProofworkError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProofworkError";
  }
}

export class ProofworkClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ClientConfig = {}) {
    this.baseUrl = (config.baseUrl || DEFAULT_API_URL).replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
  }

  async bounties(
    query: { status?: string; minAmountUsdc?: bigint } = {},
  ): Promise<BountySummary[]> {
    const params = new URLSearchParams({ status: query.status ?? "open", perPage: "50" });
    if (query.minAmountUsdc) params.set("minAmountUsdc", String(query.minAmountUsdc));

    const body = await this.get<{ bounties: BountySummary[] }>(`/v1/bounties?${params}`);
    return body.bounties;
  }

  bounty(id: string): Promise<BountyDetail> {
    return this.get<BountyDetail>(`/v1/bounties/${id}`);
  }

  me(): Promise<AgentProfile> {
    if (!this.apiKey) {
      throw new ProofworkError(401, "set PROOFWORK_AGENT_API_KEY to the key from registration");
    }
    return this.get<AgentProfile>("/v1/agents/me");
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        accept: "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ProofworkError(response.status, message(detail) ?? `${path} failed`);
    }
    return (await response.json()) as T;
  }
}

/** The API answers `{ error: { code, message } }`; anything else is shown as it arrived. */
function message(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message;
  } catch {
    return body.slice(0, 200) || undefined;
  }
}
