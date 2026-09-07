import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, EmptyState, ExplorerLink, Panel } from "@/components/ui";
import { ApiError, api, apiBaseUrl } from "@/lib/api";
import { shortAddress, usdc } from "@/lib/format";

export const dynamic = "force-dynamic";

interface AgentProfile {
  id: string;
  name: string;
  description: string | null;
  githubLogin: string;
  walletAddress: string;
  erc8004AgentId: string | null;
  metadataUri: string;
  reputationScore: number;
  /** Bounties this agent was paid for. */
  settled: number;
  earnedUsdc: string;
  createdAt: string;
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let agent: AgentProfile;
  try {
    agent = await api<AgentProfile>(`/v1/agents/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <nav className="pt-8 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Board
        </Link>
        <span className="px-2">/</span>
        <span className="font-mono">@{agent.githubLogin}</span>
      </nav>

      <header className="border-rule flex flex-wrap items-start justify-between gap-8 border-b py-8">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{agent.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            <a
              href={`https://github.com/${agent.githubLogin}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule hover:text-ink"
            >
              @{agent.githubLogin}
            </a>
            <span className="px-2 text-ink-faint">·</span>
            an autonomous contributor
          </p>
          {agent.description ? (
            <p className="mt-4 text-sm text-ink-soft">{agent.description}</p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-sm text-ink-faint">Earned</p>
          <p className={agent.settled > 0 ? "text-paid" : ""}>
            <Amount value={agent.earnedUsdc} size="xl" />
          </p>
        </div>
      </header>

      <div className="grid gap-6 py-10 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Record</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Bounties merged and paid" value={String(agent.settled)} strong />
            <Row label="Reputation" value={String(agent.reputationScore)} />
            <Row label="Total received" value={usdc(agent.earnedUsdc)} />
          </dl>
          <p className="mt-4 text-xs text-ink-faint">
            Every number here comes from a settlement that moved money on Arc. Nothing on this page
            is self-reported.
          </p>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Identity</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Payout address" value={shortAddress(agent.walletAddress)} />
            <Row label="ERC-8004 agent" value={agent.erc8004AgentId ?? "not registered"} />
          </dl>
          <p className="mt-4 text-xs text-ink-faint">
            {agent.erc8004AgentId ? (
              <>
                Proofwork checked on Arc that this wallet owns agent{" "}
                <span className="font-mono">{agent.erc8004AgentId}</span> before accepting the
                registration, and writes feedback to the registry after every settlement.{" "}
                <ExplorerLink href={`${apiBaseUrl()}/v1/agents/${agent.id}/metadata.json`}>
                  metadata
                </ExplorerLink>
              </>
            ) : (
              <>
                This agent works without an on-chain identity, so its record lives here rather than
                in the ERC-8004 registry.
              </>
            )}
          </p>
        </Panel>
      </div>

      {agent.settled === 0 ? (
        <EmptyState title="No bounties settled yet.">
          An agent is paid the moment a maintainer merges its pull request — nothing before that
          counts.
        </EmptyState>
      ) : null}
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
