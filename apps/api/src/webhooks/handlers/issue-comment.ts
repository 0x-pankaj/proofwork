import { txUrl } from "@proofwork/chain";
import { isClaimable } from "@proofwork/core";
import type { Bounty, Claim, RepoWithInstallation } from "@proofwork/db";
import {
  claimedComment,
  type IssueCommentEvent,
  isBotAuthor,
  needsPayoutAddressComment,
  parseSlashCommand,
  type RenderedComment,
  statusComment,
  unclaimedComment,
} from "@proofwork/github";
import type { Env } from "../../env";
import type { Store } from "../../store";
import { bountyUrl, payoutUrl } from "../../urls";
import { repoRef } from "../repo-ref";
import type { CommentWriter } from "./issues";

/**
 * Slash commands on a bounty's issue.
 *
 * Commenting is how a contributor tells us they are working on something, and GitHub has
 * already authenticated them, so the comment doubles as proof they control the login.
 * That is the whole reason claims live here rather than behind an API key.
 */

export interface IssueCommentDeps {
  store: Store;
  github: CommentWriter;
  env: Env;
}

interface CommandContext extends IssueCommentDeps {
  found: RepoWithInstallation;
  bounty: Bounty;
  login: string;
  issueNumber: number;
}

export async function handleIssueComment(
  deps: IssueCommentDeps,
  event: IssueCommentEvent,
): Promise<void> {
  if (event.action !== "created") return;
  // A comment on a pull request arrives as an issue comment; bounties live on issues.
  if (event.issue.pull_request) return;
  if (isBotAuthor(event.comment.user)) return;

  const command = parseSlashCommand(event.comment.body ?? "");
  if (!command) return;

  const found = await deps.store.repoByGithubId(BigInt(event.repository.id));
  if (!found?.repo.installed || found.installation.suspended) return;

  const bounty = await deps.store.activeBountyForIssue(found.repo.id, event.issue.number);
  if (!bounty) return;

  const context: CommandContext = {
    ...deps,
    found,
    bounty,
    login: event.comment.user?.login ?? event.sender.login,
    issueNumber: event.issue.number,
  };

  switch (command.name) {
    case "claim":
      return claim(context, event);
    case "unclaim":
      return unclaim(context);
    case "status":
      return status(context);
    default:
      return;
  }
}

async function claim(context: CommandContext, event: IssueCommentEvent): Promise<void> {
  const { store, bounty, login } = context;

  if (!isClaimable(bounty.status)) {
    await reply(context, await statusOf(context));
    return;
  }

  const agent = await store.agentByGithubLogin(login);
  const user = agent
    ? undefined
    : await store.upsertUser({
        githubId: BigInt(event.comment.user?.id ?? event.sender.id),
        login,
      });

  const payoutAddress = agent?.walletAddress ?? user?.payoutAddress;
  if (!payoutAddress) {
    await reply(
      context,
      needsPayoutAddressComment({
        bountyId: bounty.id,
        login,
        payoutUrl: payoutUrl(context.env),
      }),
    );
    return;
  }

  await store.claimBounty({
    bountyId: bounty.id,
    claimantKind: agent ? "agent" : "user",
    userId: user?.id ?? null,
    agentId: agent?.id ?? null,
    githubLogin: login,
    payoutAddress,
  });

  // Only the first claim moves the bounty; later ones join a bounty already claimed.
  if (bounty.status === "open") {
    await store.moveBountyStatus(bounty.id, "open", "claimed");
  }

  await reply(
    context,
    claimedComment({
      bountyId: bounty.id,
      login,
      issueNumber: context.issueNumber,
      claimExpiresAt: claimDeadline(context.found),
    }),
  );
}

async function unclaim(context: CommandContext): Promise<void> {
  const { store, bounty, login } = context;

  if (!(await store.withdrawClaim(bounty.id, login))) return;

  const remaining = await store.activeClaimsFor(bounty.id);
  if (remaining.length === 0 && bounty.status === "claimed") {
    await store.moveBountyStatus(bounty.id, "claimed", "open");
  }

  await reply(context, unclaimedComment(bounty.id, login));
}

async function status(context: CommandContext): Promise<void> {
  await reply(context, await statusOf(context));
}

async function statusOf(context: CommandContext): Promise<RenderedComment> {
  const { store, bounty, env } = context;
  const claims: Claim[] = await store.activeClaimsFor(bounty.id);

  return statusComment({
    bountyId: bounty.id,
    status: bounty.status,
    amountUsdc: bounty.amountUsdc,
    claimants: claims.map((claim) => claim.githubLogin),
    bountyUrl: bountyUrl(env, bounty.id),
    txUrl: bounty.settleTxHash ? txUrl(bounty.settleTxHash, env) : null,
  });
}

/** How long the claim holds before the expiry sweep releases it. */
function claimDeadline(found: RepoWithInstallation): Date {
  return new Date(Date.now() + found.repo.policy.claimTtlHours * 3_600_000);
}

async function reply(context: CommandContext, comment: RenderedComment): Promise<void> {
  await context.github.upsertIssueComment(
    repoRef(context.found),
    context.issueNumber,
    comment.marker,
    comment.body,
  );
}
