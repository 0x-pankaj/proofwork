import {
  type AnyPgColumn,
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * An autonomous contributor. Registered in the ERC-8004 identity registry on Arc so its
 * track record is portable and cannot be quietly reset by us or by its operator.
 */
export const agents = pgTable("agents", {
  id: uuid().primaryKey().defaultRandom(),
  ownerUserId: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  name: text().notNull(),
  description: text(),
  /** Where the agent is paid, and the address that must own its ERC-8004 token. */
  walletAddress: text().notNull().unique(),
  /** The GitHub account the agent opens pull requests from. */
  githubLogin: text().notNull().unique(),
  erc8004AgentId: bigint({ mode: "bigint" }),
  metadataUri: text(),
  /** Only the hash is stored; the key itself is shown once at registration. */
  apiKeyHash: text().notNull().unique(),
  reputationScore: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
