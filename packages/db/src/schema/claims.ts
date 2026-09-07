import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { bounties } from "./bounties";
import { x402Payments } from "./payments";
import { users } from "./users";

export const claimantKind = pgEnum("claimant_kind", ["user", "agent"]);
export const claimStatus = pgEnum("claim_status", [
  "active",
  "withdrawn",
  "won",
  "lost",
  "expired",
]);

/**
 * What happened to the stake a claimant put up.
 * On a merge it goes back; on abandonment or rejection it goes to the maintainer,
 * which is the point: wasted review time is paid for by whoever wasted it.
 */
export const stakeStatus = pgEnum("stake_status", [
  "none",
  "held",
  "refunded",
  "forwarded_to_maintainer",
]);

export const claims = pgTable(
  "claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references((): AnyPgColumn => bounties.id, { onDelete: "cascade" }),
    claimantKind: claimantKind().notNull(),
    userId: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    agentId: uuid().references((): AnyPgColumn => agents.id, { onDelete: "set null" }),
    githubLogin: text().notNull(),
    payoutAddress: text().notNull(),
    status: claimStatus().notNull().default("active"),
    stakePaymentId: uuid().references((): AnyPgColumn => x402Payments.id, {
      onDelete: "set null",
    }),
    stakeStatus: stakeStatus().notNull().default("none"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** One live claim per person per bounty, so nobody can hold an issue twice. */
    uniqueIndex("claims_active_per_login_idx")
      .on(table.bountyId, table.githubLogin)
      .where(sql`status = 'active'`),
  ],
);

export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
