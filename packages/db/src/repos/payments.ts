import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { claims, type NewX402Payment, type X402Payment, x402Payments } from "../schema";

/**
 * Claim stakes are ordinary x402 payments: an agent pays a small amount to the treasury
 * to hold a claim, and gets it back when its pull request is merged. Looking one up is
 * therefore a payment lookup plus a check that no other claim already spent it.
 */
export async function x402PaymentById(db: Database, id: string): Promise<X402Payment | undefined> {
  const [row] = await db.select().from(x402Payments).where(eq(x402Payments.id, id)).limit(1);
  return row;
}

export async function x402PaymentByRequestId(
  db: Database,
  requestId: string,
): Promise<X402Payment | undefined> {
  const [row] = await db
    .select()
    .from(x402Payments)
    .where(eq(x402Payments.requestId, requestId))
    .limit(1);
  return row;
}

/** Whether a payment is already backing a live claim, so it cannot back a second one. */
export async function stakeInUse(db: Database, paymentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(
      and(
        eq(claims.stakePaymentId, paymentId),
        inArray(claims.status, ["active", "won"] as (typeof claims.status.enumValues)[number][]),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Writes down a nanopayment. Idempotent by request id: Circle can retry a settlement
 * notification, and a stake must not be created twice for one payment.
 */
export async function recordX402Payment(db: Database, input: NewX402Payment): Promise<X402Payment> {
  const [row] = await db
    .insert(x402Payments)
    .values(input)
    .onConflictDoUpdate({
      target: x402Payments.requestId,
      set: { payer: input.payer, amountUsdc: input.amountUsdc },
    })
    .returning();
  if (!row) throw new Error("payment insert returned nothing");
  return row;
}
