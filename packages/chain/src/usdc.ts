import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./networks";

/**
 * USDC amounts are 6-decimal bigints everywhere in this codebase.
 * The 18-decimal native view exists only for gas math and is never mixed with these.
 */
export type UsdcAmount = bigint;

/** Parse a decimal string or number of USDC into a 6-decimal bigint. `"1.50"` becomes `1500000n`. */
export function toUsdc(amount: string | number): UsdcAmount {
  return parseUnits(String(amount), USDC_DECIMALS);
}

/** Format a 6-decimal bigint as a plain decimal string. `1500000n` becomes `"1.5"`. */
export function fromUsdc(amount: UsdcAmount): string {
  return formatUnits(amount, USDC_DECIMALS);
}

/** Format for display, always two decimals with thousands separators. `"$1,234.56 USDC"`. */
export function formatUsdc(amount: UsdcAmount): string {
  const value = Number(formatUnits(amount, USDC_DECIMALS));
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

/** Basis points of an amount, rounded down, matching the contract's integer math. */
export function bpsOf(amount: UsdcAmount, bps: number): UsdcAmount {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`bps must be an integer in [0, 10000], got ${bps}`);
  }
  return (amount * BigInt(bps)) / 10_000n;
}
