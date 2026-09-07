#!/usr/bin/env bun
/**
 * Deploys ProofworkJobs and refreshes the generated TypeScript deployment record.
 *
 *   bun run contracts:deploy:testnet          deploy and verify on Arc testnet
 *   bun run contracts:deploy:testnet --dry    simulate only, no broadcast
 *
 * Runs from the repository root so that .env is loaded, then shells out to forge with
 * the terminal attached, because the keystore password is typed interactively.
 *
 * Foundry needs `--sender` even when `--account` is given: without it the simulation
 * runs as Foundry's default address, and anything the script derives from msg.sender,
 * the contract owner in our case, is silently wrong.
 */
const network = (process.argv[2] ?? "testnet") as "testnet" | "mainnet";
const dryRun = process.argv.includes("--dry");

const sender = process.env.DEPLOYER_ADDRESS;
if (!sender) {
  throw new Error("DEPLOYER_ADDRESS is not set in .env (the Foundry keystore account address)");
}
if (!process.env.TREASURY) {
  throw new Error("TREASURY is not set in .env (where protocol fees are sent)");
}

const args = [
  "script",
  "script/Deploy.s.sol:Deploy",
  "--rpc-url",
  network === "testnet" ? "arc_testnet" : "arc_mainnet",
  "--account",
  "proofwork-deployer",
  "--sender",
  sender,
  "-vvv",
];

if (!dryRun) {
  args.push("--broadcast");
  if (network === "testnet") {
    args.push(
      "--verify",
      "--verifier",
      "blockscout",
      "--verifier-url",
      "https://testnet.arcscan.app/api",
    );
  }
}

console.log(`${dryRun ? "simulating" : "deploying"} to arc ${network} as ${sender}\n`);

const forge = Bun.spawn(["forge", ...args], {
  cwd: "packages/contracts",
  stdio: ["inherit", "inherit", "inherit"],
});
const code = await forge.exited;

if (code !== 0) {
  console.error("\nforge exited non-zero; nothing was recorded");
  process.exit(code);
}

if (dryRun) {
  // A simulation writes a deployment record for an address that does not exist.
  await Bun.file(`packages/contracts/deployments/${network === "testnet" ? 5042002 : 0}.json`)
    .delete()
    .catch(() => {});
  console.log("\nsimulation only; deployment record discarded");
  process.exit(0);
}

const exporter = Bun.spawn(["bun", "run", "script/export-abi.ts"], {
  cwd: "packages/contracts",
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await exporter.exited);
