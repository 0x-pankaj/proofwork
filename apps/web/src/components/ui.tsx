import type { ReactNode } from "react";
import { usdc } from "@/lib/format";
import type { BountyStatus } from "@/lib/types";

/** The small pieces every page is built from. Deliberately few, deliberately plain. */

const STATUS: Record<BountyStatus, { label: string; tone: "open" | "work" | "paid" | "done" }> = {
  draft: { label: "Draft", tone: "done" },
  funding: { label: "Funding", tone: "work" },
  pending_accept: { label: "Awaiting maintainer", tone: "work" },
  open: { label: "Open", tone: "open" },
  claimed: { label: "Claimed", tone: "work" },
  submitted: { label: "In review", tone: "work" },
  settling: { label: "Paying out", tone: "work" },
  settled: { label: "Paid", tone: "paid" },
  rejected: { label: "Rejected", tone: "done" },
  expired: { label: "Expired", tone: "done" },
  cancelled: { label: "Cancelled", tone: "done" },
};

const TONES = {
  open: "bg-accent-soft text-accent-ink",
  work: "bg-pending-soft text-pending",
  paid: "bg-paid-soft text-paid",
  done: "bg-surface text-ink-faint",
} as const;

export function StatusPill({ status }: { status: BountyStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

/** Money is always monospace and always aligned; that is the whole trick. */
export function Amount({
  value,
  size = "base",
}: {
  value: string | bigint;
  size?: "sm" | "base" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-2xl",
    xl: "text-4xl sm:text-5xl",
  } as const;

  // At display sizes the ticker competes with the figure, so it is set down a step.
  const [figure, ticker] = usdc(value).split(" ");
  return (
    <span className={`tabular font-mono ${sizes[size]} tracking-tight whitespace-nowrap`}>
      {figure}
      <span className={size === "xl" ? "ml-2 text-[0.45em] text-ink-faint" : "ml-1"}>{ticker}</span>
    </span>
  );
}

export function PageHeading({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 text-ink-soft">{lead}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`border-rule rounded-xl border bg-raised ${className}`}>{children}</section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-rule rounded-xl border border-dashed px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function ExplorerLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-sm text-accent-ink underline decoration-accent/40 hover:decoration-accent"
    >
      {children}
    </a>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-accent text-white hover:opacity-90`,
  secondary: `${BUTTON_BASE} border-rule border bg-raised hover:bg-surface`,
  quiet: `${BUTTON_BASE} text-ink-soft hover:text-ink`,
} as const;
