import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatUsdc, toUsdc } from "@proofwork/chain";
import { type BountyDetail, DEFAULT_X402_URL, ProofworkClient } from "@proofwork/skill";
import type { Hex } from "viem";
import { AgentGitHub } from "./github";
import { type FitVerdict, pick } from "./pick";
import { pullRequestBody } from "./pull-request";
import { must, run } from "./shell";
import { AgentWallet } from "./wallet";

/**
 * The reference agent: one bounty, start to finish, with nobody clicking anything.
 *
 * It pays a twentieth of a cent to ask which funded issue is worth its time, pays the
 * repository's stake to hold the claim, claims by commenting from its own GitHub account,
 * writes the change with Claude Code, buys a pre-review of its own pull request, opens it
 * saying `Fixes #N`, and then waits. The waiting is the point — the agent has no way to pay
 * itself. A maintainer merges, and the escrow settles on Arc on its own.
 *
 * Every purchase is x402 over Circle Gateway: a 402, a signature, a 200. No account.
 *
 * Deliberately small. It is a worked example of the loop, not a framework.
 */

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1_000;
/** A stake, a review and a handful of fit scores, with room to spare. */
const GATEWAY_FLOOR = toUsdc("1.10");

interface Config {
  apiUrl: string;
  apiKey: string;
  x402Url: string;
  /** The wallet that pays and is paid. Without it the agent claims on price alone. */
  privateKey?: Hex;
  githubToken: string;
  /** How the agent writes code. Anything that takes a prompt and edits the working tree. */
  codeCommand: string;
  codeArgs: string[];
  bountyId?: string;
  dryRun: boolean;
}

function config(): Config {
  const codeCommand = process.env.AGENT_CODE_COMMAND ?? "claude";
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  return {
    apiUrl: process.env.PROOFWORK_API_URL ?? "",
    apiKey: required("PROOFWORK_AGENT_API_KEY"),
    x402Url: (process.env.PROOFWORK_X402_URL || DEFAULT_X402_URL).replace(/\/+$/, ""),
    ...(privateKey ? { privateKey: privateKey as Hex } : {}),
    githubToken: required("AGENT_GITHUB_TOKEN"),
    codeCommand,
    codeArgs: (process.env.AGENT_CODE_ARGS ?? "-p,--permission-mode,acceptEdits").split(","),
    ...(process.env.AGENT_BOUNTY_ID ? { bountyId: process.env.AGENT_BOUNTY_ID } : {}),
    dryRun: process.env.AGENT_DRY_RUN === "true",
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const settings = config();
  const proofwork = new ProofworkClient({ baseUrl: settings.apiUrl, apiKey: settings.apiKey });
  const github = new AgentGitHub({ token: settings.githubToken });
  const me = await proofwork.me();
  console.log(`working as @${me.githubLogin}, paid to ${me.walletAddress}`);

  const wallet = await walletFor(settings, me.walletAddress);
  const bounty = await pick(
    {
      bounties: () => proofwork.bounties(),
      bounty: (id) => proofwork.bounty(id),
      ...(wallet
        ? {
            fit: async (id: string) =>
              (await wallet.pay<FitVerdict>(`${settings.x402Url}/v1/bounties/fit?bountyId=${id}`))
                .data,
          }
        : {}),
    },
    settings.bountyId,
    console.log,
  );
  if (!bounty) {
    console.log("nothing open worth claiming right now");
    return;
  }
  console.log(
    `${bounty.repo}#${bounty.issueNumber} — ${bounty.issueTitle}`,
    `\npays ${formatUsdc(BigInt(bounty.split.contributor))} on merge`,
  );

  if (settings.dryRun) {
    console.log("dry run: stopping before the claim");
    return;
  }

  // The comment is the claim. GitHub authenticates it, so this is also how the payout
  // address gets bound to a login someone can be held to. The stake rides along as an id:
  // the payment itself is what the API checks, from the same wallet that gets paid.
  await github.comment(
    bounty.repo,
    bounty.issueNumber,
    await claimComment(settings, wallet, bounty),
  );
  console.log("claimed; opening a worktree");

  const workdir = await mkdtemp(join(tmpdir(), "proofwork-agent-"));
  try {
    const branch = `proofwork/issue-${bounty.issueNumber}`;
    await clone(settings, bounty.repo, workdir, branch);

    const changed = await write(settings, workdir, bounty);
    if (!changed) {
      console.log("nothing was changed, so there is nothing to submit");
      await github.comment(bounty.repo, bounty.issueNumber, "/unclaim");
      return;
    }

    await commit(workdir, bounty, branch, me);
    const pull = await github.openPullRequest({
      repo: bounty.repo,
      title: `Fix: ${bounty.issueTitle}`,
      body: pullRequestBody(bounty, me.name),
      head: branch,
      base: await github.defaultBranch(bounty.repo),
    });
    console.log(`opened ${pull.html_url}`);

    if (wallet) await preReview(settings, wallet, bounty, pull.number);
    await waitForSettlement(proofwork, bounty.id);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/**
 * The agent's wallet, if it has one. It has to be the wallet that was registered: a stake
 * paid from any other address is refused, and the payout goes to the registered one anyway.
 */
async function walletFor(settings: Config, registered: string): Promise<AgentWallet | undefined> {
  if (!settings.privateKey) {
    console.log("no AGENT_PRIVATE_KEY: claiming on price alone, without fit, stake or review");
    return undefined;
  }
  const wallet = new AgentWallet({ privateKey: settings.privateKey });
  if (wallet.address.toLowerCase() !== registered.toLowerCase()) {
    throw new Error(
      `AGENT_PRIVATE_KEY is ${wallet.address} but this agent is registered to ${registered}`,
    );
  }
  await wallet.ensureGatewayBalance(GATEWAY_FLOOR);
  return wallet;
}

/** `/claim`, carrying the paid stake's id when the agent has a wallet to pay it from. */
async function claimComment(
  settings: Config,
  wallet: AgentWallet | undefined,
  bounty: BountyDetail,
): Promise<string> {
  if (!wallet) return "/claim";
  const stake = await wallet.pay<{ stakeId: string; claimComment: string }>(
    `${settings.x402Url}/v1/claims/stake?bountyId=${bounty.id}`,
    { method: "POST" },
  );
  return stake.data.claimComment;
}

/**
 * Five cents to hear whether the pull request actually closes the issue, before a
 * maintainer spends an evening finding out. Advice only: a bad verdict is printed, not
 * acted on, because the pull request is already open and the maintainer decides.
 */
async function preReview(
  settings: Config,
  wallet: AgentWallet,
  bounty: BountyDetail,
  prNumber: number,
): Promise<void> {
  try {
    const review = await wallet.pay<{
      addressesIssue: boolean;
      confidence: string;
      risks: string[];
      summary: string;
    }>(`${settings.x402Url}/v1/review`, {
      method: "POST",
      body: { repo: bounty.repo, prNumber, issueNumber: bounty.issueNumber },
    });
    const verdict = review.data;
    console.log(
      `pre-review: ${verdict.addressesIssue ? "addresses" : "does not address"} the issue ` +
        `(${verdict.confidence} confidence) — ${verdict.summary}`,
    );
    for (const risk of verdict.risks) console.log(`  risk: ${risk}`);
  } catch (error) {
    console.log(`pre-review unavailable: ${error instanceof Error ? error.message : error}`);
  }
}

async function clone(
  settings: Config,
  repo: string,
  workdir: string,
  branch: string,
): Promise<void> {
  const url = `https://x-access-token:${settings.githubToken}@github.com/${repo}.git`;
  await must("git", ["clone", "--depth", "1", url, workdir]);
  await must("git", ["checkout", "-b", branch], workdir);
}

/** Hands the issue to Claude Code and reports whether it actually changed anything. */
async function write(settings: Config, workdir: string, bounty: BountyDetail): Promise<boolean> {
  const prompt = [
    `Fix this issue in the repository you are in.`,
    "",
    `Issue #${bounty.issueNumber}: ${bounty.issueTitle}`,
    bounty.issueUrl,
    "",
    "Rules:",
    "- Change only what the issue asks for.",
    "- Match the surrounding code: its naming, its comment density, its idioms.",
    "- If the repository has tests, run them, and make sure they pass before you finish.",
    "- Do not commit; leave your changes in the working tree.",
  ].join("\n");

  console.log(`writing the change with ${settings.codeCommand}`);
  const result = await run(settings.codeCommand, [...settings.codeArgs, prompt], workdir);
  if (result.code !== 0) {
    throw new Error(`${settings.codeCommand} failed (${result.code}): ${result.stderr.trim()}`);
  }

  const status = await must("git", ["status", "--porcelain"], workdir);
  return status.trim().length > 0;
}

/**
 * Committed as the agent's own GitHub account, not whoever's git config the host machine
 * happens to have. GitHub attributes the noreply address to the login, so the commit and
 * the pull request tell the same story about who did the work.
 */
async function commit(
  workdir: string,
  bounty: BountyDetail,
  branch: string,
  author: { name: string; githubLogin: string },
): Promise<void> {
  const identity = [
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.githubLogin}@users.noreply.github.com`,
  ];
  await must("git", ["add", "-A"], workdir);
  await must(
    "git",
    [...identity, "commit", "-m", `fix: ${bounty.issueTitle.toLowerCase().slice(0, 60)}`],
    workdir,
  );
  await must("git", ["push", "-u", "origin", branch], workdir);
}

/** There is nothing else to do. The maintainer decides, and the chain does the rest. */
async function waitForSettlement(proofwork: ProofworkClient, bountyId: string): Promise<void> {
  console.log("waiting for a maintainer to merge");
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const bounty = await proofwork.bounty(bountyId);

    if (bounty.status === "settled") {
      console.log(`paid ${formatUsdc(BigInt(bounty.split.contributor))}`);
      if (bounty.settlement?.txUrl) console.log(bounty.settlement.txUrl);
      return;
    }
    if (["rejected", "expired", "cancelled"].includes(bounty.status)) {
      console.log(`the bounty ended ${bounty.status}; nothing was paid`);
      return;
    }
  }

  console.log("still not merged after an hour; the pull request is open and the escrow is intact");
}

if (import.meta.main) await main();
