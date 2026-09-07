import {
  type AnyPgColumn,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bounties } from "./bounties";
import { claims } from "./claims";

export const submissionStatus = pgEnum("submission_status", ["open", "merged", "closed"]);

/** A pull request offered against a bounty. The merge is what makes it payable. */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references((): AnyPgColumn => bounties.id, { onDelete: "cascade" }),
    claimId: uuid()
      .notNull()
      .references((): AnyPgColumn => claims.id, { onDelete: "cascade" }),
    prNumber: integer().notNull(),
    prUrl: text().notNull(),
    headSha: text().notNull(),
    mergeSha: text(),
    mergedAt: timestamp({ withTimezone: true }),
    /** Hash of the proof recorded on chain, derived from the repo, pull request and merge. */
    deliverableHash: text(),
    status: submissionStatus().notNull().default("open"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** One row per pull request, so a synchronize or edit updates rather than duplicates. */
    uniqueIndex("submissions_one_per_pr_idx").on(table.bountyId, table.prNumber),
  ],
);

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
