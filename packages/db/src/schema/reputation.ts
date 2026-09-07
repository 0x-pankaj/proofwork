import { type AnyPgColumn, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { bounties } from "./bounties";

/** Feedback written to the ERC-8004 reputation registry after a settlement. */
export const reputationEvents = pgTable("reputation_events", {
  id: uuid().primaryKey().defaultRandom(),
  agentId: uuid()
    .notNull()
    .references((): AnyPgColumn => agents.id, { onDelete: "cascade" }),
  bountyId: uuid()
    .notNull()
    .references((): AnyPgColumn => bounties.id, { onDelete: "cascade" }),
  score: integer().notNull(),
  txHash: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type ReputationEvent = typeof reputationEvents.$inferSelect;
export type NewReputationEvent = typeof reputationEvents.$inferInsert;
