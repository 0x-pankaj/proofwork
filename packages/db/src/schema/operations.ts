import {
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const webhookSource = pgEnum("webhook_source", ["github", "circle"]);

/**
 * Every webhook is written here before it is acted on. Providers retry, so the delivery
 * id is what makes handling exactly-once rather than at-least-once.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    source: webhookSource().notNull(),
    deliveryId: text().notNull(),
    event: text().notNull(),
    payload: jsonb().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
  },
  (table) => [uniqueIndex("webhook_events_delivery_idx").on(table.source, table.deliveryId)],
);

/** How far the chain reconciler has read. The backstop for missed webhooks. */
export const chainCursors = pgTable("chain_cursors", {
  chainId: integer().primaryKey(),
  lastBlock: bigint({ mode: "bigint" }).notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type ChainCursor = typeof chainCursors.$inferSelect;
