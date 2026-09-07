import { fromUsdc } from "@proofwork/chain";

/**
 * A 6-decimal USDC amount as the price string the gateway middleware expects.
 *
 * Whole amounts get their cents back — `$1` is a price a reader has to squint at, and
 * these endpoints deliberately sit either side of a cent.
 */
export function price(amountUsdc: bigint): string {
  const decimal = fromUsdc(amountUsdc);
  return `$${decimal.includes(".") ? decimal : `${decimal}.00`}`;
}
