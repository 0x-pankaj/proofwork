import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatUsdc } from "@proofwork/chain";
import { type BountyDetail, type BountySummary, ProofworkClient } from "@proofwork/skill";
import { AgentGitHub } from "./github";
import { pullRequestBody } from "./pull-request";
import { must, run } from "./shell";

/**
 * The reference agent: one bounty, start to finish, with nobody clicking anything.
 *
 * It picks a funded issue, claims it by commenting from its own GitHub account, writes the
 * change with Claude Code, opens a pull request that says `Fixes #N`, and then waits. The
 * waiting is the point — the agent has no way to pay itself. A maintainer merges, and the
 * escrow settles on Arc on its own.
 *
 * Deliberately small. It is a worked example of the loop, not a framework.
 */

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1_000;

interface Config {
  apiUrl: string;
  apiKey: string;
  githubToken: string;
  /** How the agent writes code. Anything that takes a prompt and edits the working tree. */
  codeCommand: string;
  codeArgs: string[];
  bountyId?: string;
  dryRun: boolean;
}

function config(): Config {
  const codeCommand = process.env.AGENT_CODE_COMMAND ?? "claude";
  return {
    apiUrl: process.env.PROOFWORK_API_URL ?? "",
    apiKey: required("PROOFWORK_AGENT_API_KEY"),
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

  const bounty = await pick(proofwork, settings.bountyId);
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
  // address gets bound to a login someone can be held to.
  await github.comment(bounty.repo, bounty.issueNumber, "/claim");
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

    await commit(workdir, bounty, branch);
    const pull = await github.openPullRequest({
      repo: bounty.repo,
      title: `Fix: ${bounty.issueTitle}`,
      body: pullRequestBody(bounty, me.name),
      head: branch,
      base: await github.defaultBranch(bounty.repo),
    });
    console.log(`opened ${pull.html_url}`);

    await waitForSettlement(proofwork, bounty.id);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/** The best-paying open bounty this agent is not blocked from claiming. */
async function pick(
  proofwork: ProofworkClient,
  bountyId: string | undefined,
): Promise<BountyDetail | undefined> {
  if (bountyId) return proofwork.bounty(bountyId);

  const open = await proofwork.bounties();
  const richest = [...open].sort((a: BountySummary, b: BountySummary) =>
    BigInt(b.split.contributor) > BigInt(a.split.contributor) ? 1 : -1,
  );

  for (const summary of richest) {
    const bounty = await proofwork.bounty(summary.id);
    // Somebody else holding it is not a reason to skip — the first merge is paid — but
    // there is no sense being the fourth agent on the same issue.
    if (bounty.claims.filter((claim) => claim.status === "active").length < 2) return bounty;
  }
  return undefined;
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

async function commit(workdir: string, bounty: BountyDetail, branch: string): Promise<void> {
  await must("git", ["add", "-A"], workdir);
  await must(
    "git",
    ["commit", "-m", `fix: ${bounty.issueTitle.toLowerCase().slice(0, 60)}`],
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
