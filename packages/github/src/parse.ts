import { toUsdc, type UsdcAmount } from "@proofwork/chain";

/**
 * Reading intent out of GitHub prose: which issue a pull request closes, which command a
 * comment is issuing, and what a `bounty:$50` label is worth.
 *
 * Every parser ignores fenced code and quoted replies first. Without that, quoting an
 * earlier comment re-runs its commands, and a `Fixes #12` inside a code sample links a
 * pull request to a bounty it has nothing to do with.
 */

const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`[^`\n]*`/g;
const QUOTED_LINE = /^\s*>.*$/gm;

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)/gi;
const CLOSING_URL =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/gi;

const SLASH_COMMAND = /^\s*\/(claim|unclaim|status|accept)\b[^\S\n]*(.*)$/im;
const STAKE_ARGUMENT = /\bstake:([\w-]+)\b/i;
const BOUNTY_LABEL = /^bounty:\s*\$?(\d+(?:\.\d{1,6})?)$/i;
const AI_DISCLOSURE = /^\s*ai-assisted\s*:/im;

export type SlashCommandName = "claim" | "unclaim" | "status" | "accept";

export interface SlashCommand {
  name: SlashCommandName;
  /** The x402 payment id backing an agent's claim, from `/claim stake:<id>`. */
  stakeId?: string;
}

/** Drops the parts of a comment that are quoting or demonstrating rather than saying. */
export function readableText(body: string): string {
  return body.replace(FENCED_CODE, "").replace(INLINE_CODE, "").replace(QUOTED_LINE, "");
}

/**
 * Issue numbers this pull request closes, deduplicated. A cross-repository reference only
 * counts when it names the repository the pull request is in, because a bounty is always
 * paid on its own repository's issue.
 */
export function parseLinkedIssues(body: string, repoFullName?: string): number[] {
  const text = readableText(body);
  const numbers: number[] = [];

  const add = (repo: string | undefined, raw: string) => {
    if (repo && repo.toLowerCase() !== repoFullName?.toLowerCase()) return;
    const issueNumber = Number(raw);
    if (Number.isInteger(issueNumber) && issueNumber > 0 && !numbers.includes(issueNumber)) {
      numbers.push(issueNumber);
    }
  };

  for (const match of text.matchAll(CLOSING_URL)) add(match[1], match[2] ?? "");
  for (const match of text.matchAll(CLOSING_REFERENCE)) add(match[1], match[2] ?? "");
  return numbers;
}

/** The first command in a comment. One comment issues one command; the rest is prose. */
export function parseSlashCommand(body: string): SlashCommand | undefined {
  const match = SLASH_COMMAND.exec(readableText(body));
  if (!match?.[1]) return undefined;

  const name = match[1].toLowerCase() as SlashCommandName;
  const stakeId = STAKE_ARGUMENT.exec(match[2] ?? "")?.[1];
  return stakeId ? { name, stakeId } : { name };
}

/** `bounty:$50` and `bounty: 50.25` become 6-decimal USDC. Anything else is not a bounty. */
export function parseBountyLabel(label: string): UsdcAmount | undefined {
  const amount = BOUNTY_LABEL.exec(label.trim())?.[1];
  if (!amount) return undefined;
  const parsed = toUsdc(amount);
  return parsed > 0n ? parsed : undefined;
}

/** Whether a pull request declares AI assistance, as repos with a disclosure policy require. */
export function hasAiDisclosure(body: string): boolean {
  return AI_DISCLOSURE.test(readableText(body));
}
