#!/usr/bin/env bun
/**
 * Creates the Circle developer-controlled wallets Proofwork signs with.
 *
 *   VERIFIER  signs settle() when a maintainer merges a pull request
 *   TREASURY  receives protocol fees and refunds agent claim stakes
 *
 * Idempotent: it reuses a wallet set named below if one already exists, and only
 * creates wallets that are missing. Run again on mainnet day with a LIVE key and
 * CIRCLE_BLOCKCHAIN=ARC.
 */
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const WALLET_SET_NAME = "Proofwork";
const BLOCKCHAIN = (process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET") as "ARC-TESTNET";
const ROLES = ["proofwork-verifier", "proofwork-treasury"] as const;

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env");
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const sets = await client.listWalletSets({});
let walletSet = sets.data?.walletSets?.find((s) => s.name === WALLET_SET_NAME);

if (walletSet) {
  console.log(`wallet set "${WALLET_SET_NAME}" already exists: ${walletSet.id}`);
} else {
  const created = await client.createWalletSet({ name: WALLET_SET_NAME });
  walletSet = created.data?.walletSet;
  if (!walletSet) throw new Error("wallet set creation returned no wallet set");
  console.log(`created wallet set "${WALLET_SET_NAME}": ${walletSet.id}`);
}

const existing = await client.listWallets({ walletSetId: walletSet.id, blockchain: BLOCKCHAIN });
const byRef = new Map((existing.data?.wallets ?? []).map((w) => [w.refId ?? "", w]));

const missing = ROLES.filter((role) => !byRef.has(role));
if (missing.length > 0) {
  // `blockchains` is a unique list and `count` is how many wallets per chain;
  // repeating the chain in the array is rejected as a bad blockchain parameter.
  const created = await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: [BLOCKCHAIN],
    accountType: "EOA",
    count: missing.length,
    metadata: missing.map((role) => ({ name: role, refId: role })),
  });
  for (const wallet of created.data?.wallets ?? []) {
    byRef.set(wallet.refId ?? "", wallet);
  }
  console.log(`created ${missing.length} wallet(s): ${missing.join(", ")}`);
}

console.log("");
for (const role of ROLES) {
  const wallet = byRef.get(role);
  if (!wallet) throw new Error(`wallet for ${role} is missing after setup`);
  console.log(`${role}`);
  console.log(`  walletId ${wallet.id}`);
  console.log(`  address  ${wallet.address}`);
  console.log(`  chain    ${wallet.blockchain}  state=${wallet.state}`);
}

console.log("");
console.log("Add to .env:");
console.log(`CIRCLE_WALLET_SET_ID=${walletSet.id}`);
console.log(`CIRCLE_VERIFIER_WALLET_ID=${byRef.get("proofwork-verifier")?.id ?? ""}`);
console.log(`CIRCLE_TREASURY_WALLET_ID=${byRef.get("proofwork-treasury")?.id ?? ""}`);
