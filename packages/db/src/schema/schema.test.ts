import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { bounties } from "./bounties";
import { claims } from "./claims";
import { DEFAULT_REPO_POLICY } from "./repos";
import { settlements } from "./settlements";

/**
 * Column names here are the JavaScript ones. The snake_case conversion is applied by the
 * client's `casing` option at query time, and by drizzle-kit when generating migrations.
 */
function column(table: Parameters<typeof getTableConfig>[0], name: string) {
  return getTableConfig(table).columns.find((c) => c.name === name);
}

describe("money columns", () => {
  it("store USDC as exact integers, never floats", () => {
    for (const [table, names] of [
      [bounties, ["amountUsdc", "feeUsdc"]],
      [settlements, ["amountUsdc", "feeUsdc"]],
    ] as const) {
      for (const name of names) {
        const col = column(table, name);
        expect(col, `${name} exists`).toBeDefined();
        expect(col?.getSQLType()).toBe("numeric(20, 0)");
      }
    }
  });

  it("reads money back as bigint so no precision is lost in JavaScript", () => {
    expect(column(bounties, "amountUsdc")?.dataType).toBe("bigint");
  });
});

describe("settlement safety", () => {
  it("allows only one settlement per bounty, so a replayed merge cannot pay twice", () => {
    const unique = getTableConfig(settlements).indexes.find(
      (i) => i.config.name === "settlements_one_per_bounty_idx",
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((c) => ("name" in c ? c.name : ""))).toEqual(["bountyId"]);
  });

  it("allows only one live claim per person per bounty", () => {
    const unique = getTableConfig(claims).indexes.find(
      (i) => i.config.name === "claims_active_per_login_idx",
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
  });

  it("allows only one live bounty per issue, while letting settled issues be refunded", () => {
    const unique = getTableConfig(bounties).indexes.find(
      (i) => i.config.name === "bounties_active_per_issue_idx",
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
  });
});

describe("repo policy defaults", () => {
  it("requires AI contributions to be disclosed rather than banning or hiding them", () => {
    expect(DEFAULT_REPO_POLICY.aiContributions).toBe("disclosure");
  });

  it("asks for a one dollar stake, in 6-decimal units", () => {
    expect(DEFAULT_REPO_POLICY.minStakeUsdc).toBe("1000000");
  });

  it("releases an abandoned claim after three days", () => {
    expect(DEFAULT_REPO_POLICY.claimTtlHours).toBe(72);
  });
});
