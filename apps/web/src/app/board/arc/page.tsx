import type { Metadata } from "next";
import Link from "next/link";
import { BountyList } from "@/components/bounty-list";
import { Amount, buttonStyles, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { usdcPlain } from "@/lib/format";
import type { ArcBoard } from "@/lib/types";

export const metadata: Metadata = {
  title: "Arc Integration Board",
  description:
    "The chain entries, SDK configs, indexer support and examples Arc needs before mainnet, as bounties anyone can fund.",
};

/**
 * The launch view. Arc mainnet lands on 16 September; every wallet, SDK and indexer that
 * wants to be there needs the same small pull request. Funded ones are bounties; the rest
 * are waiting for a funder.
 */
export default async function ArcBoardPage() {
  const board = await api<ArcBoard>("/v1/board/arc-integration", { revalidate: 10 });

  const live = board.funded.filter((bounty) =>
    ["open", "claimed", "submitted", "settling"].includes(bounty.status),
  );
  const escrowed = live.reduce((total, bounty) => total + BigInt(bounty.amountUsdc), 0n);
  const suggested = board.suggested.reduce(
    (total, task) => total + BigInt(task.suggestedBudgetUsdc),
    0n,
  );

  return (
    <>
      <section className="border-rule border-b py-14">
        <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">
          Arc mainnet · 16 September 2026
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Everything Arc needs a pull request for before mainnet.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Chain entries, SDK configs, indexer support, examples. Each one is a small change in a
          repository somebody else maintains, and the maintainer who reviews it is paid out of the
          bounty when they merge. Fund the ones you need; claim the ones you can do.
        </p>

        <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6">
          <div>
            <dt className="text-sm text-ink-faint">Funded</dt>
            <dd className="tabular mt-1 font-mono text-2xl tracking-tight">
              {board.funded.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Escrowed right now</dt>
            <dd className="mt-1">
              <Amount value={escrowed} size="lg" />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Waiting for a funder</dt>
            <dd className="tabular mt-1 font-mono text-2xl tracking-tight">
              {board.suggested.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Suggested in total</dt>
            <dd className="mt-1">
              <Amount value={suggested} size="lg" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Funded</h2>
          <Link href="/new" className={buttonStyles.secondary}>
            Fund an issue
          </Link>
        </div>
        {board.funded.length === 0 ? (
          <EmptyState title="Nothing funded yet.">
            <p>Pick a task below, open the issue, and escrow it from an open issue.</p>
          </EmptyState>
        ) : (
          <BountyList bounties={board.funded} />
        )}
      </section>

      <section className="py-4">
        <h2 className="text-2xl font-semibold tracking-tight">Waiting for a funder</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Budgets are suggestions, sized to what a maintainer&apos;s review of that change is worth.
          Open the issue on the repository, then fund it here and tag it{" "}
          <code className="font-mono text-sm">{board.tag}</code>.
        </p>

        {board.categories.map((category) => {
          const tasks = board.suggested.filter((task) => task.category === category);
          if (tasks.length === 0) return null;
          return (
            <div key={category} className="mt-10">
              <h3 className="font-mono text-xs tracking-wide text-ink-faint uppercase">
                {category}
              </h3>
              <ul className="border-rule divide-rule mt-3 divide-y border-y">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 py-5">
                    <div className="min-w-0 flex-1">
                      <a
                        href={task.issueUrl ?? task.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-ink-faint hover:text-ink"
                      >
                        {task.repo}
                      </a>
                      <p className="mt-1 font-medium">{task.title}</p>
                      <p className="mt-1 text-sm text-ink-soft">{task.summary}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-ink-faint">
                        suggested {usdcPlain(task.suggestedBudgetUsdc)}
                      </span>
                      <Link
                        href={task.issueUrl ? "/new" : task.repoUrl}
                        className={buttonStyles.secondary}
                      >
                        {task.issueUrl ? "Fund this" : "Open the issue"}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}
