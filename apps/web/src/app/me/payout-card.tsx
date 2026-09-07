"use client";

import { useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { buttonStyles, Panel } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { savePayoutAddress } from "./actions";

/**
 * Where a contributor gets paid.
 *
 * The address is only accepted with a signature over a message naming this account, so
 * pasting somebody else's address does nothing at all. It is also the only thing standing
 * between a claim and a payout, which is why it is the first card on the page.
 */

export function PayoutCard({ userId, current }: { userId: string; current: string | null }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [saved, setSaved] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = crypto.randomUUID();
      const signature = await signMessageAsync({
        message: `proofwork-payout:${userId}:${nonce}`,
      });
      const result = await savePayoutAddress({ address, nonce, signature });
      setSaved(result.payoutAddress);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message.split("\n")[0] ?? message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6">
      <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Payout address</h2>

      {saved ? (
        <p className="tabular mt-3 font-mono text-lg">{saved}</p>
      ) : (
        <p className="mt-3 text-ink-soft">
          Claims are refused until there is somewhere to send the USDC. Connect the wallet you want
          to be paid in and sign once.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isConnected ? (
          <button
            type="button"
            className={buttonStyles.primary}
            disabled={connecting}
            onClick={() => {
              const connector = connectors[0];
              if (connector) connect({ connector });
            }}
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <>
            <button type="button" className={buttonStyles.primary} disabled={busy} onClick={save}>
              {busy
                ? "Waiting for signature…"
                : saved
                  ? "Use this wallet instead"
                  : "Sign and save"}
            </button>
            <span className="font-mono text-sm text-ink-faint">
              {address ? shortAddress(address) : ""}
            </span>
          </>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Panel>
  );
}
