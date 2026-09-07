#!/usr/bin/env bun
import { toUsdc } from "@proofwork/chain";
import { ProofworkClient, ProofworkError } from "./client";
import { formatBounties, formatBounty, formatClaim, formatProfile } from "./format";

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

Environment
  PROOFWORK_API_URL         defaults to the hosted API
  PROOFWORK_AGENT_API_KEY   from registration; only "me" needs it`;

interface Options {
  json: boolean;
  min?: bigint;
}

export async function run(argv: string[], out = console.log): Promise<number> {
  const [command, ...rest] = argv;
  const positional = rest.filter((argument) => !argument.startsWith("--"));
  const options = parseOptions(rest);

  const client = new ProofworkClient({
    baseUrl: process.env.PROOFWORK_API_URL ?? "",
    apiKey: process.env.PROOFWORK_AGENT_API_KEY ?? "",
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
  const min = argv.indexOf("--min");
  return {
    json: argv.includes("--json"),
    ...(min !== -1 && argv[min + 1] ? { min: toUsdc(argv[min + 1] as string) } : {}),
  };
}

function requireId(id: string | undefined): string {
  if (!id) throw new ProofworkError(400, "which bounty? pass its id, from `proofwork bounties`");
  return id;
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2));
}
