import { describe, expect, it } from "vitest";
import {
  ARC_TESTNET_CHAIN_ID,
  activeChain,
  activeNetwork,
  addressUrl,
  arcTestnet,
  BRIDGE_SOURCES,
  chainFor,
  defineArcMainnet,
  explorerUrlFor,
  rpcUrlFor,
  txUrl,
} from "./networks";

const MAINNET_ENV = {
  ARC_NETWORK: "mainnet",
  ARC_MAINNET_CHAIN_ID: "5042001",
  ARC_MAINNET_RPC_URL: "https://rpc.arc.network",
  ARC_MAINNET_EXPLORER_URL: "https://arcscan.app",
};

describe("activeNetwork", () => {
  it("defaults to testnet when ARC_NETWORK is unset", () => {
    expect(activeNetwork({})).toBe("testnet");
  });

  it("accepts testnet and mainnet", () => {
    expect(activeNetwork({ ARC_NETWORK: "testnet" })).toBe("testnet");
    expect(activeNetwork({ ARC_NETWORK: "mainnet" })).toBe("mainnet");
  });

  it("rejects anything else instead of silently falling back", () => {
    expect(() => activeNetwork({ ARC_NETWORK: "sepolia" })).toThrow(/ARC_NETWORK/);
    expect(() => activeNetwork({ ARC_NETWORK: "" })).toThrow(/ARC_NETWORK/);
  });
});

describe("arc testnet", () => {
  it("is the chain viem ships, at id 5042002", () => {
    expect(arcTestnet.id).toBe(ARC_TESTNET_CHAIN_ID);
    expect(activeChain({}).id).toBe(ARC_TESTNET_CHAIN_ID);
  });

  it("uses USDC as its native currency with the 18-decimal gas view", () => {
    expect(arcTestnet.nativeCurrency.symbol).toBe("USDC");
    expect(arcTestnet.nativeCurrency.decimals).toBe(18);
  });

  it("takes an RPC override from the environment", () => {
    expect(rpcUrlFor("testnet", {})).toBe("https://rpc.testnet.arc.network");
    expect(rpcUrlFor("testnet", { ARC_TESTNET_RPC_URL: "http://127.0.0.1:8545" })).toBe(
      "http://127.0.0.1:8545",
    );
  });
});

describe("arc mainnet", () => {
  it("throws a directive error until launch-day parameters are configured", () => {
    expect(() => defineArcMainnet({})).toThrow(/not configured/);
    expect(() => defineArcMainnet({ ARC_MAINNET_CHAIN_ID: "0" })).toThrow(/not configured/);
    expect(() => defineArcMainnet({ ARC_MAINNET_CHAIN_ID: "5042001" })).toThrow(/not configured/);
  });

  it("builds the chain from environment once configured", () => {
    const chain = defineArcMainnet(MAINNET_ENV);
    expect(chain.id).toBe(5_042_001);
    expect(chain.nativeCurrency.symbol).toBe("USDC");
    expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.arc.network");
  });

  it("is selected by ARC_NETWORK without any code change", () => {
    expect(activeNetwork(MAINNET_ENV)).toBe("mainnet");
    expect(activeChain(MAINNET_ENV).id).toBe(5_042_001);
    expect(chainFor("mainnet", MAINNET_ENV).id).toBe(5_042_001);
  });
});

describe("explorer links", () => {
  it("points at ArcScan for the active network", () => {
    expect(explorerUrlFor("testnet", {})).toBe("https://testnet.arcscan.app");
    expect(txUrl("0xabc", {})).toBe("https://testnet.arcscan.app/tx/0xabc");
    expect(addressUrl("0xdef", MAINNET_ENV)).toBe("https://arcscan.app/address/0xdef");
  });
});

describe("bridge sources", () => {
  it("names each source chain the way app kit does, with a real viem chain behind it", () => {
    for (const source of BRIDGE_SOURCES) {
      expect(source.appKitChain).toMatch(/^[A-Z][a-z]+_[A-Z][a-z]+$/);
      expect(source.chain.id).toBeGreaterThan(0);
      expect(source.chain.id).not.toBe(5_042_002);
    }
  });
});
