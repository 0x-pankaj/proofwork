import { describe, expect, it, vi } from "vitest";
import type {
  SettlementBounty,
  SettlementClaim,
  SettlementContext,
  SettlementPorts,
  SettlementSubmission,
} from "./settlement";
import { MERGED_REPUTATION_SCORE, settleBounty, splitFor } from "./settlement";

const MERGE_SHA = "9f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d";

const bounty = (over: Partial<SettlementBounty> = {}): SettlementBounty => ({
  id: "b1",
  status: "submitted",
  jobId: 7n,
  amountUsdc: 200_000_000n,
  feeUsdc: 6_000_000n,
  maintainerAddress: "0xmaintainer",
  maintainerRewardBps: 1500,
  repoFullName: "circlefin/arc-sdk",
  ...over,
});

const claim = (over: Partial<SettlementClaim> = {}): SettlementClaim => ({
  id: "c1",
  githubLogin: "octocat",
  payoutAddress: "0xcontributor",
  claimantKind: "user",
  agentId: null,
  ...over,
});

const submission = (over: Partial<SettlementSubmission> = {}): SettlementSubmission => ({
  prNumber: 12,
  mergeSha: MERGE_SHA,
  ...over,
});

function fakePorts(context: SettlementContext | undefined, over: Partial<SettlementPorts> = {}) {
  const ports: SettlementPorts = {
    load: vi.fn(async () => context),
    screen: vi.fn(async () => ({ approved: true })),
    markSettling: vi.fn(async () => {}),
    execute: vi.fn(async () => ({ circleTxId: "circle-1" })),
    confirm: vi.fn(async () => ({ status: "complete" as const, txHash: "0xtx" })),
    recordSuccess: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    comment: vi.fn(async () => {}),
    recordReputation: vi.fn(async () => {}),
    ...over,
  };
  return ports;
}

describe("split", () => {
  it("matches the worked example: 200 dollars, 15% review share, 3% fee", () => {
    expect(splitFor(200_000_000n, 1500, 6_000_000n)).toEqual({
      contributor: 170_000_000n,
      maintainer: 30_000_000n,
      fee: 6_000_000n,
      total: 206_000_000n,
    });
  });

  it("gives the contributor everything when there is no review share", () => {
    const split = splitFor(200_000_000n, 0, 0n);
    expect(split.contributor).toBe(200_000_000n);
    expect(split.maintainer).toBe(0n);
  });

  it("never loses a unit to rounding", () => {
    for (const amount of [1n, 7n, 999n, 123_456_789n]) {
      for (const bps of [0, 1, 300, 1500, 5000]) {
        const split = splitFor(amount, bps, 0n);
        expect(split.contributor + split.maintainer).toBe(amount);
      }
    }
  });
});

describe("settling a merged pull request", () => {
  it("pays out and records the transaction", async () => {
    const ports = fakePorts({ bounty: bounty(), claim: claim(), submission: submission() });
    const result = await settleBounty("b1", ports);

    expect(result.kind).toBe("settled");
    if (result.kind !== "settled") return;
    expect(result.txHash).toBe("0xtx");
    expect(result.split.contributor).toBe(170_000_000n);
    expect(ports.markSettling).toHaveBeenCalledWith("b1");
    expect(ports.recordSuccess).toHaveBeenCalledWith({
      bountyId: "b1",
      txHash: "0xtx",
      circleTxId: "circle-1",
    });
  });

  it("proves on chain which pull request was paid for", async () => {
    const ports = fakePorts({ bounty: bounty(), claim: claim(), submission: submission() });
    await settleBounty("b1", ports);

    const request = vi.mocked(ports.execute).mock.calls[0]?.[0];
    expect(request?.jobId).toBe(7n);
    expect(request?.provider).toBe("0xcontributor");
    expect(request?.deliverable).toMatch(/^0x[0-9a-f]{64}$/);
    expect(request?.reason).not.toBe(request?.deliverable);
  });

  it("leaves reputation for agents and not for people", async () => {
    const agentPorts = fakePorts({
      bounty: bounty(),
      claim: claim({ claimantKind: "agent", agentId: "a1" }),
      submission: submission(),
    });
    await settleBounty("b1", agentPorts);
    expect(agentPorts.recordReputation).toHaveBeenCalledWith({
      agentId: "a1",
      bountyId: "b1",
      score: MERGED_REPUTATION_SCORE,
    });

    const humanPorts = fakePorts({ bounty: bounty(), claim: claim(), submission: submission() });
    await settleBounty("b1", humanPorts);
    expect(humanPorts.recordReputation).not.toHaveBeenCalled();
  });
});

describe("refusing to pay", () => {
  it("skips when there is nothing to settle", async () => {
    const result = await settleBounty("b1", fakePorts(undefined));
    expect(result).toEqual({
      kind: "skipped",
      reason: "bounty, claim or submission not found",
    });
  });

  it("skips a bounty that has already been paid, so a redelivered webhook is harmless", async () => {
    const ports = fakePorts({
      bounty: bounty({ status: "settled" }),
      claim: claim(),
      submission: submission(),
    });
    const result = await settleBounty("b1", ports);

    expect(result.kind).toBe("skipped");
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("skips when funding never confirmed", async () => {
    const ports = fakePorts({
      bounty: bounty({ jobId: null }),
      claim: claim(),
      submission: submission(),
    });
    expect((await settleBounty("b1", ports)).kind).toBe("skipped");
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("skips when the pull request was never merged", async () => {
    const ports = fakePorts({
      bounty: bounty(),
      claim: claim(),
      submission: submission({ mergeSha: null }),
    });
    expect((await settleBounty("b1", ports)).kind).toBe("skipped");
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("skips when the contributor has nowhere to be paid", async () => {
    const ports = fakePorts({
      bounty: bounty(),
      claim: claim({ payoutAddress: null }),
      submission: submission(),
    });
    const result = await settleBounty("b1", ports);
    expect(result).toMatchObject({ kind: "skipped" });
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("skips when a review reward is promised but the maintainer has no address", async () => {
    const ports = fakePorts({
      bounty: bounty({ maintainerAddress: null }),
      claim: claim(),
      submission: submission(),
    });
    expect((await settleBounty("b1", ports)).kind).toBe("skipped");
    expect(ports.execute).not.toHaveBeenCalled();
  });

  it("blocks a payout that fails compliance screening", async () => {
    const ports = fakePorts(
      { bounty: bounty(), claim: claim(), submission: submission() },
      { screen: vi.fn(async () => ({ approved: false, reason: "sanctioned address" })) },
    );
    const result = await settleBounty("b1", ports);

    expect(result).toEqual({ kind: "blocked", reason: "sanctioned address" });
    expect(ports.execute).not.toHaveBeenCalled();
    expect(ports.recordFailure).toHaveBeenCalled();
  });
});

describe("when the chain misbehaves", () => {
  it("records a failure if the transaction cannot be submitted", async () => {
    const ports = fakePorts(
      { bounty: bounty(), claim: claim(), submission: submission() },
      {
        execute: vi.fn(async () => {
          throw new Error("verifier wallet out of gas");
        }),
      },
    );
    const result = await settleBounty("b1", ports);

    expect(result).toEqual({ kind: "failed", error: "verifier wallet out of gas" });
    expect(ports.recordSuccess).not.toHaveBeenCalled();
  });

  it("records a failure if the transaction is submitted but never completes", async () => {
    const ports = fakePorts(
      { bounty: bounty(), claim: claim(), submission: submission() },
      { confirm: vi.fn(async () => ({ status: "failed" as const, error: "reverted" })) },
    );
    const result = await settleBounty("b1", ports);

    expect(result).toEqual({ kind: "failed", error: "reverted" });
    expect(ports.recordFailure).toHaveBeenCalledWith({
      bountyId: "b1",
      error: "reverted",
      circleTxId: "circle-1",
    });
  });

  it("still counts as paid when the follow-up comment fails", async () => {
    const ports = fakePorts(
      {
        bounty: bounty(),
        claim: claim({ claimantKind: "agent", agentId: "a1" }),
        submission: submission(),
      },
      {
        comment: vi.fn(async () => {
          throw new Error("github is down");
        }),
        recordReputation: vi.fn(async () => {
          throw new Error("registry call reverted");
        }),
      },
    );
    const result = await settleBounty("b1", ports);

    expect(result.kind).toBe("settled");
    expect(ports.recordSuccess).toHaveBeenCalled();
  });
});
