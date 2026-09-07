import { bpsOf } from "@proofwork/chain";
import { isClaimable } from "@proofwork/core";
import {
  activeClaimsFor,
  type Bounty,
  bountyWithRepo,
  type Claim,
  type Database,
  type Repo,
} from "@proofwork/db";
import { failure, ok, type Result } from "./result";

/**
 * Is this bounty worth an agent's time?
 *
 * An agent scanning the board would otherwise fetch a bounty, a repository policy and a
 * claim list to find out that the repo refuses AI contributions. This answers it in one
 * call for a twentieth of a cent — cheap enough to ask about every bounty on the board,
 * and priced so that asking about all of them still costs less than one wasted claim.
 *
 * It is a filter, not a recommendation. Everything it returns is a fact the agent could
 * have read itself; the score is only the arithmetic on top.
 */

export const FIT_PRICE_USDC = 500n;

export interface Fit {
  score: number;
  reasons: string[];
  blockers: string[];
}

export interface FitQuery {
  bountyId: string | undefined;
  /** Comma-separated, compared against the bounty's tags and title. */
  skills: string | undefined;
}

export async function fit(db: Database, query: FitQuery): Promise<Result> {
  if (!query.bountyId) return failure(400, "invalid_request", "pass ?bountyId=<uuid>");

  const listing = await bountyWithRepo(db, query.bountyId);
  if (!listing) return failure(404, "not_found", "no such bounty");

  const { bounty, repo } = listing;
  const claims = await activeClaimsFor(db, bounty.id);
  const scored = scoreFit({
    bounty,
    repo,
    claims,
    skills: skillsOf(query.skills),
    now: new Date(),
  });

  return ok({
    bountyId: bounty.id,
    repo: repo.fullName,
    issueNumber: bounty.issueNumber,
    issueTitle: bounty.issueTitle,
    status: bounty.status,
    /** What a contributor actually receives; the rest is the maintainer's review reward. */
    contributorUsdc: String(
      bounty.amountUsdc - bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps),
    ),
    amountUsdc: String(bounty.amountUsdc),
    tags: bounty.tags,
    expiresAt: bounty.expiresAt,
    competingClaims: claims.length,
    policy: {
      aiContributions: repo.policy.aiContributions,
      minStakeUsdc: repo.policy.minStakeUsdc,
      claimTtlHours: repo.policy.claimTtlHours,
    },
    ...scored,
  });
}

function skillsOf(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);
}

export interface FitInput {
  bounty: Pick<
    Bounty,
    "status" | "amountUsdc" | "maintainerRewardBps" | "expiresAt" | "tags" | "issueTitle"
  >;
  repo: Pick<Repo, "policy">;
  claims: Claim[];
  skills: string[];
  now: Date;
}

/**
 * The arithmetic, kept apart from the request so every branch is testable.
 *
 * A blocker means "do not claim this": it is not a low score, it is a wasted stake. The
 * score only ranks what is left.
 */
export function scoreFit(input: FitInput): Fit {
  const { bounty, repo, claims, skills, now } = input;
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (!isClaimable(bounty.status)) {
    blockers.push(`the bounty is ${bounty.status}, so it cannot be claimed`);
  }
  if (repo.policy.aiContributions === "none") {
    blockers.push("this repository does not accept AI contributions");
  }

  const hoursLeft = (bounty.expiresAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) {
    blockers.push("the deadline has passed");
  }
  if (blockers.length > 0) return { score: 0, reasons, blockers };

  let score = 0.5;

  // Time to actually do the work, measured against the claim window a repository allows.
  if (hoursLeft >= repo.policy.claimTtlHours) {
    score += 0.15;
    reasons.push(
      `${Math.floor(hoursLeft)} hours left, more than the ${repo.policy.claimTtlHours}-hour claim window`,
    );
  } else {
    score -= 0.15;
    reasons.push(`only ${Math.floor(hoursLeft)} hours left before the bounty expires`);
  }

  // Every other active claim is someone who may merge first and take the whole payout.
  if (claims.length === 0) {
    score += 0.15;
    reasons.push("nobody else is working on it");
  } else {
    score -= Math.min(0.3, claims.length * 0.1);
    reasons.push(`${claims.length} other claim${claims.length === 1 ? "" : "s"} already open`);
  }

  const matched = matchedSkills(skills, bounty);
  if (skills.length > 0) {
    if (matched.length > 0) {
      score += 0.2;
      reasons.push(`matches ${matched.join(", ")}`);
    } else {
      score -= 0.2;
      reasons.push("none of the skills given appear in the tags or the title");
    }
  }

  if (repo.policy.aiContributions === "disclosure") {
    reasons.push("the pull request must say it is AI-assisted");
  }

  return { score: Math.round(Math.min(1, Math.max(0, score)) * 100) / 100, reasons, blockers };
}

function matchedSkills(skills: string[], bounty: FitInput["bounty"]): string[] {
  const haystack = [...bounty.tags, bounty.issueTitle].join(" ").toLowerCase();
  return skills.filter((skill) => haystack.includes(skill));
}
