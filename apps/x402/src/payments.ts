import { type Database, recordX402Payment, type X402Payment } from "@proofwork/db";

/**
 * The ledger behind the paid endpoints.
 *
 * Circle's middleware verifies and settles the nanopayment; this is where Proofwork
 * writes down that it happened, so a claim stake can be looked up later and refunded to
 * the address that actually paid it.
 */

/** What the gateway middleware attaches once a request has paid. */
export interface Payment {
  verified: boolean;
  payer: string;
  /** Smallest units of USDC, so 6 decimals. */
  amount: string;
  /** CAIP-2, for example eip155:5042002. */
  network: string;
  transaction?: string;
}

export function recordPayment(
  db: Database,
  endpoint: string,
  payment: Payment,
): Promise<X402Payment> {
  return recordX402Payment(db, {
    endpoint,
    payer: payment.payer,
    amountUsdc: BigInt(payment.amount),
    network: payment.network,
    // The settlement hash is the natural key; batched payments settle later, so a
    // request id stands in until one exists.
    requestId: payment.transaction ?? crypto.randomUUID(),
  });
}
