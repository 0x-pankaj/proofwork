/**
 * The life of a bounty, and the only moves allowed within it.
 *
 * This is deliberately the single place where "what can happen next" is decided.
 * Webhooks arrive out of order and get redelivered, so every handler asks here
 * rather than trusting the event it just received.
 */
export const BOUNTY_STATUSES = [
  "draft",
  "funding",
  "pending_accept",
  "open",
  "claimed",
  "submitted",
  "settling",
  "settled",
  "rejected",
  "expired",
  "cancelled",
] as const;

export type BountyStatus = (typeof BOUNTY_STATUSES)[number];

/** Statuses from which nothing further can happen. */
export const TERMINAL_STATUSES = ["settled", "rejected", "expired", "cancelled"] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

const TRANSITIONS: Record<BountyStatus, readonly BountyStatus[]> = {
  /** Created in the app, no money committed yet. */
  draft: ["funding", "cancelled"],
  /** The funding transaction is in flight. Back to draft if it fails. */
  funding: ["pending_accept", "open", "draft"],
  /** Waiting for a maintainer who has not opted into auto-accept. */
  pending_accept: ["open", "rejected", "cancelled", "expired"],
  /** Claimable. */
  open: ["claimed", "cancelled", "expired"],
  /** Someone holds it. Returns to open if they walk away or the claim times out. */
  claimed: ["submitted", "open", "expired", "rejected"],
  /** A pull request is up. Back to claimed if it is closed without merging. */
  submitted: ["settling", "claimed", "expired", "rejected"],
  /** Paying out. Back to submitted if the transaction fails, so it can be retried. */
  settling: ["settled", "submitted"],
  settled: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: BountyStatus,
    readonly to: BountyStatus,
  ) {
    super(`a bounty cannot move from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Whether a bounty in `from` may move to `to`. */
export function canTransition(from: BountyStatus, to: BountyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws unless the move is allowed. */
export function assertTransition(from: BountyStatus, to: BountyStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Every status reachable in one step. */
export function nextStatuses(from: BountyStatus): readonly BountyStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: BountyStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Money is escrowed on chain and has not yet been paid out or refunded. */
export function holdsEscrow(status: BountyStatus): boolean {
  return (
    status === "pending_accept" ||
    status === "open" ||
    status === "claimed" ||
    status === "submitted" ||
    status === "settling"
  );
}

/** Whether a contributor may claim it right now. */
export function isClaimable(status: BountyStatus): boolean {
  return status === "open";
}
