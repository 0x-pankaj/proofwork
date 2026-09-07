import { bpsOf } from "@proofwork/chain";
import { deliverableHash } from "@proofwork/core";
import type { Bounty, Claim, RepoWithInstallation } from "@proofwork/db";
import {
  claimFirstComment,
  disclosureMissingComment,
  hasAiDisclosure,
  isBotAuthor,
  type PullRequestEvent,
  parseLinkedIssues,
  pullRequestLinkedComment,
  type RenderedComment,
} from "@proofwork/github";
import type { Env } from "../../env";
import type { Store } from "../../store";
import { bountyUrl, repoSettingsUrl } from "../../urls";
import { repoRef } from "../repo-ref";
import type { CommentWriter } from "./issues";

/**
 * Pull requests: linking one to a bounty, and deciding whether a merge is payable.
 *
 * The merge guards are the security boundary of the whole product. The verifier wallet
 * can release escrow, so it must only ever do so for a pull request that a claimant
 * actually opened, that closes the funded issue, and that was merged into the branch the
 * repository ships from. Everything below exists to make that true.
 */

export interface PullRequestDeps {
  store: Store;
  github: CommentWriter;
  env: Env;
  /** Runs once a merge has passed every guard. Wired to the settlement orchestrator. */
  settle?: (bountyId: string) => Promise<void>;
}

interface Linked {
  found: RepoWithInstallation;
  bounty: Bounty;
  claim: Claim | undefined;
}

export async function handlePullRequest(
  deps: PullRequestDeps,
  event: PullRequestEvent,
): Promise<void> {
  const author = event.pull_request.user;
  if (isBotAuthor(author)) return;

  const found = await deps.store.repoByGithubId(BigInt(event.repository.id));
  if (!found?.repo.installed || found.installation.suspended) return;

  switch (event.action) {
    case "opened":
    case "reopened":
    case "edited":
    case "synchronize":
      return link(deps, event, found);
    case "closed":
      return event.pull_request.merged_at
        ? merged(deps, event, found)
        : abandoned(deps, event, found);
    default:
      return;
  }
}

/** Finds the bounty this pull request claims to fix, and who on it has claimed. */
async function resolve(
  deps: PullRequestDeps,
  event: PullRequestEvent,
  found: RepoWithInstallation,
): Promise<Linked | undefined> {
  const login = event.pull_request.user?.login ?? event.sender.login;
  const issues = parseLinkedIssues(event.pull_request.body ?? "", found.repo.fullName);

  for (const issueNumber of issues) {
    const bounty = await deps.store.activeBountyForIssue(found.repo.id, issueNumber);
    if (!bounty) continue;
    return { found, bounty, claim: await deps.store.activeClaimBy(bounty.id, login) };
  }
  return undefined;
}

async function link(
  deps: PullRequestDeps,
  event: PullRequestEvent,
  found: RepoWithInstallation,
): Promise<void> {
  const linked = await resolve(deps, event, found);
  if (!linked) return;

  const { bounty, claim } = linked;
  const pr = event.pull_request;
  const login = pr.user?.login ?? event.sender.login;

  if (!claim) {
    // Without a claim there is no payout address, so say so while it can still be fixed.
    await reply(
      deps,
      found,
      pr.number,
      claimFirstComment(bounty.id, login, bounty.issueNumber, bounty.amountUsdc),
    );
    return;
  }

  await deps.store.upsertSubmission({
    bountyId: bounty.id,
    claimId: claim.id,
    prNumber: pr.number,
    prUrl: pr.html_url,
    headSha: pr.head.sha,
  });

  if (bounty.status === "claimed") {
    await deps.store.moveBountyStatus(bounty.id, "claimed", "submitted");
  }

  const maintainerUsdc = bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps);
  await reply(
    deps,
    found,
    pr.number,
    pullRequestLinkedComment({
      bountyId: bounty.id,
      issueNumber: bounty.issueNumber,
      amountUsdc: bounty.amountUsdc,
      contributorUsdc: bounty.amountUsdc - maintainerUsdc,
      maintainerUsdc,
      bountyUrl: bountyUrl(deps.env, bounty.id),
    }),
  );
}

/** Closed without merging: the claim is lost and the stake pays for the review it cost. */
async function abandoned(
  deps: PullRequestDeps,
  event: PullRequestEvent,
  found: RepoWithInstallation,
): Promise<void> {
  const linked = await resolve(deps, event, found);
  if (!linked) return;

  const { bounty } = linked;
  const submission = await deps.store.submissionForPr(bounty.id, event.pull_request.number);
  if (!submission || submission.status !== "open") return;

  await deps.store.markSubmissionClosed(submission.id);
  await deps.store.settleClaim(submission.claimId, "lost", "forwarded_to_maintainer");

  const stillOpen = await deps.store.openSubmissionsFor(bounty.id);
  if (stillOpen.length > 0 || bounty.status !== "submitted") return;

  await deps.store.moveBountyStatus(bounty.id, "submitted", "claimed");
  if ((await deps.store.activeClaimsFor(bounty.id)).length === 0) {
    await deps.store.moveBountyStatus(bounty.id, "claimed", "open");
  }
}

async function merged(
  deps: PullRequestDeps,
  event: PullRequestEvent,
  found: RepoWithInstallation,
): Promise<void> {
  const linked = await resolve(deps, event, found);
  if (!linked) return;

  const { bounty, claim } = linked;
  const pr = event.pull_request;

  // Every guard below has to hold before the verifier wallet is allowed to release money.
  if (bounty.status !== "claimed" && bounty.status !== "submitted") return;
  if (!claim) return;
  if (!pr.merge_commit_sha) return;

  const defaultBranch = event.repository.default_branch;
  if (defaultBranch && pr.base.ref !== defaultBranch) return;

  const submission = await deps.store.upsertSubmission({
    bountyId: bounty.id,
    claimId: claim.id,
    prNumber: pr.number,
    prUrl: pr.html_url,
    headSha: pr.head.sha,
  });

  await deps.store.markSubmissionMerged(submission.id, {
    mergeSha: pr.merge_commit_sha,
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : new Date(),
    deliverableHash: deliverableHash({
      repoFullName: found.repo.fullName,
      prNumber: pr.number,
      mergeSha: pr.merge_commit_sha,
    }),
  });

  if (bounty.status === "claimed") {
    await deps.store.moveBountyStatus(bounty.id, "claimed", "submitted");
  }

  // A repository that asks for disclosure gets it, or a human decides.
  if (
    claim.claimantKind === "agent" &&
    found.repo.policy.aiContributions === "disclosure" &&
    !hasAiDisclosure(pr.body ?? "")
  ) {
    await reply(
      deps,
      found,
      pr.number,
      disclosureMissingComment(
        bounty.id,
        claim.githubLogin,
        repoSettingsUrl(deps.env, found.repo.id),
      ),
    );
    return;
  }

  await deps.settle?.(bounty.id);
}

async function reply(
  deps: PullRequestDeps,
  found: RepoWithInstallation,
  prNumber: number,
  comment: RenderedComment,
): Promise<void> {
  await deps.github.upsertIssueComment(repoRef(found), prNumber, comment.marker, comment.body);
}
