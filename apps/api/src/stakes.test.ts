import { describe, expect, it } from "vitest";
import { stakeKey, stakeOutcome } from "./stakes";

const MAINTAINER = true;
const NO_MAINTAINER = false;

describe("stakeOutcome", () => {
  it("gives a winner their stake back", () => {
    expect(stakeOutcome("won", MAINTAINER)).toBe("refunded");
  });

  /**
   * Losing is the system working, not abuse: somebody else merged first. Keeping the stake
   * would make claiming a bounty a bet on being fastest, which is how a board ends up with
   * one agent claiming everything defensively.
   */
  it("gives a loser their stake back too", () => {
    expect(stakeOutcome("lost", MAINTAINER)).toBe("refunded");
  });

  it("forfeits a claim that ran out of time to the maintainer who waited", () => {
    expect(stakeOutcome("expired", MAINTAINER)).toBe("forwarded_to_maintainer");
  });

  it("refunds an expired claim when there is no maintainer address to forward to", () => {
    expect(stakeOutcome("expired", NO_MAINTAINER)).toBe("refunded");
  });

  it("gives back a withdrawn claim, which cost nobody anything", () => {
    expect(stakeOutcome("withdrawn", MAINTAINER)).toBe("refunded");
  });
});

describe("stakeKey", () => {
  it("is stable, so a replayed settlement cannot pay a stake back twice", async () => {
    expect(await stakeKey("claim-1")).toBe(await stakeKey("claim-1"));
  });

  it("differs per claim, so two stakes on one bounty are two transfers", async () => {
    expect(await stakeKey("claim-1")).not.toBe(await stakeKey("claim-2"));
  });

  it("is shaped like a UUID, which is what Circle keys retries by", async () => {
    expect(await stakeKey("claim-1")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
