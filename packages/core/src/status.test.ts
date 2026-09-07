import { describe, expect, it } from "vitest";
import {
  assertTransition,
  BOUNTY_STATUSES,
  type BountyStatus,
  canTransition,
  holdsEscrow,
  InvalidTransitionError,
  isClaimable,
  isTerminal,
  nextStatuses,
} from "./status";

const ALLOWED: ReadonlyArray<[BountyStatus, BountyStatus]> = [
  ["draft", "funding"],
  ["draft", "cancelled"],
  ["funding", "pending_accept"],
  ["funding", "open"],
  ["funding", "draft"],
  ["pending_accept", "open"],
  ["pending_accept", "rejected"],
  ["pending_accept", "cancelled"],
  ["pending_accept", "expired"],
  ["open", "claimed"],
  ["open", "cancelled"],
  ["open", "expired"],
  ["claimed", "submitted"],
  ["claimed", "open"],
  ["claimed", "expired"],
  ["claimed", "rejected"],
  ["submitted", "settling"],
  ["submitted", "claimed"],
  ["submitted", "expired"],
  ["submitted", "rejected"],
  ["settling", "settled"],
  ["settling", "submitted"],
];

describe("allowed transitions", () => {
  it.each(ALLOWED)("%s can become %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("permits nothing beyond the listed moves", () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}->${to}`));
    for (const from of BOUNTY_STATUSES) {
      for (const to of BOUNTY_STATUSES) {
        expect(canTransition(from, to), `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });
});

describe("forbidden transitions that would cost real money", () => {
  it("never pays a bounty that was never funded", () => {
    expect(canTransition("draft", "settled")).toBe(false);
    expect(canTransition("open", "settled")).toBe(false);
    expect(canTransition("claimed", "settled")).toBe(false);
  });

  it("never pays twice, and never revives a settled bounty", () => {
    for (const to of BOUNTY_STATUSES) {
      expect(canTransition("settled", to), `settled->${to}`).toBe(false);
    }
  });

  it("never reopens a refunded bounty, whose escrow is already gone", () => {
    for (const from of ["rejected", "expired", "cancelled"] as const) {
      expect(nextStatuses(from)).toEqual([]);
    }
  });

  it("refuses to cancel work someone has already started", () => {
    expect(canTransition("claimed", "cancelled")).toBe(false);
    expect(canTransition("submitted", "cancelled")).toBe(false);
    expect(canTransition("settling", "cancelled")).toBe(false);
  });

  it("refuses to skip payment and expire a bounty mid-settlement", () => {
    expect(canTransition("settling", "expired")).toBe(false);
    expect(canTransition("settling", "rejected")).toBe(false);
  });

  it("reports what went wrong", () => {
    expect(() => assertTransition("settled", "open")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("settled", "open")).toThrow(/cannot move from settled to open/);
  });
});

describe("status predicates", () => {
  it("marks exactly the four end states as terminal", () => {
    expect(BOUNTY_STATUSES.filter(isTerminal)).toEqual([
      "settled",
      "rejected",
      "expired",
      "cancelled",
    ]);
  });

  it("knows when money is sitting in escrow", () => {
    expect(BOUNTY_STATUSES.filter(holdsEscrow)).toEqual([
      "pending_accept",
      "open",
      "claimed",
      "submitted",
      "settling",
    ]);
  });

  it("allows claiming while open and while someone else holds it", () => {
    expect(BOUNTY_STATUSES.filter(isClaimable)).toEqual(["open", "claimed"]);
  });

  it("agrees that a terminal bounty holds no escrow", () => {
    for (const status of BOUNTY_STATUSES.filter(isTerminal)) {
      expect(holdsEscrow(status)).toBe(false);
    }
  });
});
