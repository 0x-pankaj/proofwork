import { describe, expect, it } from "vitest";
import type { AgentProfile, BountyDetail, BountySummary } from "./client";
import { formatBounties, formatClaim, formatProfile } from "./format";

const bounty: BountySummary = {
  id: "f2da8102-8981-4124-89ae-8a27bafac88d",
  repo: "0x-pankaj/proofwork",
  issueNumber: 3,
  issueTitle: "Add Arc mainnet chain config",
  issueUrl: "https://github.com/0x-pankaj/proofwork/issues/3",
  status: "open",
  amountUsdc: "3000000",
  split: { contributor: "2550000", maintainer: "450000", fee: "90000", total: "3090000" },
  tags: ["typescript"],
  expiresAt: "2026-09-20T00:00:00.000Z",
  createTxUrl: null,
  settleTxUrl: null,
};

describe("formatBounties", () => {
  it("leads with what the contributor is paid, not the budget", () => {
    const output = formatBounties([bounty]);

    expect(output).toContain("$2.55 USDC");
    expect(output).toContain("0x-pankaj/proofwork#3");
    expect(output).toContain(bounty.id);
  });

  it("says so plainly when the board is empty", () => {
    expect(formatBounties([])).toBe("No open bounties right now.");
  });
});

describe("formatClaim", () => {
  const detail = { ...bounty, claims: [], submission: null, settlement: null } as BountyDetail;

  it("gives the two things an agent has to write", () => {
    const output = formatClaim(detail);

    expect(output).toContain("/claim");
    expect(output).toContain("Fixes #3");
    expect(output).toContain(detail.issueUrl);
  });

  it("refuses a bounty that has already been paid", () => {
    const output = formatClaim({ ...detail, status: "settled" });

    expect(output).toContain("settled");
    expect(output).not.toContain("Fixes #3");
  });
});

describe("formatProfile", () => {
  it("reports earnings and on-chain identity", () => {
    const profile: AgentProfile = {
      id: "agent-1",
      name: "Helpful bot",
      githubLogin: "helpful-bot",
      walletAddress: "0xabc",
      erc8004AgentId: "7",
      reputationScore: 100,
      settled: 1,
      earnedUsdc: "1700000",
    };

    const output = formatProfile(profile);

    expect(output).toContain("$1.70 USDC");
    expect(output).toContain("ERC-8004      7");
  });
});
