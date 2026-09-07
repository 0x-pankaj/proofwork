import type { Claim } from "@proofwork/db";
import { describe, expect, it } from "vitest";
import { type FitInput, scoreFit } from "./fit";

const NOW = new Date("2026-09-07T12:00:00Z");

function input(overrides: Partial<FitInput> = {}): FitInput {
  return {
    bounty: {
      status: "open",
      amountUsdc: 200_000_000n,
      maintainerRewardBps: 1_500,
      expiresAt: new Date("2026-09-17T12:00:00Z"),
      tags: ["typescript", "arc"],
      issueTitle: "Add Arc mainnet chain config",
    },
    repo: {
      policy: {
        aiContributions: "allowed",
        minStakeUsdc: "1000000",
        autoAccept: true,
        claimTtlHours: 72,
      },
    },
    claims: [],
    skills: [],
    now: NOW,
    ...overrides,
  };
}

describe("scoreFit", () => {
  it("blocks a repository that refuses AI contributions", () => {
    const fit = scoreFit(
      input({
        repo: {
          policy: {
            aiContributions: "none",
            minStakeUsdc: "1000000",
            autoAccept: true,
            claimTtlHours: 72,
          },
        },
      }),
    );

    expect(fit.score).toBe(0);
    expect(fit.blockers).toContain("this repository does not accept AI contributions");
  });

  it("blocks a bounty that has already been paid", () => {
    const fit = scoreFit(input({ bounty: { ...input().bounty, status: "settled" } }));

    expect(fit.score).toBe(0);
    expect(fit.blockers[0]).toContain("settled");
  });

  it("blocks an expired deadline", () => {
    const fit = scoreFit(
      input({ bounty: { ...input().bounty, expiresAt: new Date("2026-09-01T00:00:00Z") } }),
    );

    expect(fit.blockers).toContain("the deadline has passed");
  });

  it("scores an uncontested bounty with room to work above a contested one", () => {
    const claim = { id: "claim-1" } as Claim;

    const alone = scoreFit(input());
    const crowded = scoreFit(input({ claims: [claim, claim, claim] }));

    expect(alone.score).toBeGreaterThan(crowded.score);
    expect(alone.reasons).toContain("nobody else is working on it");
    expect(crowded.reasons.some((reason) => reason.includes("3 other claims"))).toBe(true);
  });

  it("rewards a skill the bounty actually names and penalises one it does not", () => {
    const matching = scoreFit(input({ skills: ["typescript"] }));
    const unrelated = scoreFit(input({ skills: ["solidity"] }));

    expect(matching.score).toBeGreaterThan(unrelated.score);
    expect(matching.reasons).toContain("matches typescript");
  });

  it("says when disclosure is required, without treating it as a blocker", () => {
    const fit = scoreFit(
      input({
        repo: {
          policy: {
            aiContributions: "disclosure",
            minStakeUsdc: "1000000",
            autoAccept: true,
            claimTtlHours: 72,
          },
        },
      }),
    );

    expect(fit.blockers).toEqual([]);
    expect(fit.reasons).toContain("the pull request must say it is AI-assisted");
  });
});
