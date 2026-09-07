import Link from "next/link";
import { Amount, EmptyState, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo, usdcPlain } from "@/lib/format";
import type { BountySummary } from "@/lib/types";

/** The board: every funded issue, newest first. This is the shop window. */

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "submitted", label: "In review" },
  { value: "settled", label: "Paid" },
] as const;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tag?: string }>;
}) {
  const { status = "", tag } = await searchParams;
  const query = new URLSearchParams();
  if (status) query.set("status", status);

  const { bounties } = await api<{ bounties: BountySummary[] }>(
    `/v1/bounties${query.size > 0 ? `?${query}` : ""}`,
    { revalidate: 10 },
  );
  const visible = tag ? bounties.filter((bounty) => bounty.tags.includes(tag)) : bounties;

  const escrowed = visible
    .filter((bounty) => ["open", "claimed", "submitted", "settling"].includes(bounty.status))
    .reduce((total, bounty) => total + BigInt(bounty.amountUsdc), 0n);
  const paid = visible
    .filter((bounty) => bounty.status === "settled")
    .reduce((total, bounty) => total + BigInt(bounty.amountUsdc), 0n);

  return (
    <>
      <section className="border-rule border-b py-14">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Bounties that pay themselves the moment a maintainer merges.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          The money is escrowed in a contract on Arc before anyone starts. When the pull request is
          merged, the contributor, the maintainer who reviewed it and the protocol are all paid in
          one transaction — in seconds, in USDC.
        </p>

        <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6">
          <div>
            <dt className="text-sm text-ink-faint">Escrowed right now</dt>
            <dd className="mt-1">
              <Amount value={escrowed} size="lg" />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Paid out</dt>
            <dd className="mt-1 text-paid">
              <Amount value={paid} size="lg" />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Bounties listed</dt>
            <dd className="tabular mt-1 font-mono text-2xl tracking-tight">{visible.length}</dd>
          </div>
        </dl>
      </section>

      <nav className="flex flex-wrap items-center gap-2 py-6">
        {FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/?status=${filter.value}` : "/"}
              className={`rounded-full px-3 py-1 text-sm transition ${
                active ? "bg-ink text-paper" : "border-rule border text-ink-soft hover:text-ink"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState title="No bounties here yet.">
          <p>
            Fund the first one from{" "}
            <Link href="/new" className="text-accent-ink underline">
              an open issue
            </Link>
            .
          </p>
        </EmptyState>
      ) : (
        <ul className="border-rule divide-rule divide-y border-y">
          {visible.map((bounty) => (
            <li key={bounty.id}>
              <Link
                href={`/bounties/${bounty.id}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 py-5 transition hover:bg-surface"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-ink-faint">
                    {bounty.repo}#{bounty.issueNumber}
                  </p>
                  <p className="mt-1 truncate font-medium">{bounty.issueTitle}</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    Contributor {usdcPlain(bounty.split.contributor)}
                    {BigInt(bounty.split.maintainer) > 0n
                      ? ` · reviewer ${usdcPlain(bounty.split.maintainer)}`
                      : ""}{" "}
                    · {bounty.status === "settled" ? "paid" : "expires"}{" "}
                    {timeAgo(bounty.status === "settled" ? bounty.createdAt : bounty.expiresAt)}
                  </p>
                </div>
                <StatusPill status={bounty.status} />
                <div className="w-32 text-right">
                  <Amount value={bounty.amountUsdc} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
