import Link from "next/link";
import { Amount, StatusPill } from "@/components/ui";
import { timeAgo, usdcPlain } from "@/lib/format";
import type { BountySummary } from "@/lib/types";

/** One row per funded issue: who is paid what, and where it stands. */
export function BountyList({ bounties }: { bounties: BountySummary[] }) {
  return (
    <ul className="border-rule divide-rule divide-y border-y">
      {bounties.map((bounty) => (
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
                {timeAgo(
                  bounty.status === "settled"
                    ? (bounty.settledAt ?? bounty.createdAt)
                    : bounty.expiresAt,
                )}
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
  );
}
