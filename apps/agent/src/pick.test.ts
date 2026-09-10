import type { BountyDetail, BountySummary } from "@proofwork/skill";
import { describe, expect, it } from "vitest";
import { type BountySource, type FitVerdict, pick } from "./pick";

function bounty(id: string, contributor: string, activeClaims = 0): BountyDetail {
  return {
    id,
    repo: "0x-pankaj/proofwork",
    issueNumber: Number(id.replace(/\D/g, "")),
    issueTitle: `Issue ${id}`,
    issueUrl: `https://github.com/0x-pankaj/proofwork/issues/${id}`,
    status: "open",
    amountUsdc: contributor,
    split: { contributor, maintainer: "0", fee: "0", total: contributor },
    tags: [],
    expiresAt: "2026-09-20T00:00:00.000Z",
    createTxUrl: null,
    settleTxUrl: null,
    claims: Array.from({ length: activeClaims }, (_, i) => ({
      login: `agent-${i}`,
      kind: "agent",
      status: "active",
      claimedAt: "2026-09-10T00:00:00.000Z",
    })),
    submission: null,
    settlement: null,
  };
}

function source(
  all: BountyDetail[],
  verdicts: Record<string, FitVerdict> = {},
): BountySource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async bounties() {
      return all as BountySummary[];
    },
    async bounty(id) {
      const found = all.find((b) => b.id === id);
      if (!found) throw new Error(`no bounty ${id}`);
      return found;
    },
    ...(Object.keys(verdicts).length > 0
      ? {
          async fit(id: string) {
            asked.push(id);
            return verdicts[id] ?? { score: 1, reasons: [], blockers: [] };
          },
        }
      : {}),
  };
}

describe("pick", () => {
  it("takes the richest bounty when it has no way to ask about fit", async () => {
    const chosen = await pick(
      source([bounty("b1", "1000000"), bounty("b2", "5000000")]),
      undefined,
    );
    expect(chosen?.id).toBe("b2");
  });

  it("pays to ask, and passes on a bounty the fit endpoint blocks", async () => {
    const src = source([bounty("b1", "1000000"), bounty("b2", "5000000")], {
      b2: { score: 0, reasons: [], blockers: ["repository does not accept AI contributions"] },
      b1: { score: 0.8, reasons: ["no competing claims"], blockers: [] },
    });
    const lines: string[] = [];

    const chosen = await pick(src, undefined, (line) => lines.push(line));

    expect(chosen?.id).toBe("b1");
    expect(src.asked).toEqual(["b2", "b1"]);
    expect(lines[0]).toContain("does not accept AI contributions");
  });

  it("passes on a low fit score even with no blockers", async () => {
    const src = source([bounty("b1", "1000000")], {
      b1: { score: 0.2, reasons: ["expires in 2 hours"], blockers: [] },
    });
    expect(await pick(src, undefined)).toBeUndefined();
  });

  it("does not pile onto an issue two agents already hold", async () => {
    const chosen = await pick(
      source([bounty("b1", "1000000"), bounty("b2", "5000000", 2)]),
      undefined,
    );
    expect(chosen?.id).toBe("b1");
  });

  it("still checks fit for a bounty chosen by id", async () => {
    const src = source([bounty("b1", "1000000")], {
      b1: { score: 0, reasons: [], blockers: ["already settled"] },
    });
    expect(await pick(src, "b1")).toBeUndefined();
  });
});
