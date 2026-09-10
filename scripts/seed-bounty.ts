#!/usr/bin/env bun
/**
 * Puts a real, funded bounty on a real issue, through the real API.
 *
 * Everything a funder's browser would do, done from a terminal: create the draft, sign
 * the two transactions, then show the API the receipt. The only difference is who holds
 * the key — here it is the Circle wallet rather than MetaMask.
 *
 *   bun run seed:bounty -- --repo 0x-pankaj/proofwork --amount 2 --issue 4
 *   bun run seed:bounty -- --amount 3 --tag arc-integration --title "…" --body "…"
 *
 * With no `--issue` it opens one on the repository first, with `--title` and `--body` or
 * the default Arc-mainnet one. `--tag` puts the bounty on that board. Talks to
 * `PUBLIC_API_URL`, so it works against `wrangler dev` and the deployed API alike.
 */

import { formatUsdc, toUsdc, txUrl } from "@proofwork/chain";
import { CircleWallets } from "@proofwork/circle";
import { GitHubAppAuth } from "@proofwork/github";

const env = { ARC_NETWORK: "testnet", ARC_TESTNET_RPC_URL: process.env.ARC_TESTNET_RPC_URL };

const args = parseArgs(process.argv.slice(2));
const repoFullName = args.repo ?? "0x-pankaj/proofwork";
const amount = toUsdc(args.amount ?? "2");
const days = Number(args.days ?? 14);

const apiUrl = (process.env.PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
const internalKey = require_("INTERNAL_API_KEY");
const funderAddress = require_("CIRCLE_VERIFIER_ADDRESS");
const maintainerAddress = require_("DEPLOYER_ADDRESS");

const auth = new GitHubAppAuth({
  appId: require_("GITHUB_APP_ID"),
  privateKey: require_("GITHUB_APP_PRIVATE_KEY"),
});
const wallets = new CircleWallets({
  apiKey: require_("CIRCLE_API_KEY"),
  entitySecret: require_("CIRCLE_ENTITY_SECRET"),
});

async function main(): Promise<void> {
  await requireApi();

  const owner = repoFullName.split("/")[0] ?? "";
  const account = await githubUser(owner);
  const user = await api<{ id: string; login: string }>("/v1/users", {
    method: "POST",
    body: { githubId: String(account.id), login: account.login, avatarUrl: account.avatar_url },
  });
  console.log(`funder      @${user.login} (${user.id})`);

  const { repos } = await api<{ repos: Array<{ id: string; fullName: string }> }>("/v1/repos", {
    actingUserId: user.id,
  });
  const repo = repos.find((entry) => entry.fullName === repoFullName);
  if (!repo) throw new Error(`${repoFullName} is not installed. Run: bun run github:sync`);
  console.log(`repository  ${repo.fullName} (${repo.id})`);

  // A review reward needs an address, and it has to exist before the bounty snapshots it.
  await api(`/v1/repos/${repo.id}/policy`, {
    method: "PUT",
    body: { maintainerPayoutAddress: maintainerAddress, autoAccept: true },
    actingUserId: user.id,
  });
  console.log(`maintainer  ${maintainerAddress}`);

  const issueNumber = args.issue ? Number(args.issue) : await openIssue(repo.fullName);
  console.log(`issue       ${repo.fullName}#${issueNumber}`);

  const draft = await api<{
    bountyId: string;
    contract: string;
    split: { contributor: string; maintainer: string; fee: string; total: string };
    calldata: {
      approve: { to: string; data: string };
      createAndFund: { to: string; data: string };
    };
  }>("/v1/bounties", {
    method: "POST",
    body: {
      repoId: repo.id,
      issueNumber,
      amountUsdc: String(amount),
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      funderAddress,
      ...(args.tag ? { tags: [args.tag] } : {}),
    },
    actingUserId: user.id,
  });

  console.log(`bounty      ${draft.bountyId}`);
  console.log(
    `split       ${formatUsdc(BigInt(draft.split.contributor))} + ${formatUsdc(BigInt(draft.split.maintainer))} + ${formatUsdc(BigInt(draft.split.fee))} fee`,
  );

  await send("approve the escrow", draft.calldata.approve);
  const funding = await send("create and fund", draft.calldata.createAndFund);

  const confirmed = await api<{ status: string; jobId: string }>(
    `/v1/bounties/${draft.bountyId}/confirm-funding`,
    { method: "POST", body: { txHash: funding }, actingUserId: user.id },
  );

  console.log(`\nJob #${confirmed.jobId} is ${confirmed.status}. The comment is on the issue.`);
  console.log(`  ${txUrl(funding, env)}`);
  console.log(
    `  ${process.env.PUBLIC_WEB_URL ?? "http://localhost:3000"}/bounties/${draft.bountyId}`,
  );
}

async function send(label: string, call: { to: string; data: string }): Promise<string> {
  process.stdout.write(`\n→ ${label} ... `);
  const { id } = await wallets.executeContract({
    walletId: require_("CIRCLE_VERIFIER_WALLET_ID"),
    contractAddress: call.to,
    callData: call.data,
  });
  const transaction = await wallets.waitForTransaction(id, { intervalMs: 750 });
  if (!transaction.txHash) {
    throw new Error(`${label} ended ${transaction.state}: ${transaction.errorReason ?? ""}`);
  }
  console.log(transaction.txHash);
  return transaction.txHash;
}

/** Opens the issue a bounty will be attached to, when one was not named. */
async function openIssue(fullName: string): Promise<number> {
  const installations = await githubApp<Array<{ id: number }>>("/app/installations");
  const installationId = installations[0]?.id;
  if (!installationId) throw new Error("the app is not installed anywhere");

  const token = await auth.installationToken(installationId);
  const response = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "proofwork",
    },
    body: JSON.stringify({
      title: args.title ?? "Add an Arc mainnet address to the deployments record",
      body:
        args.body ??
        [
          "`packages/chain/src/deployments.ts` only knows about Arc testnet.",
          "",
          "When Arc mainnet launches, the record needs the mainnet chain id and address so",
          '`proofworkJobsAddress("mainnet")` resolves without an environment variable.',
        ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`could not open an issue: ${response.status} ${await response.text()}`);
  }
  const issue = (await response.json()) as { number: number };
  return issue.number;
}

async function githubApp<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${await auth.appJwt()}`,
      accept: "application/vnd.github+json",
      "user-agent": "proofwork",
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function githubUser(login: string) {
  const response = await fetch(`https://api.github.com/users/${login}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "proofwork" },
  });
  if (!response.ok) throw new Error(`no such GitHub account: ${login}`);
  return (await response.json()) as { id: number; login: string; avatar_url: string };
}

async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; actingUserId?: string } = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      "x-internal-key": internalKey,
      ...(options.actingUserId ? { "x-acting-user": options.actingUserId } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function requireApi(): Promise<void> {
  try {
    await fetch(`${apiUrl}/health`);
  } catch {
    throw new Error(
      `the API is not answering at ${apiUrl}. Start it with: bun run --cwd apps/api dev`,
    );
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag?.startsWith("--")) {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        args[flag.slice(2)] = value;
        index += 1;
      }
    }
  }
  return args;
}

function require_(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
