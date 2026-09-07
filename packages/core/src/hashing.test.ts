import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import {
  deliverableHash,
  deliverablePreimage,
  mergedReasonHash,
  rejectedReasonHash,
} from "./hashing";

const REF = {
  repoFullName: "circlefin/arc-sdk",
  prNumber: 12,
  mergeSha: "9f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
};

describe("deliverable hash", () => {
  it("commits to the repo, the pull request and the merge commit", () => {
    expect(deliverablePreimage(REF)).toBe(
      "proofwork/v1:circlefin/arc-sdk#12@9f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
    );
    expect(deliverableHash(REF)).toBe(keccak256(toBytes(deliverablePreimage(REF))));
  });

  it("can be recomputed by anyone from public GitHub data", () => {
    expect(deliverableHash(REF)).toBe(deliverableHash({ ...REF }));
  });

  it("is different for a different pull request, repo or commit", () => {
    const base = deliverableHash(REF);
    expect(deliverableHash({ ...REF, prNumber: 13 })).not.toBe(base);
    expect(deliverableHash({ ...REF, repoFullName: "circlefin/other" })).not.toBe(base);
    expect(deliverableHash({ ...REF, mergeSha: "a".repeat(40) })).not.toBe(base);
  });

  it("ignores the case of the commit id, which git treats as the same object", () => {
    expect(deliverableHash({ ...REF, mergeSha: REF.mergeSha.toUpperCase() })).toBe(
      deliverableHash(REF),
    );
  });

  it("rejects input that would produce a meaningless proof", () => {
    expect(() => deliverablePreimage({ ...REF, repoFullName: "arc-sdk" })).toThrow(/owner\/repo/);
    expect(() => deliverablePreimage({ ...REF, prNumber: 0 })).toThrow(/positive integer/);
    expect(() => deliverablePreimage({ ...REF, mergeSha: "not-a-sha" })).toThrow(/git object id/);
  });

  it("accepts both current and next-generation git object ids", () => {
    expect(() => deliverablePreimage({ ...REF, mergeSha: "a".repeat(64) })).not.toThrow();
  });
});

describe("reason hashes", () => {
  it("names the merge commit that released the money", () => {
    expect(mergedReasonHash(REF.mergeSha)).toBe(keccak256(toBytes(`merged:${REF.mergeSha}`)));
  });

  it("cannot be confused with a rejection", () => {
    expect(mergedReasonHash(REF.mergeSha)).not.toBe(rejectedReasonHash(REF.mergeSha));
  });

  it("validates the commit id", () => {
    expect(() => mergedReasonHash("nope")).toThrow(/git object id/);
  });
});
