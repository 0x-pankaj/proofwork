import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { EmptyState, PageHeading, Panel, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { usdc } from "@/lib/format";
import type { BountySummary, RepoSummary } from "@/lib/types";
import { AcceptButton } from "./accept-button";
import { PolicyForm } from "./policy-form";

export const dynamic = "force-dynamic";

export default async function RepoSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <PageHeading title="Repository settings" />
        <EmptyState title="Sign in with GitHub to change a repository's terms." />
      </>
    );
  }

  const { repos } = await api<{ repos: RepoSummary[] }>("/v1/repos", { actingUserId: user.id });
  const repo = repos.find((entry) => entry.id === id);
  if (!repo) notFound();

  const { bounties } = await api<{ bounties: BountySummary[] }>(
    `/v1/bounties?repoId=${id}&status=pending_accept`,
  );

  return (
    <>
      <PageHeading
        title={repo.fullName}
        lead="Your terms for this repository, and any bounty waiting on your say-so."
      />

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <PolicyForm
          repoId={repo.id}
          policy={repo.policy}
          maintainerPayoutAddress={repo.maintainerPayoutAddress}
        />

        <Panel className="h-fit p-6">
          <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">
            Waiting for you
          </h2>

          {bounties.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Nothing to accept. Bounties on this repository open for work as soon as they are
              funded.
            </p>
          ) : (
            <ul className="divide-rule mt-3 divide-y">
              {bounties.map((bounty) => (
                <li key={bounty.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/bounties/${bounty.id}`} className="font-medium hover:underline">
                      #{bounty.issueNumber} {bounty.issueTitle}
                    </Link>
                    <span className="tabular font-mono text-sm">{usdc(bounty.amountUsdc)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <StatusPill status={bounty.status} />
                    <AcceptButton repoId={repo.id} bountyId={bounty.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
