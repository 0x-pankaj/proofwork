import type { BountyDetail } from "@proofwork/skill";
import { describe, expect, it } from "vitest";
import { pullRequestBody } from "./pull-request";

const bounty = {
  id: "bounty-1",
  repo: "0x-pankaj/proofwork",
  issueNumber: 3,
  issueTitle: "Add Arc mainnet chain config",
  issueUrl: "https://github.com/0x-pankaj/proofwork/issues/3",
  status: "open",
  amountUsdc: "3000000",
  split: { contributor: "2550000", maintainer: "450000", fee: "90000", total: "3090000" },
  tags: [],
  expiresAt: "2026-09-20T00:00:00.000Z",
  createTxUrl: null,
  settleTxUrl: null,
  claims: [],
  submission: null,
  settlement: null,
} satisfies BountyDetail;

describe("pullRequestBody", () => {
  const body = pullRequestBody(bounty, "reference agent");

  it("links the pull request to the issue, which is what pays anyone", () => {
    expect(body).toContain("Fixes #3");
  });

  it("discloses that it is AI-assisted, which some repositories require", () => {
    expect(body).toContain("AI-assisted:");
  });

  it("tells the maintainer what merging pays out", () => {
    expect(body).toContain("$3.00 USDC");
  });
});
