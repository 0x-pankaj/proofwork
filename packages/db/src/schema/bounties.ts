import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { repos } from "./repos";
import { users } from "./users";

/**
 * The life of a bounty.
 *
 *  draft → funding → pending_accept → open → claimed → submitted → settling → settled
 *
 * `pending_accept` exists because a maintainer who has not opted into auto-accept gets to
 * refuse a bounty on their own issue before contributors start work on it.
 * Terminal states: settled, rejected, expired, cancelled.
 */
export const bountyStatus = pgEnum("bounty_status", [
  "draft",
  "funding",
  "pending_accept",
  "open",
  "claimed",
  "submitted",
  "settling",
  "settled",
  "rejected",
  "expired",
  "cancelled",
]);

/** Money is stored as the 6-decimal integer the contract uses, never as a float. */
const usdc = () => numeric({ precision: 20, scale: 0, mode: "bigint" });

export const bounties = pgTable(
  "bounties",
  {
    id: uuid().primaryKey().defaultRandom(),
    repoId: uuid()
      .notNull()
      .references((): AnyPgColumn => repos.id, { onDelete: "cascade" }),
    issueNumber: integer().notNull(),
    issueTitle: text().notNull(),
    issueUrl: text().notNull(),
    description: text().notNull(),

    /** Escrowed budget. The contributor receives this less the maintainer's share. */
    amountUsdc: usdc().notNull(),
    /** Protocol fee, paid by the funder on top of the budget. */
    feeUsdc: usdc().notNull(),
    /** Where the review reward goes. Null when the repo has no payout address set. */
    maintainerAddress: text(),
    maintainerRewardBps: integer().notNull().default(0),

    funderUserId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    funderAddress: text().notNull(),
    evaluatorAddress: text().notNull(),

    /** The on-chain job id, once the funding transaction confirms. */
    jobId: bigint({ mode: "bigint" }),
    status: bountyStatus().notNull().default("draft"),
    tags: text().array().notNull().default(sql`ARRAY[]::text[]`),

    acceptedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createTxHash: text(),
    settleTxHash: text(),
    circleTxId: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * One live bounty per issue. Settled and abandoned ones are excluded so the same
     * issue can be funded again later, which is the normal case for a recurring task.
     */
    uniqueIndex("bounties_active_per_issue_idx")
      .on(table.repoId, table.issueNumber)
      .where(sql`status not in ('settled', 'rejected', 'expired', 'cancelled')`),
    index("bounties_status_idx").on(table.status),
    index("bounties_job_id_idx").on(table.jobId),
  ],
);

export type Bounty = typeof bounties.$inferSelect;
export type NewBounty = typeof bounties.$inferInsert;
