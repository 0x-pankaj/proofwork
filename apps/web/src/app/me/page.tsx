import Link from "next/link";
import { currentUser } from "@/auth";
import { EmptyState, PageHeading, Panel, StatusPill } from "@/components/ui";
import { WalletProvider } from "@/components/wallet-provider";
import { api } from "@/lib/api";
import { timeAgo, usdc } from "@/lib/format";
import type { BountyStatus, Me, RepoSummary } from "@/lib/types";
import { PayoutCard } from "./payout-card";

export const dynamic = "force-dynamic";

interface ClaimRow {
  id: string;
  status: string;
  claimedAt: string;
  bountyId: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  amountUsdc: string;
  bountyStatus: BountyStatus;
}

interface SettlementRow {
  id: string;
  status: string;
  amountUsdc: string;
  /** What reached this person, after the reviewing maintainer's share. */
  receivedUsdc: string;
  repo: string;
  issueNumber: number;
  txUrl: string | null;
  completedAt: string | null;
}

interface FundedRow {
  id: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  status: BountyStatus;
  amountUsdc: string;
  createdAt: string;
}

export default async function MePage() {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <PageHeading title="You" />
        <EmptyState title="Sign in with GitHub to see your claims and payouts." />
      </>
    );
  }

  const [me, claims, settlements, funded, repos] = await Promise.all([
    api<Me>("/v1/users/me", { actingUserId: user.id }),
    api<{ claims: ClaimRow[] }>("/v1/users/me/claims", { actingUserId: user.id }),
    api<{ settlements: SettlementRow[] }>("/v1/users/me/settlements", { actingUserId: user.id }),
    api<{ bounties: FundedRow[] }>("/v1/users/me/bounties", { actingUserId: user.id }),
    api<{ repos: RepoSummary[] }>("/v1/repos", { actingUserId: user.id }),
  ]);

  const earned = settlements.settlements
    .filter((row) => row.status === "complete")
    .reduce((total, row) => total + BigInt(row.receivedUsdc), 0n);

  return (
    <>
      <PageHeading
        title={`@${me.login}`}
        lead="Your payout address, what you are working on, and what you have been paid."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <WalletProvider>
          <PayoutCard userId={me.id} current={me.payoutAddress} />
        </WalletProvider>

        <Panel className="p-6">
          <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">Earned</h2>
          <p className="tabular mt-3 font-mono text-3xl tracking-tight text-paid">{usdc(earned)}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {settlements.settlements.length} settlement
            {settlements.settlements.length === 1 ? "" : "s"} on Arc.
          </p>
        </Panel>
      </div>

      <Section title="Repositories you maintain">
        {repos.repos.length === 0 ? (
          <EmptyState title="No repository yet.">
            <p>
              <Link href="/install" className="text-accent-ink underline">
                Install the GitHub App
              </Link>{" "}
              on a repository you maintain, then set its terms here.
            </p>
          </EmptyState>
        ) : (
          <Rows>
            {repos.repos.map((repo) => (
              <li key={repo.id}>
                <Link
                  href={`/repos/${repo.id}/settings`}
                  className="flex items-center gap-4 py-4 transition hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{repo.fullName}</p>
                    <p className="mt-1 text-sm text-ink-faint">{policySummary(repo)}</p>
                  </div>
                  <span className="text-sm text-accent-ink underline">Settings</span>
                </Link>
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Claims">
        {claims.claims.length === 0 ? (
          <EmptyState title="No claims yet.">
            <p>
              Find something on the{" "}
              <Link href="/" className="text-accent-ink underline">
                board
              </Link>{" "}
              and comment <code className="font-mono">/claim</code> on the issue.
            </p>
          </EmptyState>
        ) : (
          <Rows>
            {claims.claims.map((claim) => (
              <Row
                key={claim.id}
                href={`/bounties/${claim.bountyId}`}
                title={claim.issueTitle}
                subtitle={`${claim.repo}#${claim.issueNumber} · claimed ${timeAgo(claim.claimedAt)}`}
                amount={claim.amountUsdc}
                status={claim.bountyStatus}
              />
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Payouts">
        {settlements.settlements.length === 0 ? (
          <EmptyState title="Nothing paid out yet." />
        ) : (
          <Rows>
            {settlements.settlements.map((row) => (
              <li key={row.id} className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {row.repo}#{row.issueNumber}
                  </p>
                  <p className="mt-1 text-sm text-ink-faint">
                    {row.completedAt ? `Paid ${timeAgo(row.completedAt)}` : row.status}
                    {row.txUrl ? (
                      <>
                        {" · "}
                        <a
                          href={row.txUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-ink underline"
                        >
                          transaction
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="tabular font-mono text-paid">{usdc(row.receivedUsdc)}</span>
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Funded by you">
        {funded.bounties.length === 0 ? (
          <EmptyState title="You have not funded a bounty yet.">
            <p>
              <Link href="/new" className="text-accent-ink underline">
                Escrow one against an open issue
              </Link>
              .
            </p>
          </EmptyState>
        ) : (
          <Rows>
            {funded.bounties.map((bounty) => (
              <Row
                key={bounty.id}
                href={`/bounties/${bounty.id}`}
                title={bounty.issueTitle}
                subtitle={`${bounty.repo}#${bounty.issueNumber} · funded ${timeAgo(bounty.createdAt)}`}
                amount={bounty.amountUsdc}
                status={bounty.status}
              />
            ))}
          </Rows>
        )}
      </Section>
    </>
  );
}

/** The terms in one line, so a maintainer can see at a glance what still needs setting. */
function policySummary(repo: RepoSummary): string {
  const ai = { allowed: "AI welcome", disclosure: "AI with disclosure", none: "no AI" }[
    repo.policy.aiContributions
  ];
  const reward = repo.maintainerPayoutAddress
    ? "review reward set"
    : "no review reward address yet";
  return `${ai} · ${usdc(repo.policy.minStakeUsdc)} stake · ${repo.policy.claimTtlHours}h claims · ${reward}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-12">
      <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="border-rule divide-rule divide-y border-y">{children}</ul>;
}

function Row({
  href,
  title,
  subtitle,
  amount,
  status,
}: {
  href: string;
  title: string;
  subtitle: string;
  amount: string;
  status: BountyStatus;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 py-4 transition hover:bg-surface">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>
        </div>
        <StatusPill status={status} />
        <span className="tabular w-28 text-right font-mono">{usdc(amount)}</span>
      </Link>
    </li>
  );
}
