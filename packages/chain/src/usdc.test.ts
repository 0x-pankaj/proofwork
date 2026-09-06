import { describe, expect, it } from "vitest";
import { bpsOf, formatUsdc, fromUsdc, toUsdc } from "./usdc";

describe("usdc amounts", () => {
  it("parses to 6-decimal bigints", () => {
    expect(toUsdc("1")).toBe(1_000_000n);
    expect(toUsdc("1.5")).toBe(1_500_000n);
    expect(toUsdc(200)).toBe(200_000_000n);
    expect(toUsdc("0.000001")).toBe(1n);
  });

  it("round-trips", () => {
    expect(fromUsdc(toUsdc("1234.56"))).toBe("1234.56");
  });

  it("formats for display", () => {
    expect(formatUsdc(toUsdc("1234.5"))).toBe("$1,234.50 USDC");
    expect(formatUsdc(0n)).toBe("$0.00 USDC");
  });
});

describe("bpsOf", () => {
  it("matches the contract's integer math, rounding down", () => {
    expect(bpsOf(toUsdc("200"), 1500)).toBe(toUsdc("30"));
    expect(bpsOf(toUsdc("200"), 300)).toBe(toUsdc("6"));
    expect(bpsOf(toUsdc("200"), 0)).toBe(0n);
    expect(bpsOf(1n, 300)).toBe(0n);
    expect(bpsOf(7n, 1500)).toBe(1n);
  });

  it("rejects out-of-range basis points", () => {
    expect(() => bpsOf(1n, -1)).toThrow();
    expect(() => bpsOf(1n, 10_001)).toThrow();
    expect(() => bpsOf(1n, 1.5)).toThrow();
  });
});
