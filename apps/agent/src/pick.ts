import type { BountyDetail, BountySummary } from "@proofwork/skill";

/**
 * Choosing what to work on.
 *
 * Richest first, but not blindly: for a twentieth of a cent the fit endpoint says whether
 * the repository even accepts agents, how many others are already on it, and how much
 * time is left. Asking about five bounties costs less than one wasted claim, so the agent
 * asks before it commits.
 */

export interface FitVerdict {
  score: number;
  reasons: string[];
  blockers: string[];
}

export interface BountySource {
  bounties(): Promise<BountySummary[]>;
  bounty(id: string): Promise<BountyDetail>;
  /** Paid. Absent when the agent has no wallet, in which case it picks on price alone. */
  fit?: (bountyId: string) => Promise<FitVerdict>;
}

/** Below this the fit endpoint is telling the agent not to bother. */
export const FIT_THRESHOLD = 50;
/** How many of the richest bounties are worth paying to ask about. */
export const CANDIDATES = 5;
/** Two agents on one issue is competition; a third is a waste of everyone's review time. */
const MAX_ACTIVE_CLAIMS = 2;

export async function pick(
  source: BountySource,
  bountyId: string | undefined,
  log: (line: string) => void = () => {},
): Promise<BountyDetail | undefined> {
  if (bountyId) {
    const chosen = await source.bounty(bountyId);
    if (source.fit && !(await worthIt(source.fit, chosen, log))) return undefined;
    return chosen;
  }

  const open = await source.bounties();
  const richest = [...open]
    .sort((a, b) => (BigInt(b.split.contributor) > BigInt(a.split.contributor) ? 1 : -1))
    .slice(0, CANDIDATES);

  for (const summary of richest) {
    const bounty = await source.bounty(summary.id);
    const active = bounty.claims.filter((claim) => claim.status === "active").length;
    if (active >= MAX_ACTIVE_CLAIMS) {
      log(`skipping ${bounty.repo}#${bounty.issueNumber}: ${active} agents already on it`);
      continue;
    }
    if (source.fit && !(await worthIt(source.fit, bounty, log))) continue;
    return bounty;
  }
  return undefined;
}

async function worthIt(
  fit: NonNullable<BountySource["fit"]>,
  bounty: BountyDetail,
  log: (line: string) => void,
): Promise<boolean> {
  const verdict = await fit(bounty.id);
  const label = `${bounty.repo}#${bounty.issueNumber}`;

  if (verdict.blockers.length > 0) {
    log(`skipping ${label}: ${verdict.blockers.join("; ")}`);
    return false;
  }
  if (verdict.score < FIT_THRESHOLD) {
    log(`skipping ${label}: fit ${verdict.score}/100 — ${verdict.reasons.join("; ")}`);
    return false;
  }
  log(`${label}: fit ${verdict.score}/100 — ${verdict.reasons.join("; ")}`);
  return true;
}
