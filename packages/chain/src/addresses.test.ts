import { describe, expect, it } from "vitest";
import { proofworkJobsAbi } from "./abis";
import { ADDRESSES, addressesFor, proofworkJobsAddress, usdcAddress } from "./addresses";
import { deploymentFor } from "./deployments";
import { ARC_TESTNET_CHAIN_ID } from "./networks";

describe("addresses", () => {
  it("exposes USDC as the 6-decimal ERC-20 view on both networks", () => {
    expect(usdcAddress("testnet", {})).toBe("0x3600000000000000000000000000000000000000");
    expect(usdcAddress("mainnet", {})).toBe("0x3600000000000000000000000000000000000000");
  });

  it("lets mainnet USDC be overridden if Arc publishes a different address", () => {
    expect(usdcAddress("mainnet", { ARC_MAINNET_USDC_ADDRESS: "0x1111" })).toBe("0x1111");
  });

  it("carries the ERC-8004 registries used for agent identity and reputation", () => {
    expect(addressesFor("testnet").ERC8004_IDENTITY).toBe(
      "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    );
    expect(ADDRESSES.testnet.ERC8004_REPUTATION).toBe("0x8004B663056A597Dffe9eCcC1965A193B7388713");
  });

  it("fails loudly on a network with no deployment rather than sending to nowhere", () => {
    // Mainnet has neither launch-day parameters nor a deployment record yet.
    expect(() => proofworkJobsAddress("mainnet", {})).toThrow(/not configured/);
  });

  it("returns the escrow address once deployed", () => {
    expect(proofworkJobsAddress("testnet", { PROOFWORK_JOBS_ADDRESS_TESTNET: "0xcafe" })).toBe(
      "0xcafe",
    );
  });
});

describe("deployment record", () => {
  it("prefers an explicit environment override over the committed record", () => {
    expect(proofworkJobsAddress("testnet", { PROOFWORK_JOBS_ADDRESS_TESTNET: "0xbeef" })).toBe(
      "0xbeef",
    );
  });
});

describe("contract abi", () => {
  it("exports the settlement entrypoints the API calls", () => {
    const names = proofworkJobsAbi
      .filter((entry) => entry.type === "function")
      .map((entry) => ("name" in entry ? entry.name : ""));
    expect(names).toContain("createAndFund");
    expect(names).toContain("settle");
    expect(names).toContain("claimRefund");
    expect(names).toContain("getJobExtra");
  });

  it("exports the events the reconciler indexes", () => {
    const events = proofworkJobsAbi
      .filter((entry) => entry.type === "event")
      .map((entry) => ("name" in entry ? entry.name : ""));
    expect(events).toContain("JobFunded");
    expect(events).toContain("PaymentReleased");
    expect(events).toContain("MaintainerRewardPaid");
    expect(events).toContain("FeeCollected");
  });
});

describe("arc testnet deployment", () => {
  it("resolves the escrow with no configuration at all, straight from the repo", () => {
    expect(proofworkJobsAddress("testnet", {})).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("was deployed with the fee and treasury the product documents", () => {
    const deployment = deploymentFor(ARC_TESTNET_CHAIN_ID);
    expect(deployment?.feeBps).toBe(300);
    expect(deployment?.paymentToken).toBe(ADDRESSES.testnet.USDC);
    expect(deployment?.treasury).not.toBe(deployment?.deployer);
  });
});
