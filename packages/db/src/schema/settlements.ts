import {
  type AnyPgColumn,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bounties } from "./bounties";
import { claims } from "./claims";

export const settlementStatus = pgEnum("settlement_status", [
  "pending",
  "submitted",
  "complete",
  "failed",
]);

const usdc = () => numeric({ precision: 20, scale: 0, mode: "bigint" });

/**
 * One payout attempt. The unique index is the safety net that makes a merge webhook
 * safe to replay: GitHub redelivers, and a bounty can still only ever pay once.
 */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references((): AnyPgColumn => bounties.id, { onDelete: "cascade" }),
    claimId: uuid()
      .notNull()
      .references((): AnyPgColumn => claims.id, { onDelete: "restrict" }),
    providerAddress: text().notNull(),
    amountUsdc: usdc().notNull(),
    feeUsdc: usdc().notNull(),
    /** Compliance Engine verdict on the payout address, kept for audit. */
    screeningResult: jsonb(),
    txHash: text(),
    circleTxId: text(),
    status: settlementStatus().notNull().default("pending"),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [uniqueIndex("settlements_one_per_bounty_idx").on(table.bountyId)],
);

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
