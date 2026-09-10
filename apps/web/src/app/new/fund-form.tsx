"use client";

import { arcTestnet, BRIDGE_SOURCES, bpsOf, fromUsdc, toUsdc } from "@proofwork/chain";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import type { EIP1193Provider } from "viem";
import { useAccount, useConfig, useConnect, useSendTransaction, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buttonStyles, ExplorerLink, Panel } from "@/components/ui";
import { usdc } from "@/lib/format";
import type { RepoSummary } from "@/lib/types";
import { confirmFunding, createBounty, type DraftBounty, listIssues } from "./actions";
import { BRIDGE_STEPS, type BridgeStepView, bridgeToArc } from "./bridge";

/**
 * Funding, in the funder's own wallet.
 *
 * Two signatures — approve, then create-and-fund — and then the API is shown the receipt.
 * Every step is named on screen as it happens, because someone is about to send real money
 * and deserves to know exactly what they just signed.
 */

type Stage = "form" | "bridging" | "approving" | "funding" | "confirming" | "done";

/** Where the funder's USDC is now: on Arc already, or on a chain App Kit can bring it from. */
type Source = "arc" | (typeof BRIDGE_SOURCES)[number]["key"];

interface Issue {
  number: number;
  title: string;
  url: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  form: "",
  bridging: "Bringing the USDC onto Arc…",
  approving: "Approving the escrow to pull the USDC…",
  funding: "Escrowing the bounty on Arc…",
  confirming: "Confirming with Proofwork…",
  done: "Funded.",
};

export function FundForm({ repos, feeBps }: { repos: RepoSummary[]; feeBps: number }) {
  const router = useRouter();
  const config = useConfig();
  const { address, isConnected, chainId, connector } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [amount, setAmount] = useState("50");
  const [days, setDays] = useState(14);
  const [stage, setStage] = useState<Stage>("form");
  const [source, setSource] = useState<Source>("arc");
  const [bridgeSteps, setBridgeSteps] = useState<BridgeStepView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingIssues, startLoadingIssues] = useTransition();

  const repo = repos.find((entry) => entry.id === repoId);
  const bridgeSource = BRIDGE_SOURCES.find((entry) => entry.key === source);
  // Bridging switches chains itself; only a direct escrow needs the wallet on Arc first.
  const wrongChain = isConnected && !bridgeSource && chainId !== arcTestnet.id;

  useEffect(() => {
    if (!repoId) return;
    setIssues([]);
    setIssueNumber(null);
    startLoadingIssues(async () => {
      try {
        setIssues(await listIssues(repoId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  }, [repoId]);

  const amountUsdc = safeAmount(amount);
  const ready = Boolean(repoId && issueNumber && amountUsdc && amountUsdc > 0n);

  async function fund() {
    if (!address || !issueNumber || !amountUsdc) return;
    setError(null);

    try {
      const draft: DraftBounty = await createBounty({
        repoId,
        issueNumber,
        amountUsdc: String(amountUsdc),
        expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        funderAddress: address,
      });

      if (bridgeSource) {
        setStage("bridging");
        setBridgeSteps([]);
        await switchChainAsync({ chainId: bridgeSource.chain.id });
        const provider = (await connector?.getProvider()) as EIP1193Provider | undefined;
        if (!provider) throw new Error("The connected wallet did not expose a provider.");

        const outcome = await bridgeToArc({
          provider,
          source: bridgeSource,
          amount: fromUsdc(BigInt(draft.split.total)),
          onStep: (step) =>
            setBridgeSteps((steps) => [...steps.filter((s) => s.name !== step.name), step]),
        });
        if (outcome.state !== "success") {
          const failed = outcome.steps.find((step) => step.state === "error");
          throw new Error(
            `The bridge stopped at ${failed?.name ?? "an unknown step"}${failed?.error ? `: ${failed.error}` : "."} Nothing was escrowed; the USDC is either still on ${bridgeSource.label} or already on Arc.`,
          );
        }
        await switchChainAsync({ chainId: arcTestnet.id });
      }

      setStage("approving");
      const approval = await sendTransactionAsync({
        to: draft.calldata.approve.to as `0x${string}`,
        data: draft.calldata.approve.data,
      });
      await waitForTransactionReceipt(config, { hash: approval });

      setStage("funding");
      const funding = await sendTransactionAsync({
        to: draft.calldata.createAndFund.to as `0x${string}`,
        data: draft.calldata.createAndFund.data,
      });
      await waitForTransactionReceipt(config, { hash: funding });

      setStage("confirming");
      await confirmFunding(draft.bountyId, funding);

      setStage("done");
      router.push(`/bounties/${draft.bountyId}`);
    } catch (cause) {
      setStage("form");
      setError(readableError(cause));
    }
  }

  const fee = amountUsdc ? bpsOf(amountUsdc, feeBps) : 0n;
  const total = amountUsdc ? amountUsdc + fee : 0n;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <Panel className="space-y-6 p-6">
        <Field label="Repository">
          <select
            value={repoId}
            onChange={(event) => setRepoId(event.target.value)}
            className="border-rule w-full rounded-lg border bg-paper px-3 py-2"
          >
            {repos.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.fullName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Issue">
          {loadingIssues ? (
            <p className="text-sm text-ink-faint">Loading open issues…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-ink-faint">No open issues on this repository.</p>
          ) : (
            <select
              value={issueNumber ?? ""}
              onChange={(event) => setIssueNumber(Number(event.target.value))}
              className="border-rule w-full rounded-lg border bg-paper px-3 py-2"
            >
              <option value="">Choose an issue…</option>
              {issues.map((issue) => (
                <option key={issue.number} value={issue.number}>
                  #{issue.number} — {issue.title}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Where is your USDC?">
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as Source)}
            className="border-rule w-full rounded-lg border bg-paper px-3 py-2"
          >
            <option value="arc">Already on Arc testnet</option>
            {BRIDGE_SOURCES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                On {entry.label} — bridge it first
              </option>
            ))}
          </select>
          {bridgeSource ? (
            <p className="mt-2 text-sm text-ink-faint">
              Circle App Kit moves the USDC over CCTP from your own wallet, then the escrow is
              funded on Arc. You need {bridgeSource.label} gas for the first two signatures; the
              mint on Arc is forwarded by Circle.
            </p>
          ) : null}
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Bounty (USDC)">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="border-rule tabular w-full rounded-lg border bg-paper px-3 py-2 font-mono"
            />
          </Field>
          <Field label="Expires in">
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="border-rule w-full rounded-lg border bg-paper px-3 py-2"
            >
              {[7, 14, 30, 60].map((option) => (
                <option key={option} value={option}>
                  {option} days
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

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
        ) : wrongChain ? (
          <button
            type="button"
            className={buttonStyles.primary}
            onClick={() => switchChain({ chainId: arcTestnet.id })}
          >
            Switch to Arc testnet
          </button>
        ) : (
          <button
            type="button"
            className={buttonStyles.primary}
            disabled={!ready || stage !== "form"}
            onClick={fund}
          >
            {stage === "form" ? `Escrow ${usdc(total)}` : STAGE_LABEL[stage]}
          </button>
        )}

        {stage !== "form" ? <p className="text-sm text-ink-soft">{STAGE_LABEL[stage]}</p> : null}

        {bridgeSteps.length > 0 ? (
          <ol className="border-rule divide-rule divide-y rounded-lg border text-sm">
            {BRIDGE_STEPS.map(({ name, label }) => {
              const step = bridgeSteps.find((entry) => entry.name === name);
              return (
                <li key={name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="w-5 font-mono text-xs text-ink-faint">
                    {step?.state === "success" ? "✓" : step?.state === "error" ? "×" : "·"}
                  </span>
                  <span className="flex-1">{label}</span>
                  {step?.explorerUrl ? (
                    <ExplorerLink href={step.explorerUrl}>transaction</ExplorerLink>
                  ) : step?.state ? (
                    <span className="text-ink-faint">{step.state}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </Panel>

      <Panel className="h-fit p-6">
        <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">
          What this costs
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Line label="Bounty" value={usdc(amountUsdc ?? 0n)} />
          <Line label={`Protocol fee (${feeBps / 100}%)`} value={usdc(fee)} />
          <div className="border-rule border-t pt-3">
            <Line label="You send" value={usdc(total)} strong />
          </div>
        </dl>
        <p className="mt-5 text-sm text-ink-soft">
          {repo?.maintainerPayoutAddress
            ? "A share of the bounty goes to the maintainer who reviews and merges the work."
            : "This repository has no maintainer payout address yet, so the contributor receives the whole bounty."}
        </p>
        <p className="mt-3 text-sm text-ink-faint">
          Two signatures: one to let the escrow contract pull the USDC, one to create and fund the
          job. Both on Arc testnet.
        </p>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`tabular font-mono ${strong ? "font-medium" : "text-ink-soft"}`}>{value}</dd>
    </div>
  );
}

function safeAmount(value: string): bigint | null {
  try {
    const parsed = toUsdc(value.trim() || "0");
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/** Wallet errors are long; the first line is the part a person can act on. */
function readableError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.split("\n")[0] ?? message;
}
