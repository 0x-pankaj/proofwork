import type { UsdcAmount } from "@proofwork/chain";
import {
  fundingInviteComment,
  type GitHubClient,
  type IssuesEvent,
  labelNames,
  parseBountyLabel,
} from "@proofwork/github";
import type { Env } from "../../env";
import type { Store } from "../../store";
import { fundIssueUrl } from "../../urls";
import { repoRef } from "../repo-ref";

/**
 * Labelling an issue `bounty:$50` states an intent, not a payment. The reply is a link
 * that escrows the money, because a bounty nobody funded is exactly the promise this
 * product exists to stop making.
 */

/** Only the one call this handler makes, so a test can stand in for the client. */
export type CommentWriter = Pick<GitHubClient, "upsertIssueComment">;

export interface IssuesHandlerDeps {
  store: Store;
  github: CommentWriter;
  env: Env;
}

function bountyAmount(event: IssuesEvent): UsdcAmount | undefined {
  const labelled = event.label?.name;
  if (labelled) return parseBountyLabel(labelled);
  for (const name of labelNames(event.issue.labels)) {
    const amount = parseBountyLabel(name);
    if (amount !== undefined) return amount;
  }
  return undefined;
}

export async function handleIssues(deps: IssuesHandlerDeps, event: IssuesEvent): Promise<void> {
  if (event.action !== "labeled") return;

  const amount = bountyAmount(event);
  if (amount === undefined) return;

  const found = await deps.store.repoByGithubId(BigInt(event.repository.id));
  if (!found?.repo.installed || found.installation.suspended) return;

  const comment = fundingInviteComment({
    issueNumber: event.issue.number,
    amountUsdc: amount,
    fundUrl: fundIssueUrl(deps.env, found.repo.fullName, event.issue.number),
  });

  await deps.github.upsertIssueComment(
    repoRef(found),
    event.issue.number,
    comment.marker,
    comment.body,
  );
}
