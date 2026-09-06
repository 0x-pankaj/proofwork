import { describe, expect, it } from "vitest";
import { ADDRESSES, addressesFor, proofworkJobsAddress, usdcAddress } from "./addresses";

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

  it("fails loudly when the escrow address is missing rather than sending to nowhere", () => {
    expect(() => proofworkJobsAddress("testnet", {})).toThrow(/PROOFWORK_JOBS_ADDRESS_TESTNET/);
  });

  it("returns the escrow address once deployed", () => {
    expect(proofworkJobsAddress("testnet", { PROOFWORK_JOBS_ADDRESS_TESTNET: "0xcafe" })).toBe(
      "0xcafe",
    );
  });
});
