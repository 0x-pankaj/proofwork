import { bpsOf, txUrl } from "@proofwork/chain";
import { isClaimable } from "@proofwork/core";
import type { Bounty, Claim, RepoWithInstallation } from "@proofwork/db";
import {
  aiNotAllowedComment,
  canMaintain,
  claimedComment,
  fundedComment,
  type GitHubClient,
  type IssueCommentEvent,
  isBotAuthor,
  needsPayoutAddressComment,
  parseSlashCommand,
  type RenderedComment,
  type SlashCommand,
  stakeRequiredComment,
  statusComment,
  unclaimedComment,
} from "@proofwork/github";
import type { Env } from "../../env";
import type { Store } from "../../store";
import { bountyUrl, payoutUrl, stakeUrl } from "../../urls";
import { repoRef } from "../repo-ref";

/** The GitHub calls the commands make: writing a reply, and checking who is a maintainer. */
export type CommandClient = Pick<GitHubClient, "upsertIssueComment" | "permissionFor">;

/**
 * Slash commands on a bounty's issue.
 *
 * Commenting is how a contributor tells us they are working on something, and GitHub has
 * already authenticated them, so the comment doubles as proof they control the login.
 * That is the whole reason claims live here rather than behind an API key.
 */

export interface IssueCommentDeps {
  store: Store;
  github: CommandClient;
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
      return claim(context, event, command);
    case "unclaim":
      return unclaim(context);
    case "accept":
      return accept(context);
    case "status":
      return status(context);
    default:
      return;
  }
}

async function claim(
  context: CommandContext,
  event: IssueCommentEvent,
  command: SlashCommand,
): Promise<void> {
  const { store, bounty, login } = context;
  const policy = context.found.repo.policy;

  if (!isClaimable(bounty.status)) {
    await reply(context, await statusOf(context));
    return;
  }

  const agent = await store.agentByGithubLogin(login);

  // The repository's terms, enforced before work starts rather than after a pull request
  // has already cost the maintainer a review.
  if (agent && policy.aiContributions === "none") {
    await reply(context, aiNotAllowedComment(bounty.id, login));
    return;
  }

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

  const minStake = BigInt(policy.minStakeUsdc);
  let stakePaymentId: string | null = null;

  if (agent && requiresStake(context.env)) {
    const stake = await resolveStake(context, command.stakeId, agent.walletAddress, minStake);
    if (!stake) {
      await reply(
        context,
        stakeRequiredComment({
          bountyId: bounty.id,
          login,
          minStakeUsdc: minStake,
          stakeUrl: stakeUrl(context.env),
        }),
      );
      return;
    }
    stakePaymentId = stake;
  }

  await store.claimBounty({
    bountyId: bounty.id,
    claimantKind: agent ? "agent" : "user",
    userId: user?.id ?? null,
    agentId: agent?.id ?? null,
    githubLogin: login,
    payoutAddress,
    stakePaymentId,
    stakeStatus: stakePaymentId ? "held" : "none",
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

/**
 * A maintainer opening a bounty someone else funded on their repository. Anyone may type
 * `/accept`; only someone who can merge is listened to, and the rest is ignored silently
 * rather than answered, so the command cannot be used to spam an issue.
 */
async function accept(context: CommandContext): Promise<void> {
  const { store, bounty, found, login, env } = context;
  if (bounty.status !== "pending_accept") return;

  const permission = await context.github.permissionFor(repoRef(found), login);
  if (!canMaintain(permission)) return;

  if (!(await store.acceptBounty(bounty.id))) return;

  await reply(
    context,
    fundedComment({
      bountyId: bounty.id,
      issueNumber: context.issueNumber,
      amountUsdc: bounty.amountUsdc,
      maintainerRewardUsdc: bpsOf(bounty.amountUsdc, bounty.maintainerRewardBps),
      bountyUrl: bountyUrl(env, bounty.id),
      fundingTxUrl: bounty.createTxHash ? txUrl(bounty.createTxHash, env) : null,
      expiresAt: bounty.expiresAt,
    }),
  );
}

/**
 * A stake is valid when it was paid by this agent, is large enough for the repository's
 * policy, and is not already backing another live claim. Returns the payment id to hold.
 */
async function resolveStake(
  context: CommandContext,
  stakeId: string | undefined,
  walletAddress: string,
  minStakeUsdc: bigint,
): Promise<string | undefined> {
  if (!stakeId) return undefined;

  const payment = await context.store.x402PaymentById(stakeId);
  if (!payment) return undefined;
  if (payment.payer.toLowerCase() !== walletAddress.toLowerCase()) return undefined;
  if (payment.amountUsdc < minStakeUsdc) return undefined;
  if (await context.store.stakeInUse(payment.id)) return undefined;

  return payment.id;
}

/** Stakes are on unless explicitly disabled, which is how testnet demos run before x402. */
function requiresStake(env: Env): boolean {
  return env.REQUIRE_AGENT_STAKE !== "false";
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
