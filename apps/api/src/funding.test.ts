import { describe, expect, it } from "vitest";
import { type ReclaimInput, reclaimPlan } from "./funding";

const NOW = new Date("2026-09-08T12:00:00Z");
const LATER = new Date("2026-09-20T12:00:00Z");
const EARLIER = new Date("2026-09-01T12:00:00Z");

function input(overrides: Partial<ReclaimInput> = {}): ReclaimInput {
  return {
    status: "open",
    jobId: 7n,
    expiresAt: LATER,
    activeClaims: 0,
    now: NOW,
    ...overrides,
  };
}

describe("reclaimPlan", () => {
  it("cancels an open bounty nobody has claimed", () => {
    const plan = reclaimPlan(input());
    expect(plan).toMatchObject({ reclaimable: true, kind: "cancel" });
  });

  it("refunds once the deadline has passed", () => {
    const plan = reclaimPlan(input({ expiresAt: EARLIER }));
    expect(plan).toMatchObject({ reclaimable: true, kind: "claimRefund" });
  });

  /**
   * The contract cannot enforce this: Proofwork assigns the provider inside `settle`, so
   * `job.provider` is still zero while a contributor is mid-work and `cancel` would go
   * through. This is the only thing standing between a working contributor and a rug.
   */
  it("refuses to cancel while someone is working on it", () => {
    const plan = reclaimPlan(input({ status: "claimed", activeClaims: 1 }));
    expect(plan.reclaimable).toBe(false);
    expect(plan.reason).toContain("someone is working on it");
  });

  it("still refunds an expired bounty that had claims, because the deadline outranks them", () => {
    const plan = reclaimPlan(input({ status: "claimed", activeClaims: 2, expiresAt: EARLIER }));
    expect(plan).toMatchObject({ reclaimable: true, kind: "claimRefund" });
  });

  it("reclaims a bounty the sweeper already marked expired", () => {
    const plan = reclaimPlan(input({ status: "expired", expiresAt: EARLIER }));
    expect(plan).toMatchObject({ reclaimable: true, kind: "claimRefund" });
  });

  it("has nothing to reclaim before the escrow is funded", () => {
    expect(reclaimPlan(input({ jobId: null })).reclaimable).toBe(false);
  });

  it.each(["settled", "cancelled", "rejected"] as const)(
    "refuses a %s bounty, whose escrow is already gone",
    (status) => {
      expect(reclaimPlan(input({ status })).reclaimable).toBe(false);
    },
  );

  it("refuses while a settlement is in flight, so a refund cannot race a payout", () => {
    expect(reclaimPlan(input({ status: "settling" })).reclaimable).toBe(false);
  });

  it("treats the deadline as reached the instant it arrives", () => {
    const plan = reclaimPlan(input({ expiresAt: NOW, activeClaims: 3 }));
    expect(plan).toMatchObject({ reclaimable: true, kind: "claimRefund" });
  });
});
