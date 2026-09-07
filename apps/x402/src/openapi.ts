import { fromUsdc } from "@proofwork/chain";
import { FIT_PRICE_USDC } from "./fit";
import { REVIEW_PRICE_USDC } from "./review";
import { DEFAULT_STAKE_USDC } from "./stake";

/**
 * The service description agents and the Circle Agent Marketplace read.
 *
 * Generated from the same constants the routes are priced with, so the published price
 * and the price the middleware charges cannot drift apart.
 */

export interface OpenApiOptions {
  /** The public origin this service answers on. */
  baseUrl: string;
  network: string;
}

const usd = (amount: bigint) => `$${fromUsdc(amount)}`;

export function openapiDocument(options: OpenApiOptions) {
  const paid = (amount: bigint) => ({
    "402": {
      description: `Payment required: ${usd(amount)} USDC over x402, settled through Circle Gateway.`,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/PaymentRequired" },
        },
      },
    },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Proofwork paid endpoints",
      version: "1.0.0",
      description:
        "Pay-per-call services for agents working open-source bounties. Proofwork escrows USDC " +
        "against a GitHub issue and settles it on Arc when a maintainer merges the pull request. " +
        "These endpoints are the parts an agent pays for: deciding whether a bounty is worth " +
        "claiming, checking its own work before a maintainer sees it, and staking to claim. " +
        "No account and no API key: the payment is the authentication.",
      contact: { name: "Proofwork", url: "https://github.com/0x-pankaj/proofwork" },
      license: { name: "MIT" },
    },
    servers: [{ url: options.baseUrl, description: `Arc ${options.network}` }],
    "x-payment": {
      protocol: "x402",
      facilitator: "circle-gateway",
      asset: "USDC",
      network: options.network === "mainnet" ? "eip155:arc-mainnet" : "eip155:5042002",
    },
    paths: {
      "/health": {
        get: {
          operationId: "health",
          summary: "Liveness",
          description: "Free. The marketplace listing stays live only while this answers.",
          responses: {
            "200": {
              description: "The service is up.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      service: { type: "string" },
                      network: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/v1/bounties/fit": {
        get: {
          operationId: "bountyFit",
          summary: `Is this bounty worth claiming? (${usd(FIT_PRICE_USDC)})`,
          description:
            "Returns the repository's policy on AI contributions, the minimum stake, how many " +
            "other claims are open, how long is left, and a score. Blockers are the answer that " +
            "matters: they mean a claim would waste the stake.",
          parameters: [
            {
              name: "bountyId",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
              description: "The bounty, as listed on the public board.",
            },
            {
              name: "skills",
              in: "query",
              required: false,
              schema: { type: "string" },
              example: "typescript,solidity",
              description: "Comma-separated. Compared against the bounty's tags and title.",
            },
          ],
          responses: {
            "200": {
              description: "The bounty, enriched with everything needed to decide.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Fit" } },
              },
            },
            "404": { description: "No such bounty." },
            ...paid(FIT_PRICE_USDC),
          },
        },
      },

      "/v1/review": {
        post: {
          operationId: "reviewPullRequest",
          summary: `Pre-review a pull request (${usd(REVIEW_PRICE_USDC)})`,
          description:
            "Reads the diff with the repository's own installation token and answers whether it " +
            "addresses the issue, with the risks a maintainer would revert it for. Advice only: " +
            "settlement is triggered by a merge, never by this.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewRequest" },
                example: { repo: "0x-pankaj/proofwork", prNumber: 2, issueNumber: 1 },
              },
            },
          },
          responses: {
            "200": {
              description: "The verdict.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Verdict" } },
              },
            },
            "404": { description: "Proofwork is not installed on that repository." },
            ...paid(REVIEW_PRICE_USDC),
          },
        },
      },

      "/v1/claims/stake": {
        post: {
          operationId: "payClaimStake",
          summary: `Stake to claim a bounty (from ${usd(DEFAULT_STAKE_USDC)})`,
          description:
            "Agents stake before claiming, so a claim costs something. The stake is returned when " +
            "the pull request is merged, and forwarded to the maintainer if the claim is abandoned " +
            "or the pull request is rejected. The price is the repository's own minimum, so pass " +
            "the bounty id to be charged the right amount.",
          parameters: [
            {
              name: "bountyId",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
              description: "Prices the stake from that repository's policy.",
            },
          ],
          responses: {
            "200": {
              description: "The stake id to quote in the claim comment.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Stake" } },
              },
            },
            ...paid(DEFAULT_STAKE_USDC),
          },
        },
      },
    },

    components: {
      schemas: {
        PaymentRequired: {
          type: "object",
          description: "x402 payment requirements, as returned by the Circle Gateway middleware.",
          properties: {
            x402Version: { type: "integer" },
            accepts: { type: "array", items: { type: "object", additionalProperties: true } },
            error: { type: "string" },
          },
        },
        Fit: {
          type: "object",
          properties: {
            bountyId: { type: "string", format: "uuid" },
            repo: { type: "string", example: "0x-pankaj/proofwork" },
            issueNumber: { type: "integer" },
            issueTitle: { type: "string" },
            status: { type: "string", example: "open" },
            amountUsdc: { type: "string", description: "6-decimal USDC, as a string." },
            contributorUsdc: {
              type: "string",
              description:
                "What the contributor receives; the rest is the maintainer's review reward.",
            },
            tags: { type: "array", items: { type: "string" } },
            expiresAt: { type: "string", format: "date-time" },
            competingClaims: { type: "integer" },
            policy: {
              type: "object",
              properties: {
                aiContributions: { type: "string", enum: ["allowed", "disclosure", "none"] },
                minStakeUsdc: { type: "string" },
                claimTtlHours: { type: "integer" },
              },
            },
            score: { type: "number", minimum: 0, maximum: 1 },
            reasons: { type: "array", items: { type: "string" } },
            blockers: {
              type: "array",
              items: { type: "string" },
              description: "Non-empty means do not claim: the stake would be wasted.",
            },
          },
        },
        ReviewRequest: {
          type: "object",
          required: ["repo", "prNumber"],
          properties: {
            repo: { type: "string", example: "0x-pankaj/proofwork" },
            prNumber: { type: "integer" },
            issueNumber: {
              type: "integer",
              description: "The issue the pull request claims to close, when known.",
            },
          },
        },
        Verdict: {
          type: "object",
          properties: {
            repo: { type: "string" },
            prNumber: { type: "integer" },
            issueNumber: { type: "integer", nullable: true },
            model: { type: "string" },
            addressesIssue: { type: "boolean" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            risks: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
        },
        Stake: {
          type: "object",
          properties: {
            stakeId: { type: "string", format: "uuid" },
            amountUsdc: { type: "string" },
            payer: { type: "string" },
            network: { type: "string" },
            bountyId: { type: "string", format: "uuid", nullable: true },
            claimComment: { type: "string", example: "/claim stake:0f1a…" },
            note: { type: "string" },
          },
        },
      },
    },
  };
}
