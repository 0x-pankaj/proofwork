import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline, type TimelineStep } from "@/components/timeline";
import { Amount, ExplorerLink, Panel, StatusPill } from "@/components/ui";
import { WalletProvider } from "@/components/wallet-provider";
import { ApiError, api } from "@/lib/api";
import { shortAddress, timeAgo, usdc } from "@/lib/format";
import type { BountyDetail } from "@/lib/types";
import { reclaimQuote } from "./actions";
import { ReclaimPanel } from "./reclaim-panel";

export const dynamic = "force-dynamic";

/** Statuses where money may still be held on chain and could come back. */
const HOLDS_ESCROW: string[] = ["pending_accept", "open", "claimed", "submitted", "expired"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const bounty = await api<BountyDetail>(`/v1/bounties/${id}`);
    const paid = bounty.status === "settled";
    return {
      title: `${bounty.repo}#${bounty.issueNumber} — ${bounty.issueTitle}`,
      description: `${usdc(bounty.amountUsdc)} ${paid ? "paid on merge" : "escrowed on Arc"} for "${bounty.issueTitle}". The contributor, the reviewing maintainer and the protocol are paid in one transaction.`,
    };
  } catch {
    return { title: "Bounty" };
  }
}

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let bounty: BountyDetail;
  try {
    bounty = await api<BountyDetail>(`/v1/bounties/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const maintainerShare = BigInt(bounty.split.maintainer);
  const settled = bounty.status === "settled";

  // Only asked for while the escrow could still be sitting there, so a settled bounty does
  // not pay for a round trip that can only ever answer "no".
  const quote = HOLDS_ESCROW.includes(bounty.status) ? await reclaimQuote(id) : null;

  return (
    <>
      <nav className="pt-8 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Board
        </Link>
        <span className="px-2">/</span>
        <span className="font-mono">
          {bounty.repo}#{bounty.issueNumber}
        </span>
      </nav>

      <header className="border-rule flex flex-wrap items-start justify-between gap-8 border-b py-8">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-3">
            <StatusPill status={bounty.status} />
            <a
              href={bounty.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-soft underline decoration-rule hover:text-ink"
            >
              View on GitHub
            </a>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            {bounty.issueTitle}
          </h1>
          <p className="mt-2 text-sm text-ink-faint">
            {settled ? "Paid" : "Expires"}{" "}
            {timeAgo(settled ? (bounty.settledAt ?? bounty.createdAt) : bounty.expiresAt)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm text-ink-faint">Escrowed</p>
          <p className={settled ? "text-paid" : ""}>
            <Amount value={bounty.amountUsdc} size="xl" />
          </p>
        </div>
      </header>

      <div className="grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Settlement</h2>
          <div className="mt-5">
            <Timeline steps={stepsFor(bounty)} />
          </div>
        </section>

        <aside className="space-y-6">
          {quote?.reclaimable ? (
            <WalletProvider>
              <ReclaimPanel bountyId={bounty.id} quote={quote} />
            </WalletProvider>
          ) : null}

          <Panel className="p-5">
            <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">
              Who gets paid
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Contributor" value={usdc(bounty.split.contributor)} strong />
              {maintainerShare > 0n ? (
                <Row label="Reviewing maintainer" value={usdc(bounty.split.maintainer)} />
              ) : null}
              <Row label="Protocol fee" value={usdc(bounty.split.fee)} />
              <div className="border-rule border-t pt-3">
                <Row label="Funder pays" value={usdc(bounty.split.total)} strong />
              </div>
            </dl>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Claims</h2>
            {bounty.claims.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                Nobody yet. Comment <code className="font-mono">/claim</code> on the issue to take
                it.
              </p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {bounty.claims.map((claim) => (
                  <li key={claim.login} className="flex items-baseline justify-between gap-3">
                    <span>
                      @{claim.login}
                      {claim.kind === "agent" ? (
                        <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-ink-faint">
                          agent
                        </span>
                      ) : null}
                      {claim.status === "won" ? (
                        <span className="ml-2 rounded bg-paid-soft px-1.5 py-0.5 text-xs text-paid">
                          paid
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-ink-faint">
                      {shortAddress(claim.payoutAddress)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {bounty.jobId ? (
            <Panel className="p-5 text-sm">
              <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">
                On chain
              </h2>
              <dl className="mt-4 space-y-3">
                <Row label="Job" value={`#${bounty.jobId}`} />
                {bounty.createTxUrl ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-soft">Escrow</dt>
                    <dd>
                      <ExplorerLink href={bounty.createTxUrl}>view</ExplorerLink>
                    </dd>
                  </div>
                ) : null}
                {bounty.settleTxUrl ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-soft">Settlement</dt>
                    <dd>
                      <ExplorerLink href={bounty.settleTxUrl}>view</ExplorerLink>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`tabular font-mono ${strong ? "font-medium" : "text-ink-soft"}`}>{value}</dd>
    </div>
  );
}

/** The five things that happen to a bounty, and how far this one has got. */
function stepsFor(bounty: BountyDetail): TimelineStep[] {
  const funded = bounty.jobId !== null;
  const claimed =
    bounty.claims.length > 0 ||
    ["claimed", "submitted", "settling", "settled"].includes(bounty.status);
  const submitted = bounty.submission !== null;
  const merged = Boolean(bounty.submission?.mergedAt);
  const paid = bounty.status === "settled";
  // A settled bounty has no active claims left, so the timeline reads every claim and
  // names the one that won: who was paid is the point of the page.
  const working = bounty.claims.filter((claim) => claim.status !== "withdrawn");
  const winner = bounty.claims.find((claim) => claim.status === "won");

  const state = (done: boolean, current: boolean): TimelineStep["state"] =>
    done ? "done" : current ? "current" : "waiting";

  return [
    {
      label: "Escrow funded on Arc",
      detail: bounty.createTxUrl ? (
        <ExplorerLink href={bounty.createTxUrl}>funding transaction</ExplorerLink>
      ) : (
        "Waiting for the funding transaction to confirm."
      ),
      at: funded ? timeAgo(bounty.createdAt) : null,
      state: state(funded, !funded),
    },
    {
      label: claimed
        ? `Claimed by ${working.map((claim) => `@${claim.login}`).join(", ") || "a contributor"}`
        : "Waiting for a claimant",
      detail: claimed ? undefined : "Anyone can comment /claim on the issue.",
      at: working[0] ? timeAgo(working[0].claimedAt) : null,
      state: state(claimed, funded && !claimed),
    },
    {
      label: submitted
        ? `Pull request #${bounty.submission?.prNumber}`
        : "Waiting for a pull request",
      detail: bounty.submission ? (
        <a
          href={bounty.submission.prUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule hover:text-ink"
        >
          {bounty.repo}#{bounty.submission.prNumber}
        </a>
      ) : (
        `The pull request must say “Fixes #${bounty.issueNumber}”.`
      ),
      state: state(submitted, claimed && !submitted),
    },
    {
      label: merged ? "Merged by a maintainer" : "Waiting for a merge",
      detail: bounty.submission?.mergeSha ? (
        <span className="font-mono text-xs">{bounty.submission.mergeSha.slice(0, 12)}</span>
      ) : undefined,
      at: bounty.submission?.mergedAt ? timeAgo(bounty.submission.mergedAt) : null,
      state: state(merged, submitted && !merged),
    },
    {
      label: paid
        ? `Paid ${winner ? `@${winner.login}` : "the contributor"} in one transaction`
        : "Payout",
      detail:
        bounty.settlement?.status === "failed" ? (
          <span className="text-danger">{bounty.settlement.error}</span>
        ) : bounty.settlement?.txUrl ? (
          <ExplorerLink href={bounty.settlement.txUrl}>settlement transaction</ExplorerLink>
        ) : (
          "Runs automatically the moment the pull request is merged."
        ),
      at: bounty.settlement?.completedAt ? timeAgo(bounty.settlement.completedAt) : null,
      state: state(paid, merged && !paid),
    },
  ];
}
