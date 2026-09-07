import type { Database } from "@proofwork/db";
import { recordX402Payment, type X402Payment } from "@proofwork/db";
import type { NextFunction, Request, Response } from "express";

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

export interface PaidRequest extends Request {
  payment?: Payment;
  /** The row written for this call, set by `recording`. */
  x402Payment?: X402Payment;
}

/**
 * Records the payment that unlocked this request.
 *
 * Runs after the gateway middleware and before the handler, so a handler can assume the
 * payment exists and, in the case of a stake, hand its id back to the payer.
 */
export function recording(db: Database, endpoint: string) {
  return async (req: PaidRequest, res: Response, next: NextFunction): Promise<void> => {
    const payment = req.payment;
    if (!payment?.verified) {
      res
        .status(402)
        .json({ error: { code: "payment_required", message: "payment not verified" } });
      return;
    }

    try {
      req.x402Payment = await recordX402Payment(db, {
        endpoint,
        payer: payment.payer,
        amountUsdc: BigInt(payment.amount),
        network: payment.network,
        // The settlement hash is the natural key; batched payments settle later, so a
        // request id stands in until one exists.
        requestId: payment.transaction ?? crypto.randomUUID(),
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}
