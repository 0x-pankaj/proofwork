import { agentRegistrationMessage } from "@proofwork/core";
import { type Hex, verifyMessage } from "viem";
import { describe, expect, it } from "vitest";
import { run } from "./cli";
import type { AgentProfile, BountyDetail, BountySummary, RegisterInput } from "./client";
import { formatBounties, formatClaim, formatProfile } from "./format";

const bounty: BountySummary = {
  id: "f2da8102-8981-4124-89ae-8a27bafac88d",
  repo: "0x-pankaj/proofwork",
  issueNumber: 3,
  issueTitle: "Add Arc mainnet chain config",
  issueUrl: "https://github.com/0x-pankaj/proofwork/issues/3",
  status: "open",
  amountUsdc: "3000000",
  split: { contributor: "2550000", maintainer: "450000", fee: "90000", total: "3090000" },
  tags: ["typescript"],
  expiresAt: "2026-09-20T00:00:00.000Z",
  createTxUrl: null,
  settleTxUrl: null,
};

describe("formatBounties", () => {
  it("leads with what the contributor is paid, not the budget", () => {
    const output = formatBounties([bounty]);

    expect(output).toContain("$2.55 USDC");
    expect(output).toContain("0x-pankaj/proofwork#3");
    expect(output).toContain(bounty.id);
  });

  it("says so plainly when the board is empty", () => {
    expect(formatBounties([])).toBe("No open bounties right now.");
  });
});

describe("formatClaim", () => {
  const detail = { ...bounty, claims: [], submission: null, settlement: null } as BountyDetail;

  it("gives the two things an agent has to write", () => {
    const output = formatClaim(detail);

    expect(output).toContain("/claim");
    expect(output).toContain("Fixes #3");
    expect(output).toContain(detail.issueUrl);
  });

  it("refuses a bounty that has already been paid", () => {
    const output = formatClaim({ ...detail, status: "settled" });

    expect(output).toContain("settled");
    expect(output).not.toContain("Fixes #3");
  });
});

describe("formatProfile", () => {
  it("reports earnings and on-chain identity", () => {
    const profile: AgentProfile = {
      id: "agent-1",
      name: "Helpful bot",
      githubLogin: "helpful-bot",
      walletAddress: "0xabc",
      erc8004AgentId: "7",
      reputationScore: 100,
      settled: 1,
      earnedUsdc: "1700000",
    };

    const output = formatProfile(profile);

    expect(output).toContain("$1.70 USDC");
    expect(output).toContain("ERC-8004      7");
  });
});

describe("register", () => {
  // Anvil's first account. A test key, never funded anywhere that matters.
  const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  it("signs the registration with the wallet and prints the key once", async () => {
    process.env.AGENT_PRIVATE_KEY = KEY;
    process.env.PROOFWORK_API_URL = "https://api.example";
    let sent: { url: string; body: RegisterInput } | undefined;

    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) as RegisterInput };
      return Response.json(
        {
          id: "agent-1",
          name: sent.body.name,
          githubLogin: sent.body.githubLogin,
          walletAddress: sent.body.walletAddress,
          erc8004AgentId: null,
          metadataUri: "https://api.example/v1/agents/agent-1/metadata.json",
          apiKey: "pw_agent_secret",
        },
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const lines: string[] = [];
    const code = await run(
      ["register", "--name", "Helpful bot", "--github", "helpful-bot"],
      (line) => lines.push(String(line)),
      fetchImpl,
    );

    expect(code).toBe(0);
    expect(sent?.url).toBe("https://api.example/v1/agents/register");
    expect(sent?.body.walletAddress).toBe(ADDRESS);
    expect(
      await verifyMessage({
        address: ADDRESS,
        message: agentRegistrationMessage("helpful-bot", ADDRESS, sent?.body.nonce ?? ""),
        signature: (sent?.body.signature ?? "0x") as Hex,
      }),
    ).toBe(true);
    expect(lines.join("\n")).toContain("export PROOFWORK_AGENT_API_KEY=pw_agent_secret");
  });

  it("refuses to run without the wallet key", async () => {
    process.env.AGENT_PRIVATE_KEY = "";
    const lines: string[] = [];

    const code = await run(["register", "--name", "Bot", "--github", "bot"], (line) =>
      lines.push(String(line)),
    );

    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("AGENT_PRIVATE_KEY");
  });
});
