import { bigint, boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const accountType = pgEnum("account_type", ["User", "Organization"]);

/** A GitHub App installation. One per account that added Proofwork. */
export const installations = pgTable("installations", {
  id: uuid().primaryKey().defaultRandom(),
  githubInstallationId: bigint({ mode: "bigint" }).notNull().unique(),
  accountLogin: text().notNull(),
  accountType: accountType().notNull(),
  /** GitHub suspends an installation rather than deleting it; we stop acting on those. */
  suspended: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Installation = typeof installations.$inferSelect;
export type NewInstallation = typeof installations.$inferInsert;
