#!/usr/bin/env bun
/**
 * Moves USDC from another testnet onto Arc with Circle App Kit, the way the funding flow
 * does it in the browser, but from a key in the environment. Useful when the wallet a
 * funder holds is not in a browser, and as the recorded fallback for the demo.
 *
 *   BRIDGE_PRIVATE_KEY=0x… bun run scripts/bridge-testnet.ts --amount 1.00 [--from baseSepolia]
 *
 * The key needs USDC on the source chain and that chain's gas token. The mint on Arc goes
 * through Circle's forwarder, so nothing is needed on the Arc side.
 */

import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { AppKit } from "@circle-fin/app-kit";
import { APP_KIT_CHAIN_TESTNET, BRIDGE_SOURCES } from "@proofwork/chain";
import type { Hex } from "viem";

const args = parseArgs(process.argv.slice(2));
const amount = args.amount ?? "1.00";
const source = BRIDGE_SOURCES.find((entry) => entry.key === (args.from ?? "baseSepolia"));
if (!source) {
  throw new Error(`--from must be one of: ${BRIDGE_SOURCES.map((entry) => entry.key).join(", ")}`);
}

const privateKey = process.env.BRIDGE_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("set BRIDGE_PRIVATE_KEY to a testnet key holding USDC on the source chain");
}

async function main(): Promise<void> {
  const kit = new AppKit();
  const adapter = createViemAdapterFromPrivateKey({ privateKey: privateKey as Hex });

  console.log(`Bridging ${amount} USDC from ${source?.label} to Arc testnet`);
  kit.on("*", (payload) => {
    const event = payload as { action?: string; values?: Record<string, unknown> };
    if (!event.action?.startsWith("bridge.")) return;
    const values = event.values ?? {};
    const state = typeof values.state === "string" ? values.state : "";
    const tx = typeof values.explorerUrl === "string" ? values.explorerUrl : (values.txHash ?? "");
    console.log(`  ${event.action.slice("bridge.".length).padEnd(17)} ${state.padEnd(8)} ${tx}`);
  });

  let result = await kit.bridge({
    from: { adapter, chain: source?.appKitChain ?? "Base_Sepolia" },
    to: { adapter, chain: APP_KIT_CHAIN_TESTNET, useForwarder: true },
    amount,
  });

  if (result.state === "error") {
    const failed = result.steps.find((step) => step.state === "error");
    console.log(`\nfailed at ${failed?.name ?? "?"}; retrying from there`);
    result = await kit.retryBridge(result, { from: adapter, to: adapter });
  }

  console.log(`\n${result.state}: ${result.amount} USDC`);
  for (const step of result.steps) {
    console.log(
      `  ${step.name.padEnd(17)} ${step.state.padEnd(8)} ${step.explorerUrl ?? step.txHash ?? ""}`,
    );
  }
  if (result.state !== "success") process.exitCode = 1;
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag?.startsWith("--") && value && !value.startsWith("--")) {
      parsed[flag.slice(2)] = value;
      index += 1;
    }
  }
  return parsed;
}

await main();
