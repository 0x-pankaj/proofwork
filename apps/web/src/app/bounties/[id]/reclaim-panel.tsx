"use client";

import { arcTestnet } from "@proofwork/chain";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useConfig, useConnect, useSendTransaction, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonStyles, ExplorerLink, Panel } from "@/components/ui";
import { shortAddress, usdc } from "@/lib/format";
import { confirmReclaim, type ReclaimQuote } from "./actions";

/**
 * Taking an escrow back.
 *
 * Two calls sit behind this button and they are not the same promise. `cancel` belongs to
 * the funder and only works before anyone starts. `claimRefund` is open to anyone once the
 * deadline passes — the money still goes to the funder, so a stranger can only ever do them
 * a favour. That is worth saying out loud on screen: it is the difference between an escrow
 * a funder trusts and one they have to be talked into.
 */

type Stage = "idle" | "signing" | "confirming" | "done";

export function ReclaimPanel({
  bountyId,
  quote,
}: {
  bountyId: string;
  quote: Extract<ReclaimQuote, { reclaimable: true }>;
}) {
  const router = useRouter();
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txUrl, setTxUrl] = useState<string | null>(null);

  const wrongChain = isConnected && chainId !== arcTestnet.id;
  const isFunder = address?.toLowerCase() === quote.funderAddress.toLowerCase();
  // Only the funder can cancel; the contract checks it too, and would revert.
  const permitted = quote.kind === "claimRefund" || isFunder;

  async function reclaim() {
    setError(null);
    try {
      setStage("signing");
      const hash = await sendTransactionAsync({
        to: quote.call.to as `0x${string}`,
        data: quote.call.data,
      });

      setStage("confirming");
      await waitForTransactionReceipt(config, { hash });
      const result = await confirmReclaim(bountyId, hash);

      setTxUrl(result.txUrl);
      setStage("done");
      router.refresh();
    } catch (cause) {
      setStage("idle");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (stage === "done") {
    return (
      <Panel className="p-5">
        <h2 className="font-medium">Escrow returned</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {usdc(quote.amountUsdc)} went back to the funder, budget and fee together.
        </p>
        {txUrl ? (
          <p className="mt-3 text-sm">
            <ExplorerLink href={txUrl}>View the refund on Arc</ExplorerLink>
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <h2 className="font-medium">
        {quote.kind === "cancel" ? "Take the bounty back" : "Return the escrow"}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{quote.reason}.</p>
      <p className="mt-1 text-sm text-ink-soft">
        {usdc(quote.amountUsdc)} goes back to{" "}
        {isFunder ? "you" : `the funder, ${shortAddress(quote.funderAddress)}`}, budget and fee
        together.
      </p>

      {quote.kind === "claimRefund" && !isFunder ? (
        <p className="mt-3 text-sm text-ink-faint">
          Anyone can send this once the deadline has passed. The contract pays the funder regardless
          of who calls it, so a funder never waits on us to be made whole.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!isConnected ? (
          <button
            type="button"
            className={buttonStyles.primary}
            disabled={connecting}
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        ) : wrongChain ? (
          <button
            type="button"
            className={buttonStyles.primary}
            onClick={() => switchChain({ chainId: arcTestnet.id })}
          >
            Switch to Arc
          </button>
        ) : (
          <button
            type="button"
            className={buttonStyles.primary}
            disabled={!permitted || stage !== "idle"}
            onClick={reclaim}
          >
            {stage === "signing"
              ? "Sign in your wallet…"
              : stage === "confirming"
                ? "Confirming on Arc…"
                : quote.kind === "cancel"
                  ? "Cancel and refund"
                  : "Return it to the funder"}
          </button>
        )}

        {isConnected && !permitted ? (
          <span className="text-sm text-ink-faint">
            Only {shortAddress(quote.funderAddress)} can cancel this one.
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Panel>
  );
}
