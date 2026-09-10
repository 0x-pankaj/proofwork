import { APP_KIT_CHAIN_TESTNET, type BridgeSource } from "@proofwork/chain";
import type { EIP1193Provider } from "viem";

/**
 * Bringing USDC onto Arc from wherever the funder keeps it.
 *
 * Circle App Kit runs the whole CCTP transfer — approve, burn, attestation, mint — from
 * the funder's own wallet. The mint goes through Circle's forwarder, so the funder needs
 * nothing on Arc beforehand: the USDC that lands is what funds the bounty a moment later.
 *
 * Loaded on demand: most funders already hold USDC on Arc and never pay for this code.
 */

export type BridgeStepName = "approve" | "burn" | "fetchAttestation" | "mint";
export type BridgeStepState = "pending" | "success" | "error" | "noop";

export interface BridgeStepView {
  name: string;
  state: BridgeStepState;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export interface BridgeOutcome {
  state: "success" | "error" | "pending";
  steps: BridgeStepView[];
}

export interface BridgeInput {
  provider: EIP1193Provider;
  source: BridgeSource;
  /** Decimal USDC, e.g. "150.00". */
  amount: string;
  onStep: (step: BridgeStepView) => void;
}

export const BRIDGE_STEPS: Array<{ name: BridgeStepName; label: string }> = [
  { name: "approve", label: "Approve USDC on the source chain" },
  { name: "burn", label: "Burn on the source chain" },
  { name: "fetchAttestation", label: "Circle attests the burn" },
  { name: "mint", label: "Mint on Arc" },
];

export async function bridgeToArc(input: BridgeInput): Promise<BridgeOutcome> {
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
  ]);

  const kit = new AppKit();
  kit.on("*", (payload) => {
    const event = payload as { action?: string; values?: Record<string, unknown> };
    if (!event.action?.startsWith("bridge.")) return;
    input.onStep(stepView(event.action.slice("bridge.".length), event.values ?? {}));
  });

  const adapter = await createViemAdapterFromProvider({ provider: input.provider });
  let result = await kit.bridge({
    from: { adapter, chain: input.source.appKitChain },
    to: { adapter, chain: APP_KIT_CHAIN_TESTNET, useForwarder: true },
    amount: input.amount,
  });

  // A transfer that failed after the burn is money in flight, not money lost: the retry
  // resumes from the step that failed and never repeats one that succeeded.
  if (result.state === "error") {
    result = await kit.retryBridge(result, { from: adapter, to: adapter });
  }

  return {
    state: result.state,
    steps: result.steps.map((step) =>
      stepView(step.name, step as unknown as Record<string, unknown>),
    ),
  };
}

function stepView(name: string, values: Record<string, unknown>): BridgeStepView {
  const state = values.state;
  return {
    name,
    state:
      state === "success" || state === "error" || state === "noop" || state === "pending"
        ? state
        : "pending",
    ...(typeof values.txHash === "string" ? { txHash: values.txHash } : {}),
    ...(typeof values.explorerUrl === "string" ? { explorerUrl: values.explorerUrl } : {}),
    ...(typeof values.error === "string" ? { error: values.error } : {}),
  };
}
