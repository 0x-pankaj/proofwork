/** The shapes the API returns. Kept here so pages read like the product, not like JSON. */

export type BountyStatus =
  | "draft"
  | "funding"
  | "pending_accept"
  | "open"
  | "claimed"
  | "submitted"
  | "settling"
  | "settled"
  | "rejected"
  | "expired"
  | "cancelled";

export interface Split {
  contributor: string;
  maintainer: string;
  fee: string;
  total: string;
}

export interface BountySummary {
  id: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  status: BountyStatus;
  amountUsdc: string;
  feeUsdc: string;
  split: Split;
  maintainerRewardBps: number;
  jobId: string | null;
  tags: string[];
  expiresAt: string;
  createdAt: string;
  settledAt: string | null;
  createTxUrl: string | null;
  settleTxUrl: string | null;
}

export interface BountyClaim {
  login: string;
  kind: "user" | "agent";
  status: "active" | "withdrawn" | "won" | "lost" | "expired";
  payoutAddress: string;
  claimedAt: string;
}

export interface BountySubmission {
  prNumber: number;
  prUrl: string;
  mergeSha: string | null;
  mergedAt: string | null;
  deliverableHash: string | null;
}

export interface BountySettlement {
  status: "pending" | "submitted" | "complete" | "failed";
  txHash: string | null;
  txUrl: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface BountyDetail extends BountySummary {
  claims: BountyClaim[];
  submission: BountySubmission | null;
  settlement: BountySettlement | null;
}

export interface RepoPolicy {
  aiContributions: "allowed" | "disclosure" | "none";
  minStakeUsdc: string;
  autoAccept: boolean;
  claimTtlHours: number;
}

export interface RepoSummary {
  id: string;
  fullName: string;
  private: boolean;
  policy: RepoPolicy;
  maintainerPayoutAddress: string | null;
  evaluatorMode: "proofwork" | "client";
}

export interface IssueSummary {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

export interface Me {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  payoutAddress: string | null;
  payoutKind: string;
}

/** A curated Arc-integration task that nobody has funded yet. */
export interface ArcTask {
  id: string;
  title: string;
  repo: string;
  repoUrl: string;
  category: string;
  summary: string;
  suggestedBudgetUsdc: string;
  issueUrl: string | null;
}

export interface ArcBoard {
  tag: string;
  funded: BountySummary[];
  suggested: ArcTask[];
  categories: string[];
}
