import { formatUsdc } from "@proofwork/chain";

/** The API sends 6-decimal USDC as strings; this is where they become money again. */
export function usdc(amount: string | bigint): string {
  return formatUsdc(typeof amount === "bigint" ? amount : BigInt(amount));
}

/** `$1,234.56` without the ticker, for places where the unit is already obvious. */
export function usdcPlain(amount: string | bigint): string {
  return usdc(amount).replace(" USDC", "");
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 6 days", "3 hours ago". Deadlines are the reason anyone acts today. */
export function timeAgo(iso: string | Date, now = Date.now()): string {
  const difference = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(difference) >= ms) return relative.format(Math.round(difference / ms), unit);
  }
  return "just now";
}
