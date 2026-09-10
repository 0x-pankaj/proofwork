import { formatUsdc } from "@proofwork/chain";
import type { AgentProfile, BountyDetail, BountySummary, Registration } from "./client";

/**
 * Output an agent reads, and a person can too.
 *
 * Everything here goes through `--json` when a caller wants to parse it; this is the
 * version for a terminal, and for a model reading a terminal.
 */

export function formatBounties(bounties: BountySummary[]): string {
  if (bounties.length === 0) return "No open bounties right now.";

  const lines = bounties.map((bounty) => {
    const pays = formatUsdc(BigInt(bounty.split.contributor));
    const tags = bounty.tags.length > 0 ? `  [${bounty.tags.join(", ")}]` : "";
    return [
      `${pays.padStart(14)}  ${bounty.repo}#${bounty.issueNumber}${tags}`,
      `                ${bounty.issueTitle}`,
      `                ${bounty.id}  expires ${short(bounty.expiresAt)}`,
    ].join("\n");
  });

  return [
    `${bounties.length} open ${bounties.length === 1 ? "bounty" : "bounties"}:`,
    "",
    lines.join("\n\n"),
    "",
    "Claim one with: proofwork claim <id>",
  ].join("\n");
}

export function formatBounty(bounty: BountyDetail): string {
  const lines = [
    `${bounty.repo}#${bounty.issueNumber} — ${bounty.issueTitle}`,
    bounty.issueUrl,
    "",
    `Status        ${bounty.status}`,
    `Escrowed      ${formatUsdc(BigInt(bounty.amountUsdc))}`,
    `You receive   ${formatUsdc(BigInt(bounty.split.contributor))}`,
    `Maintainer    ${formatUsdc(BigInt(bounty.split.maintainer))} for the review`,
    `Expires       ${short(bounty.expiresAt)}`,
  ];

  if (bounty.claims.length > 0) {
    lines.push("", "Claims");
    for (const claim of bounty.claims) {
      lines.push(`  @${claim.login}  ${claim.kind}  ${claim.status}`);
    }
  }

  if (bounty.submission) {
    lines.push(
      "",
      `Pull request  #${bounty.submission.prNumber} ${bounty.submission.prUrl}`,
      `              ${bounty.submission.mergedAt ? `merged ${short(bounty.submission.mergedAt)}` : "open"}`,
    );
  }

  if (bounty.settlement) {
    lines.push("", `Settlement    ${bounty.settlement.status}`);
    if (bounty.settlement.txUrl) lines.push(`              ${bounty.settlement.txUrl}`);
    if (bounty.settlement.error) lines.push(`              ${bounty.settlement.error}`);
  }

  return lines.join("\n");
}

export function formatClaim(bounty: BountyDetail): string {
  if (bounty.status !== "open" && bounty.status !== "claimed") {
    return `That bounty is ${bounty.status}, so it cannot be claimed.`;
  }

  return [
    `${bounty.repo}#${bounty.issueNumber} pays ${formatUsdc(BigInt(bounty.split.contributor))} on merge.`,
    "",
    "To claim it, comment this on the issue from the account you will open the pull request from:",
    "",
    "  /claim",
    "",
    `  ${bounty.issueUrl}`,
    "",
    "The comment is the claim: GitHub has already authenticated you, so there is nothing else",
    "to sign. Then open a pull request whose body says:",
    "",
    `  Fixes #${bounty.issueNumber}`,
    "",
    "When a maintainer merges it, the escrow pays out on Arc. Nobody has to approve the payment.",
  ].join("\n");
}

export function formatProfile(profile: AgentProfile): string {
  const lines = [
    `${profile.name}  @${profile.githubLogin}`,
    `Wallet        ${profile.walletAddress}`,
    `ERC-8004      ${profile.erc8004AgentId ?? "not registered"}`,
    `Bounties won  ${profile.settled}`,
    `Earned        ${formatUsdc(BigInt(profile.earnedUsdc))}`,
    `Reputation    ${profile.reputationScore}`,
  ];

  if (profile.reputation && profile.reputation.length > 0) {
    lines.push("", "Recent feedback");
    for (const event of profile.reputation.slice(0, 5)) {
      lines.push(`  +${event.score}  ${short(event.at)}  ${event.txUrl ?? "off chain"}`);
    }
  }

  return lines.join("\n");
}

export function formatRegistration(registration: Registration): string {
  return [
    `Registered ${registration.name} as @${registration.githubLogin}.`,
    `Wallet        ${registration.walletAddress}`,
    `ERC-8004      ${registration.erc8004AgentId ?? "none yet"}`,
    `Metadata      ${registration.metadataUri}`,
    "",
    "This is the only time the API key is shown. Keep it with the wallet key:",
    "",
    `  export PROOFWORK_AGENT_API_KEY=${registration.apiKey}`,
  ].join("\n");
}

function short(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
