import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** How a payout address is custodied, which decides who signs to move the money. */
export const payoutKind = pgEnum("payout_kind", ["eoa", "circle_modular", "circle_agent"]);

/** A GitHub account that funds, reviews or completes work. */
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    githubId: bigint({ mode: "bigint" }).notNull().unique(),
    login: text().notNull(),
    name: text(),
    avatarUrl: text(),
    email: text(),
    /** Checksummed address. Null until the user sets one, which is required to be paid. */
    payoutAddress: text(),
    payoutKind: payoutKind().notNull().default("eoa"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_login_idx").on(table.login)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
