import { toUsdc } from "@proofwork/chain";
import { describe, expect, it } from "vitest";
import {
  claimedComment,
  commentMarker,
  fundedComment,
  needsPayoutAddressComment,
  pullRequestLinkedComment,
  settledComment,
  statusComment,
} from "./comments";

const BOUNTY_ID = "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b";

describe("comment templates", () => {
  it("ends every comment with the marker that makes it updatable", () => {
    const comment = fundedComment({
      bountyId: BOUNTY_ID,
      issueNumber: 12,
      amountUsdc: toUsdc("200"),
      maintainerRewardUsdc: toUsdc("30"),
      bountyUrl: "https://proofwork.dev/bounties/1",
      fundingTxUrl: "https://testnet.arcscan.app/tx/0xabc",
      expiresAt: new Date("2026-09-20T12:00:00Z"),
    });

    expect(comment.marker).toBe(commentMarker(BOUNTY_ID, "funded"));
    expect(comment.body.endsWith(comment.marker)).toBe(true);
    expect(comment.body).toContain("$200.00 USDC");
    expect(comment.body).toContain("$30.00 USDC");
    expect(comment.body).toContain("Fixes #12");
  });

  it("leaves the review reward out when there is none", () => {
    const linked = pullRequestLinkedComment({
      bountyId: BOUNTY_ID,
      issueNumber: 12,
      amountUsdc: toUsdc("200"),
      contributorUsdc: toUsdc("200"),
      maintainerUsdc: 0n,
      bountyUrl: "https://proofwork.dev/bounties/1",
    });

    expect(linked.body).toContain("$200.00 USDC");
    expect(linked.body).not.toContain("Reviewer");
  });

  it("names both payees and links the transaction once settled", () => {
    const settled = settledComment({
      bountyId: BOUNTY_ID,
      login: "octocat",
      contributorUsdc: toUsdc("170"),
      maintainerUsdc: toUsdc("30"),
      maintainerLogin: "maintainer",
      txUrl: "https://testnet.arcscan.app/tx/0xdead",
      seconds: 3.4,
    });

    expect(settled.body).toContain("$170.00 USDC to @octocat");
    expect(settled.body).toContain("$30.00 USDC to @maintainer");
    expect(settled.body).toContain("https://testnet.arcscan.app/tx/0xdead");
    expect(settled.body).toContain("3.4s");
  });

  it("tells a claimant exactly what is missing", () => {
    const comment = needsPayoutAddressComment({
      bountyId: BOUNTY_ID,
      login: "octocat",
      payoutUrl: "https://proofwork.dev/me",
    });

    expect(comment.body).toContain("@octocat");
    expect(comment.body).toContain("https://proofwork.dev/me");
  });

  it("says who has claimed, or that nobody has", () => {
    const base = {
      bountyId: BOUNTY_ID,
      status: "open",
      amountUsdc: toUsdc("50"),
      bountyUrl: "https://proofwork.dev/bounties/1",
      txUrl: null,
    };

    expect(statusComment({ ...base, claimants: [] }).body).toContain("nobody yet");
    expect(statusComment({ ...base, claimants: ["a", "b"] }).body).toContain("@a, @b");
  });
});

describe("replies addressed to one contributor", () => {
  it("are keyed by login, so concurrent claimants do not overwrite each other", () => {
    const first = claimedComment({
      bountyId: "bounty-1",
      login: "first",
      issueNumber: 4,
      claimExpiresAt: new Date("2026-09-13T00:00:00Z"),
    });
    const second = claimedComment({
      bountyId: "bounty-1",
      login: "second",
      issueNumber: 4,
      claimExpiresAt: new Date("2026-09-13T00:00:00Z"),
    });

    expect(first.marker).not.toBe(second.marker);
    expect(first.marker).toContain("proofwork:bounty-1:first:claimed");
    expect(
      needsPayoutAddressComment({ bountyId: "bounty-1", login: "first", payoutUrl: "https://x" })
        .marker,
    ).toContain("proofwork:bounty-1:first:needs-payout");
  });
});
