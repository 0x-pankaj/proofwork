import { zValidator } from "@hono/zod-validator";
import {
  activeNetwork,
  erc8004IdentityAbi,
  erc8004IdentityAddress,
  publicClient,
  txUrl,
} from "@proofwork/chain";
import { agentRegistrationMessage } from "@proofwork/core";
import type { Agent } from "@proofwork/db";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getAddress, type Hex, verifyMessage } from "viem";
import { z } from "zod";
import type { Env } from "../env";
import { fail } from "../http";
import { hashApiKey, looksLikeApiKey, newApiKey } from "../keys";
import { agentMetadataUrl, agentProfileUrl } from "../urls";
import type { BountyVariables } from "./bounties";

/**
 * Agents as first-class contributors.
 *
 * An agent proves two things to register: that it holds the key behind its payout
 * address, by signing for it, and — if it claims an ERC-8004 identity — that the same
 * address owns that token on Arc. Both are checked against the chain, so an operator
 * cannot borrow someone else's reputation by pasting an id.
 */

/** The message an agent signs; defined in core so the CLI signs exactly what we verify. */
export const registrationMessage = agentRegistrationMessage;

export interface AgentVariables extends BountyVariables {
  agent: Agent;
}

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  githubLogin: z.string().min(1).max(39),
  nonce: z.string().min(8).max(100),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  erc8004AgentId: z
    .string()
    .regex(/^\d{1,78}$/)
    .optional(),
});

export const agentRoutes = new Hono<{ Bindings: Env; Variables: AgentVariables }>();

/** Bearer authentication for the routes an agent calls as itself. */
const agentOnly = createMiddleware<{ Bindings: Env; Variables: AgentVariables }>(
  async (c, next) => {
    const presented = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!looksLikeApiKey(presented)) {
      return fail(c, 401, "unauthorized", "send the agent's API key as a bearer token");
    }

    const agent = await c
      .get("store")()
      .agentByApiKeyHash(await hashApiKey(presented));
    if (!agent) return fail(c, 401, "unauthorized", "that API key is not registered");

    c.set("agent", agent);
    await next();
  },
);

/**
 * Registers an agent and returns its API key once.
 *
 * Deliberately public: an agent operator has no Proofwork account, and the signature is
 * what authorises the call. Registering twice for the same wallet or login is refused
 * rather than silently rotating the key.
 */
agentRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const input = c.req.valid("json");
  const store = c.get("store")();

  const valid = await verifyMessage({
    address: input.walletAddress as Hex,
    message: registrationMessage(input.githubLogin, input.walletAddress, input.nonce),
    signature: input.signature as Hex,
  });
  if (!valid) {
    return fail(c, 400, "bad_signature", "that signature does not match the wallet address");
  }

  const walletAddress = getAddress(input.walletAddress);
  if (await store.agentByWalletAddress(walletAddress)) {
    return fail(c, 409, "already_registered", "that wallet is already registered as an agent");
  }
  if (await store.agentByGithubLogin(input.githubLogin)) {
    return fail(c, 409, "already_registered", `@${input.githubLogin} is already an agent`);
  }

  // An ERC-8004 id is optional, but a claimed one has to be owned by the same wallet.
  let erc8004AgentId: bigint | null = null;
  if (input.erc8004AgentId) {
    const owner = await identityOwner(c.env, BigInt(input.erc8004AgentId));
    if (!owner) {
      return fail(c, 400, "unknown_agent_id", "that ERC-8004 agent id is not registered on Arc");
    }
    if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return fail(
        c,
        403,
        "not_the_owner",
        `ERC-8004 agent ${input.erc8004AgentId} is owned by ${owner}`,
      );
    }
    erc8004AgentId = BigInt(input.erc8004AgentId);
  }

  const apiKey = newApiKey();
  const agent = await store.createAgent({
    name: input.name,
    description: input.description ?? null,
    walletAddress,
    githubLogin: input.githubLogin,
    erc8004AgentId,
    metadataUri: null,
    apiKeyHash: await hashApiKey(apiKey),
  });

  // The metadata URI is derived from the id, so it can only be filled in after the insert.
  await store.setAgentIdentity(agent.id, {
    erc8004AgentId,
    metadataUri: agentMetadataUrl(c.env, agent.id),
  });

  return c.json(
    {
      id: agent.id,
      name: agent.name,
      githubLogin: agent.githubLogin,
      walletAddress: agent.walletAddress,
      erc8004AgentId: erc8004AgentId === null ? null : String(erc8004AgentId),
      metadataUri: agentMetadataUrl(c.env, agent.id),
      /** Shown once. Proofwork stores only its hash and cannot show it again. */
      apiKey,
    },
    201,
  );
});

/** The agent's own view: who it is and what it has earned. */
agentRoutes.get("/me", agentOnly, async (c) => {
  const agent = c.get("agent");
  const record = await c.get("store")().agentRecord(agent.id);

  return c.json({
    ...profile(c.env, agent, record.settled, record.earnedUsdc),
    reputation: record.reputation.map((event) => ({
      bountyId: event.bountyId,
      score: event.score,
      txUrl: event.txHash ? txUrl(event.txHash, c.env) : null,
      at: event.createdAt,
    })),
  });
});

/** A public profile, so a maintainer can see an agent's record before it claims. */
agentRoutes.get("/:id", async (c) => {
  const store = c.get("store")();
  const agent = await store.agentById(c.req.param("id"));
  if (!agent) return fail(c, 404, "not_found", "no such agent");

  const record = await store.agentRecord(agent.id);
  return c.json(profile(c.env, agent, record.settled, record.earnedUsdc));
});

/**
 * ERC-8004 metadata. The registry stores a URI, and this is what it points at: served
 * from the API so an agent can register before anything is pinned anywhere.
 */
agentRoutes.get("/:id/metadata.json", async (c) => {
  const agent = await c.get("store")().agentById(c.req.param("id"));
  if (!agent) return fail(c, 404, "not_found", "no such agent");

  return c.json({
    name: agent.name,
    description: agent.description ?? `${agent.name} contributes to open source through Proofwork.`,
    url: agentProfileUrl(c.env, agent.id),
    address: agent.walletAddress,
    registrations: [
      {
        agentId: agent.erc8004AgentId === null ? null : String(agent.erc8004AgentId),
        agentAddress: agent.walletAddress,
        signature: null,
      },
    ],
    trustModels: ["reputation"],
    skills: [
      {
        id: "proofwork-bounty",
        name: "Open-source bounty",
        description:
          "Claims a funded GitHub issue, opens a pull request, and is paid on Arc when a maintainer merges it.",
      },
    ],
  });
});

function profile(env: Env, agent: Agent, settled: number, earnedUsdc: bigint) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    githubLogin: agent.githubLogin,
    walletAddress: agent.walletAddress,
    erc8004AgentId: agent.erc8004AgentId === null ? null : String(agent.erc8004AgentId),
    metadataUri: agent.metadataUri ?? agentMetadataUrl(env, agent.id),
    reputationScore: agent.reputationScore,
    settled,
    earnedUsdc: String(earnedUsdc),
    createdAt: agent.createdAt,
  };
}

/** `ownerOf` reverts for a token that was never minted, which is an answer, not an error. */
async function identityOwner(env: Env, agentId: bigint): Promise<string | undefined> {
  try {
    return await publicClient(env).readContract({
      address: erc8004IdentityAddress(activeNetwork(env), env),
      abi: erc8004IdentityAbi,
      functionName: "ownerOf",
      args: [agentId],
    });
  } catch {
    return undefined;
  }
}
