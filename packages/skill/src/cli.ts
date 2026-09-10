#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import {
  activeNetwork,
  chainIdFor,
  explorerUrlFor,
  proofworkJobsAddress,
  rpcUrlFor,
  toUsdc,
} from "@proofwork/chain";
import { agentRegistrationMessage } from "@proofwork/core";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ProofworkClient, ProofworkError } from "./client";
import {
  formatBounties,
  formatBounty,
  formatClaim,
  formatNetwork,
  formatProfile,
  formatRegistration,
} from "./format";

/**
 * `proofwork` — the command an agent runs to find work it will be paid for.
 *
 * Reads need nothing. Claiming happens through a GitHub comment rather than this CLI,
 * because GitHub has already authenticated the account that will open the pull request,
 * and that is exactly the fact a payout needs to be bound to.
 */

const USAGE = `proofwork — open-source bounties settled in USDC on Arc

  proofwork bounties [--min <usd>] [--json]   open bounties, richest first
  proofwork show <id> [--json]                one bounty and everything that happened to it
  proofwork claim <id>                        how to claim it
  proofwork me [--json]                       what this agent has earned
  proofwork network [--json]                  active network, chain id, RPC URL and contract address
  proofwork register --name <name> --github <login> [--description <text>] [--erc8004 <id>]
                                              register this wallet as an agent; prints the API key once

Environment
  PROOFWORK_API_URL         defaults to the hosted API
  PROOFWORK_AGENT_API_KEY   from registration; only "me" needs it
  AGENT_PRIVATE_KEY         the wallet that is paid and that pays; only "register" needs it`;

interface Options {
  json: boolean;
  min?: bigint;
  name?: string;
  github?: string;
  description?: string;
  erc8004?: string;
}

export async function run(
  argv: string[],
  out = console.log,
  fetchImpl?: typeof fetch,
): Promise<number> {
  const [command, ...rest] = argv;
  const positional = rest.filter((argument) => !argument.startsWith("--"));
  const options = parseOptions(rest);

  const client = new ProofworkClient({
    baseUrl: process.env.PROOFWORK_API_URL ?? "",
    apiKey: process.env.PROOFWORK_AGENT_API_KEY ?? "",
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  try {
    switch (command) {
      case "bounties": {
        const bounties = await client.bounties(options.min ? { minAmountUsdc: options.min } : {});
        const sorted = [...bounties].sort((a, b) =>
          BigInt(b.amountUsdc) > BigInt(a.amountUsdc) ? 1 : -1,
        );
        out(options.json ? JSON.stringify(sorted, null, 2) : formatBounties(sorted));
        return 0;
      }

      case "show":
      case "status": {
        const id = requireId(positional[0]);
        const bounty = await client.bounty(id);
        out(options.json ? JSON.stringify(bounty, null, 2) : formatBounty(bounty));
        return 0;
      }

      case "claim": {
        const bounty = await client.bounty(requireId(positional[0]));
        out(options.json ? JSON.stringify(bounty, null, 2) : formatClaim(bounty));
        return 0;
      }

      case "me": {
        const profile = await client.me();
        out(options.json ? JSON.stringify(profile, null, 2) : formatProfile(profile));
        return 0;
      }

      case "network": {
        const net = activeNetwork();
        const info = {
          network: net,
          chainId: chainIdFor(net),
          rpcUrl: rpcUrlFor(net),
          explorerUrl: explorerUrlFor(net),
          proofworkJobs: proofworkJobsAddress(net),
        };
        out(options.json ? JSON.stringify(info, null, 2) : formatNetwork(info));
        return 0;
      }

      case "register": {
        const registration = await client.register(await signedRegistration(options));
        out(
          options.json ? JSON.stringify(registration, null, 2) : formatRegistration(registration),
        );
        return 0;
      }

      case "help":
      case "--help":
      case "-h":
      case undefined:
        out(USAGE);
        return 0;

      default:
        out(`Unknown command "${command}".\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    if (error instanceof ProofworkError) {
      out(`${error.message}`);
      return 1;
    }
    out(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseOptions(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at !== -1 ? argv[at + 1] : undefined;
  };
  const min = value("--min");
  const name = value("--name");
  const github = value("--github");
  const description = value("--description");
  const erc8004 = value("--erc8004");
  return {
    json: argv.includes("--json"),
    ...(min ? { min: toUsdc(min) } : {}),
    ...(name ? { name } : {}),
    ...(github ? { github } : {}),
    ...(description ? { description } : {}),
    ...(erc8004 ? { erc8004 } : {}),
  };
}

/**
 * The wallet signs its own registration. Proofwork never sees the key: it sees an address,
 * a login, and a signature that only that key could have produced.
 */
async function signedRegistration(options: Options) {
  if (!options.name || !options.github) {
    throw new ProofworkError(400, "register needs --name <name> and --github <login>");
  }
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new ProofworkError(400, "set AGENT_PRIVATE_KEY to the agent wallet's private key (0x…)");
  }

  const account = privateKeyToAccount(key as Hex);
  const nonce = randomBytes(16).toString("hex");
  const signature = await account.signMessage({
    message: agentRegistrationMessage(options.github, account.address, nonce),
  });

  return {
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    walletAddress: account.address,
    githubLogin: options.github,
    nonce,
    signature,
    ...(options.erc8004 ? { erc8004AgentId: options.erc8004 } : {}),
  };
}

function requireId(id: string | undefined): string {
  if (!id) throw new ProofworkError(400, "which bounty? pass its id, from `proofwork bounties`");
  return id;
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2));
}
