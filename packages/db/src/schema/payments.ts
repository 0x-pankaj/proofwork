import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A nanopayment received on a paid endpoint, recorded from the x402 payment header.
 * Doubles as the ledger for claim stakes, which are collected the same way.
 */
export const x402Payments = pgTable("x402_payments", {
  id: uuid().primaryKey().defaultRandom(),
  endpoint: text().notNull(),
  payer: text().notNull(),
  amountUsdc: numeric({ precision: 20, scale: 0, mode: "bigint" }).notNull(),
  /** CAIP-2 network id, for example eip155:5042002. */
  network: text().notNull(),
  requestId: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type X402Payment = typeof x402Payments.$inferSelect;
export type NewX402Payment = typeof x402Payments.$inferInsert;
