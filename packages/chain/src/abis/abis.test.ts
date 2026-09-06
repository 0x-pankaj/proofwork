import { decodeFunctionData, encodeFunctionData, parseUnits } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi, erc8004IdentityAbi, erc8004ReputationAbi, proofworkJobsAbi } from "./index";

describe("proofworkJobs abi", () => {
  it("encodes the funding call a browser wallet sends", () => {
    const data = encodeFunctionData({
      abi: proofworkJobsAbi,
      functionName: "createAndFund",
      args: [
        "0x1111111111111111111111111111111111111111",
        1_800_000_000n,
        "owner/repo#12",
        parseUnits("200", 6),
        "0x2222222222222222222222222222222222222222",
        1500,
      ],
    });
    expect(data.startsWith("0x")).toBe(true);

    const decoded = decodeFunctionData({ abi: proofworkJobsAbi, data });
    expect(decoded.functionName).toBe("createAndFund");
    expect(decoded.args?.[3]).toBe(200_000_000n);
  });

  it("encodes the settlement call the verifier wallet sends on merge", () => {
    const data = encodeFunctionData({
      abi: proofworkJobsAbi,
      functionName: "settle",
      args: [
        1n,
        "0x3333333333333333333333333333333333333333",
        `0x${"ab".repeat(32)}`,
        `0x${"cd".repeat(32)}`,
      ],
    });
    expect(decodeFunctionData({ abi: proofworkJobsAbi, data }).functionName).toBe("settle");
  });
});

describe("erc-8004 abis", () => {
  it("encodes agent registration", () => {
    const data = encodeFunctionData({
      abi: erc8004IdentityAbi,
      functionName: "register",
      args: ["https://proofwork.dev/agents/1.json"],
    });
    expect(data.startsWith("0x")).toBe(true);
  });

  it("encodes the feedback left after a settlement", () => {
    const data = encodeFunctionData({
      abi: erc8004ReputationAbi,
      functionName: "giveFeedback",
      args: [
        1n,
        100n,
        2,
        "proofwork",
        "merged",
        "https://proofwork.dev",
        "https://proofwork.dev/feedback/1.json",
        `0x${"00".repeat(32)}`,
      ],
    });
    expect(decodeFunctionData({ abi: erc8004ReputationAbi, data }).functionName).toBe(
      "giveFeedback",
    );
  });
});

describe("erc-20 abi", () => {
  it("encodes the approval a funder signs before escrowing", () => {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: ["0x4444444444444444444444444444444444444444", parseUnits("206", 6)],
    });
    expect(decodeFunctionData({ abi: erc20Abi, data }).args?.[1]).toBe(206_000_000n);
  });
});
