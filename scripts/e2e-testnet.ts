#!/usr/bin/env bun
/**
 * The money milestone, run against Arc testnet for real.
 *
 * Funds a bounty, settles it with the Circle verifier wallet exactly as a merged pull
 * request does, and asserts that the contributor, the maintainer and the treasury were
 * all paid in the same transaction. Nothing is mocked: these are real USDC transfers on
 * Arc, signed by Circle, and the assertions fail loudly if a single unit is wrong.
 *
 * Run from the repository root, which is where .env is read from:
 *   bun run e2e:testnet
 */

import {
  ARC_TESTNET_EXPLORER_URL,
  addressUrl,
  formatUsdc,
  proofworkJobsAbi,
  proofworkJobsAddress,
  publicClientFor,
  toUsdc,
  txUrl,
  usdcAddress,
} from "@proofwork/chain";
import { CircleWallets } from "@proofwork/circle";
import { deliverableHash, mergedReasonHash } from "@proofwork/core";
import { erc20Abi, type Hex, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const NETWORK = "testnet" as const;
const BUDGET = toUsdc("2");
const MAINTAINER_REWARD_BPS = 1_500;
const REPO = "0x-pankaj/proofwork";
const PR_NUMBER = 1;
const MERGE_SHA = "e2e00000000000000000000000000000000000ab";

const env = {
  ARC_NETWORK: NETWORK,
  ARC_TESTNET_RPC_URL: process.env.ARC_TESTNET_RPC_URL,
  PROOFWORK_JOBS_ADDRESS_TESTNET: process.env.PROOFWORK_JOBS_ADDRESS_TESTNET,
};

const apiKey = require_("CIRCLE_API_KEY");
const entitySecret = require_("CIRCLE_ENTITY_SECRET");
const walletId = require_("CIRCLE_VERIFIER_WALLET_ID");
const funderAddress = require_("CIRCLE_VERIFIER_ADDRESS") as Hex;
const treasury = require_("CIRCLE_TREASURY_ADDRESS") as Hex;

const contract = proofworkJobsAddress(NETWORK, env) as Hex;
const usdc = usdcAddress(NETWORK, env) as Hex;
const client = publicClientFor(NETWORK, env);
const wallets = new CircleWallets({ apiKey, entitySecret });

// Fresh addresses every run, so the assertions are about this settlement and nothing else.
const contributor = privateKeyToAccount(generatePrivateKey()).address;
const maintainer = privateKeyToAccount(generatePrivateKey()).address;

async function main(): Promise<void> {
  const fee = await feeFor(BUDGET);
  const maintainerShare = (BUDGET * BigInt(MAINTAINER_REWARD_BPS)) / 10_000n;
  const contributorShare = BUDGET - maintainerShare;

  console.log("Proofwork end-to-end settlement on Arc testnet");
  console.log(`  contract     ${addressUrl(contract, env)}`);
  console.log(`  funder       ${funderAddress}`);
  console.log(`  contributor  ${contributor}`);
  console.log(`  maintainer   ${maintainer}`);
  console.log(`  treasury     ${treasury}`);
  console.log(
    `  split        ${formatUsdc(contributorShare)} + ${formatUsdc(maintainerShare)} + ${formatUsdc(fee)} fee`,
  );

  const funderBalance = await balanceOf(funderAddress);
  if (funderBalance < BUDGET + fee) {
    throw new Error(
      `the verifier wallet holds ${formatUsdc(funderBalance)}, which is not enough for ${formatUsdc(BUDGET + fee)}. Top it up at https://faucet.circle.com`,
    );
  }

  const before = await balances();

  await step("approve the escrow", () =>
    execute(usdc, "approve(address,uint256)", [contract, String(BUDGET + fee)]),
  );

  const expiredAt = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;
  const fundingTx = await step("create and fund the job", () =>
    execute(contract, "createAndFund(address,uint256,string,uint256,address,uint16)", [
      funderAddress,
      String(expiredAt),
      `${REPO}#${PR_NUMBER}`,
      String(BUDGET),
      maintainer,
      MAINTAINER_REWARD_BPS,
    ]),
  );

  const jobId = await jobIdFrom(fundingTx);
  console.log(`  job          #${jobId}`);

  const startedAt = Date.now();
  const settleTx = await step("settle as the verifier", () =>
    execute(contract, "settle(uint256,address,bytes32,bytes32)", [
      String(jobId),
      contributor,
      deliverableHash({ repoFullName: REPO, prNumber: PR_NUMBER, mergeSha: MERGE_SHA }),
      mergedReasonHash(MERGE_SHA),
    ]),
  );
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  const after = await balances();

  assertPaid("contributor", after.contributor - before.contributor, contributorShare);
  assertPaid("maintainer", after.maintainer - before.maintainer, maintainerShare);
  assertPaid("treasury", after.treasury - before.treasury, fee);

  const job = await client.readContract({
    address: contract,
    abi: proofworkJobsAbi,
    functionName: "getJob",
    args: [jobId],
  });
  if (Number((job as { status: number }).status) !== 3) {
    throw new Error(`job #${jobId} is not Completed on chain`);
  }

  console.log(`\nSettled in ${seconds}s. Three payments, one transaction.`);
  console.log(`  ${txUrl(settleTx, env)}`);
}

async function execute(
  address: Hex,
  signature: string,
  parameters: (string | number | boolean)[],
): Promise<string> {
  const { id } = await wallets.executeContract({
    walletId,
    contractAddress: address,
    abiFunctionSignature: signature,
    abiParameters: parameters,
  });

  const transaction = await wallets.waitForTransaction(id, { intervalMs: 750 });
  if (
    !transaction.txHash ||
    (transaction.state !== "CONFIRMED" && transaction.state !== "COMPLETE")
  ) {
    throw new Error(
      `${signature} ended ${transaction.state}${transaction.errorReason ? `: ${transaction.errorReason}` : ""}`,
    );
  }

  await client.waitForTransactionReceipt({ hash: transaction.txHash as Hex });
  return transaction.txHash;
}

async function jobIdFrom(txHash: string): Promise<bigint> {
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  const [created] = parseEventLogs({
    abi: proofworkJobsAbi,
    eventName: "JobCreated",
    logs: receipt.logs,
  });
  if (!created) throw new Error(`no JobCreated event in ${txHash}`);
  return created.args.jobId;
}

async function feeFor(budget: bigint): Promise<bigint> {
  const feeBps = await client.readContract({
    address: contract,
    abi: proofworkJobsAbi,
    functionName: "feeBps",
  });
  return (budget * BigInt(feeBps)) / 10_000n;
}

async function balanceOf(address: Hex): Promise<bigint> {
  return client.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function balances() {
  const [contributorBalance, maintainerBalance, treasuryBalance] = await Promise.all([
    balanceOf(contributor),
    balanceOf(maintainer),
    balanceOf(treasury),
  ]);
  return {
    contributor: contributorBalance,
    maintainer: maintainerBalance,
    treasury: treasuryBalance,
  };
}

function assertPaid(who: string, actual: bigint, expected: bigint): void {
  if (actual !== expected) {
    throw new Error(`${who} received ${formatUsdc(actual)}, expected ${formatUsdc(expected)}`);
  }
  console.log(`  ✓ ${who.padEnd(12)} +${formatUsdc(actual)}`);
}

async function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  process.stdout.write(`\n→ ${name} ... `);
  const result = await work();
  console.log(`done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  if (typeof result === "string" && result.startsWith("0x")) {
    console.log(`  ${ARC_TESTNET_EXPLORER_URL}/tx/${result}`);
  }
  return result;
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
