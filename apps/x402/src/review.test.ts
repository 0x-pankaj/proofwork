import { describe, expect, it } from "vitest";
import { parseVerdict } from "./review";

describe("parseVerdict", () => {
  it("reads a plain JSON verdict", () => {
    const verdict = parseVerdict(
      '{"addressesIssue":true,"confidence":"high","risks":["no test"],"summary":"Adds the config."}',
    );

    expect(verdict).toEqual({
      addressesIssue: true,
      confidence: "high",
      risks: ["no test"],
      summary: "Adds the config.",
    });
  });

  it("finds the verdict inside prose", () => {
    const verdict = parseVerdict(
      'Here is my review:\n```json\n{"addressesIssue":false,"confidence":"medium","risks":[],"summary":"Touches an unrelated file."}\n```\nHope that helps.',
    );

    expect(verdict.addressesIssue).toBe(false);
    expect(verdict.summary).toBe("Touches an unrelated file.");
  });

  it("says so rather than guessing when the answer is unusable", () => {
    const verdict = parseVerdict("I could not read that diff.");

    expect(verdict.addressesIssue).toBe(false);
    expect(verdict.confidence).toBe("low");
    expect(verdict.summary).toContain("did not return a usable verdict");
  });

  it("never claims a pull request works on a malformed answer", () => {
    const verdict = parseVerdict('{"addressesIssue": "yes please", "risks": "none"}');

    expect(verdict.addressesIssue).toBe(false);
    expect(verdict.risks).toEqual([]);
  });
});
