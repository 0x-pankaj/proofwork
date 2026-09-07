import { formatUsdc } from "@proofwork/chain";

/**
 * Every comment Proofwork writes on GitHub.
 *
 * They are pure functions returning a marker plus a body. The marker is an HTML comment,
 * invisible in the rendered issue, and it is how a redelivered webhook finds the comment
 * it already wrote instead of posting a duplicate.
 */

export type CommentKind =
  | "funding-invite"
  | "funded"
  | "pending-accept"
  | "claimed"
  | "needs-payout"
  | "stake-required"
  | "unclaimed"
  | "ai-not-allowed"
  | "linked"
  | "claim-first"
  | "disclosure-missing"
  | "settled"
  | "failed"
  | "expired"
  | "status";

export interface RenderedComment {
  marker: string;
  body: string;
}

/**
 * Invisible in the rendered comment; the handle we use to update rather than repeat.
 * The subject is a bounty id, or `issue-<number>` before a bounty exists.
 */
export function commentMarker(subject: string, kind: CommentKind): string {
  return `<!-- proofwork:${subject}:${kind} -->`;
}

function render(subject: string, kind: CommentKind, lines: string[]): RenderedComment {
  const marker = commentMarker(subject, kind);
  return { marker, body: `${lines.join("\n")}\n\n${marker}` };
}

export interface FundingInviteInput {
  issueNumber: number;
  amountUsdc: bigint;
  fundUrl: string;
}

/**
 * The answer to a `bounty:$50` label. The label states an intent; the money still has to
 * be escrowed, and this is the one click that does it.
 */
export function fundingInviteComment(input: FundingInviteInput): RenderedComment {
  return render(`issue-${input.issueNumber}`, "funding-invite", [
    `### ${formatUsdc(input.amountUsdc)} bounty, not funded yet`,
    "",
    `[Escrow it on Arc](${input.fundUrl}) and this issue pays out automatically the moment a pull request fixing it is merged.`,
    "",
    "Nothing is reserved until the escrow transaction confirms.",
  ]);
}

export interface FundedInput {
  bountyId: string;
  issueNumber: number;
  amountUsdc: bigint;
  maintainerRewardUsdc: bigint;
  bountyUrl: string;
  /** Null until the escrow transaction hash is known. */
  fundingTxUrl: string | null;
  expiresAt: Date;
}

/** Posted once escrow is confirmed on Arc. This is the comment that invites work. */
export function fundedComment(input: FundedInput): RenderedComment {
  const reward =
    input.maintainerRewardUsdc > 0n
      ? `, including ${formatUsdc(input.maintainerRewardUsdc)} to the maintainer who reviews it`
      : "";
  return render(input.bountyId, "funded", [
    `### 💰 ${formatUsdc(input.amountUsdc)} bounty, escrowed on Arc`,
    "",
    `The funds are locked in a contract${reward}. They are released the moment a pull request that fixes this issue is merged — no invoice, no payout run.`,
    "",
    `Comment \`/claim\` to take it, then open a pull request whose body says \`Fixes #${input.issueNumber}\`.`,
    "",
    [
      `[Bounty details](${input.bountyUrl})`,
      input.fundingTxUrl ? `[Escrow transaction](${input.fundingTxUrl})` : undefined,
      `Expires ${formatDate(input.expiresAt)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  ]);
}

export interface PendingAcceptInput {
  bountyId: string;
  amountUsdc: bigint;
  funderLogin: string;
  settingsUrl: string;
}

/** Funded by someone who is not the maintainer, so the maintainer decides first. */
export function pendingAcceptComment(input: PendingAcceptInput): RenderedComment {
  return render(input.bountyId, "pending-accept", [
    `### 💰 ${formatUsdc(input.amountUsdc)} offered for this issue`,
    "",
    `@${input.funderLogin} escrowed a bounty on Arc. Because the reward is paid out when a maintainer merges, a maintainer has to accept it before anyone can claim it.`,
    "",
    "Maintainers: comment `/accept` to open it for work, or accept it from " +
      `[repository settings](${input.settingsUrl}).`,
  ]);
}

export interface ClaimedInput {
  bountyId: string;
  login: string;
  issueNumber: number;
  claimExpiresAt: Date;
}

export function claimedComment(input: ClaimedInput): RenderedComment {
  return render(input.bountyId, "claimed", [
    `✅ @${input.login} claimed this bounty.`,
    "",
    `Open a pull request whose body contains \`Fixes #${input.issueNumber}\` and the payout runs automatically when it is merged. The claim lapses ${formatDate(input.claimExpiresAt)} if no pull request is open by then.`,
    "",
    "Anyone else may still claim and submit — the first merged pull request is paid.",
  ]);
}

export interface NeedsPayoutInput {
  bountyId: string;
  login: string;
  payoutUrl: string;
}

export function needsPayoutAddressComment(input: NeedsPayoutInput): RenderedComment {
  return render(input.bountyId, "needs-payout", [
    `@${input.login} — there is nowhere to send the USDC yet.`,
    "",
    `Add a payout address at [${input.payoutUrl}](${input.payoutUrl}), then comment \`/claim\` again. It takes a minute and you only do it once.`,
  ]);
}

export interface StakeRequiredInput {
  bountyId: string;
  login: string;
  minStakeUsdc: bigint;
  stakeUrl: string;
}

/**
 * Agents stake to claim. The stake goes to the maintainer if the work is abandoned or
 * rejected, which is what makes reviewing agent pull requests worth a maintainer's time.
 */
export function stakeRequiredComment(input: StakeRequiredInput): RenderedComment {
  return render(input.bountyId, "stake-required", [
    `@${input.login} — this repository requires a ${formatUsdc(input.minStakeUsdc)} stake before an agent can claim.`,
    "",
    `Pay it at [${input.stakeUrl}](${input.stakeUrl}) and comment \`/claim stake:<id>\` with the payment id. It comes back when your pull request is merged.`,
  ]);
}

export function unclaimedComment(bountyId: string, login: string): RenderedComment {
  return render(bountyId, "unclaimed", [`@${login} released this bounty. It is open again.`]);
}

export function aiNotAllowedComment(bountyId: string, login: string): RenderedComment {
  return render(bountyId, "ai-not-allowed", [
    `@${login} — this repository does not accept AI-authored contributions, so registered agents cannot claim its bounties.`,
    "",
    "Human contributors are welcome to comment `/claim`.",
  ]);
}

export interface LinkedInput {
  bountyId: string;
  issueNumber: number;
  amountUsdc: bigint;
  contributorUsdc: bigint;
  maintainerUsdc: bigint;
  bountyUrl: string;
}

/** Posted on the pull request, so a reviewer sees the money before they merge. */
export function pullRequestLinkedComment(input: LinkedInput): RenderedComment {
  const reward =
    input.maintainerUsdc > 0n ? `\n- Reviewer: **${formatUsdc(input.maintainerUsdc)}**` : "";
  return render(input.bountyId, "linked", [
    `### Linked to the ${formatUsdc(input.amountUsdc)} bounty on #${input.issueNumber}`,
    "",
    "Merging this pull request releases escrow on Arc:",
    `- Contributor: **${formatUsdc(input.contributorUsdc)}**${reward}`,
    "",
    `Settlement takes a few seconds and needs no further action. [Bounty details](${input.bountyUrl})`,
  ]);
}

/**
 * A pull request that fixes a funded issue, opened by someone who never claimed it.
 * Without a claim there is no payout address, so this is the one thing standing between
 * them and the money.
 */
export function claimFirstComment(
  bountyId: string,
  login: string,
  issueNumber: number,
  amountUsdc: bigint,
): RenderedComment {
  return render(bountyId, "claim-first", [
    `@${login} — #${issueNumber} carries a ${formatUsdc(amountUsdc)} bounty, but you have not claimed it.`,
    "",
    `Comment \`/claim\` on [#${issueNumber}](../issues/${issueNumber}) before this is merged, so there is an address to pay.`,
  ]);
}

/** The repository allows AI-assisted work only when the pull request says so. */
export function disclosureMissingComment(
  bountyId: string,
  login: string,
  settingsUrl: string,
): RenderedComment {
  return render(bountyId, "disclosure-missing", [
    "This pull request was merged, but the payout is on hold.",
    "",
    `@${login} is a registered agent and this repository requires AI-assisted work to say so: the pull request body needs an \`AI-assisted:\` line. A maintainer can release the payout from [repository settings](${settingsUrl}).`,
  ]);
}

export interface SettledInput {
  bountyId: string;
  login: string;
  contributorUsdc: bigint;
  maintainerUsdc: bigint;
  maintainerLogin: string | null;
  txUrl: string;
  seconds: number;
}

/** The comment the whole product exists to post. */
export function settledComment(input: SettledInput): RenderedComment {
  const reward =
    input.maintainerUsdc > 0n && input.maintainerLogin
      ? ` and ${formatUsdc(input.maintainerUsdc)} to @${input.maintainerLogin} for the review`
      : "";
  return render(input.bountyId, "settled", [
    `### 🎉 Paid ${formatUsdc(input.contributorUsdc)} to @${input.login}${reward}`,
    "",
    `Settled on Arc in ${input.seconds.toFixed(1)}s, in one transaction, in USDC.`,
    "",
    `[View the settlement](${input.txUrl})`,
  ]);
}

export function settlementFailedComment(bountyId: string, detail: string): RenderedComment {
  return render(bountyId, "failed", [
    "⚠️ The payout for this bounty did not go through.",
    "",
    `The escrow is untouched and the merge stands. ${detail}`,
  ]);
}

export function expiredComment(
  bountyId: string,
  amountUsdc: bigint,
  reclaimUrl: string,
): RenderedComment {
  return render(bountyId, "expired", [
    `This ${formatUsdc(amountUsdc)} bounty expired with no merged pull request.`,
    "",
    `The funder can [reclaim the escrow](${reclaimUrl}) at any time.`,
  ]);
}

export interface StatusInput {
  bountyId: string;
  status: string;
  amountUsdc: bigint;
  claimants: string[];
  bountyUrl: string;
  txUrl: string | null;
}

/** The reply to `/status`. Deliberately terse: it is read in a busy issue thread. */
export function statusComment(input: StatusInput): RenderedComment {
  const claims =
    input.claimants.length > 0
      ? input.claimants.map((login) => `@${login}`).join(", ")
      : "nobody yet";
  const lines = [
    `**${formatUsdc(input.amountUsdc)} · ${input.status}**`,
    "",
    `Claimed by: ${claims}`,
    `[Bounty details](${input.bountyUrl})`,
  ];
  if (input.txUrl) lines.push(`[Settlement transaction](${input.txUrl})`);
  return render(input.bountyId, "status", lines);
}

function formatDate(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
