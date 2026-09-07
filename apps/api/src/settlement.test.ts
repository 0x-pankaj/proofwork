import { type CircleClient, CircleCompliance, CircleWallets } from "@proofwork/circle";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { FEEDBACK_TAG, GIVE_FEEDBACK_SIGNATURE, settleBountyById } from "./settlement";
import {
  createFakeStore,
  fakeAgent,
  fakeBounty,
  fakeClaim,
  fakeInstallation,
  fakeRepo,
  fakeSubmission,
  fakeUser,
} from "./store.fake";
import type { CommentWriter } from "./webhooks/handlers/issues";

const TX_HASH = "0x9f2c";
const ERC8004_REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const MERGE_SHA = "b".repeat(40);

const env = {
  ARC_NETWORK: "testnet",
  PUBLIC_WEB_URL: "https://proofwork.dev",
  CIRCLE_VERIFIER_WALLET_ID: "wallet-verifier",
} as unknown as Env;

function commentWriter() {
  const posted: Array<{ issueNumber: number; marker: string; body: string }> = [];
  const github: CommentWriter = {
    async upsertIssueComment(_repo, issueNumber, marker, body) {
      posted.push({ issueNumber, marker, body });
      return { id: 1, body, htmlUrl: "https://github.com/c/1", authorLogin: "proofwork-arc[bot]" };
    },
  };
  return { github, posted };
}

type ExecutionInput = Parameters<CircleClient["createContractExecutionTransaction"]>[0];

function circleClient(finalState = "CONFIRMED") {
  const create = vi.fn(async (_input: ExecutionInput) => ({ data: { id: "circle-tx-1" } }));
  const client: CircleClient = {
    createContractExecutionTransaction: create,
    async getTransaction() {
      return {
        data: {
          transaction: {
            state: finalState,
            txHash: finalState === "CONFIRMED" ? TX_HASH : null,
            errorReason: finalState === "DENIED" ? "SANCTIONED_ADDRESS" : undefined,
          },
        },
      };
    },
  };
  return { client, create };
}

function deps(options: { finalState?: string; screening?: "approve" | "deny" } = {}) {
  const store = createFakeStore({
    repos: [
      { repo: fakeRepo({ maintainerUserId: "user-maintainer" }), installation: fakeInstallation() },
    ],
    users: [fakeUser({ id: "user-maintainer", login: "maintainer", githubId: 9n })],
    bounties: [fakeBounty({ status: "submitted" })],
    claims: [fakeClaim()],
    submissions: [fakeSubmission({ status: "merged", mergeSha: MERGE_SHA, mergedAt: new Date() })],
  });
  const { github, posted } = commentWriter();
  const { client, create } = circleClient(options.finalState ?? "CONFIRMED");
  const wallets = new CircleWallets({ apiKey: "k", entitySecret: "s", client });
  const compliance = new CircleCompliance({
    apiKey: "k",
    chain: "ARC-TESTNET",
    mode: options.screening ? "engine" : "wallet-only",
    fetch: (async () =>
      Response.json({
        result: options.screening === "deny" ? "DENIED" : "APPROVED",
      })) as unknown as typeof fetch,
  });

  return { store, github, posted, wallets, compliance, create, env };
}

describe("settleBountyById", () => {
  it("pays the contributor, records the payout and says so on the issue", async () => {
    const context = deps();

    const outcome = await settleBountyById(context, "bounty-1");

    expect(outcome).toMatchObject({ kind: "settled", txHash: TX_HASH });
    expect(context.create).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-verifier",
        contractAddress: "0x3Bc728A813a7aBe0cB898fd63967525e92353D85",
        abiFunctionSignature: "settle(uint256,address,bytes32,bytes32)",
        idempotencyKey: "bounty-1",
      }),
    );

    const call = context.create.mock.calls[0];
    if (!call) throw new Error("the settlement transaction was never submitted");
    const [jobId, provider, deliverable, reason] = call[0].abiParameters as string[];
    expect(jobId).toBe("1");
    expect(provider).toBe("0x52679a68dc5c1c31f1ac22b89431a2b06524c4aa");
    expect(deliverable).toMatch(/^0x[0-9a-f]{64}$/);
    expect(reason).toMatch(/^0x[0-9a-f]{64}$/);

    const bounty = context.store.bounties.get("bounty-1");
    expect(bounty?.status).toBe("settled");
    expect(bounty?.settleTxHash).toBe(TX_HASH);
    expect(context.store.settlements.get("bounty-1")).toMatchObject({
      status: "complete",
      txHash: TX_HASH,
      circleTxId: "circle-tx-1",
    });
    expect(context.store.claims[0]).toMatchObject({ status: "won", stakeStatus: "refunded" });

    expect(context.posted[0]?.issueNumber).toBe(12);
    expect(context.posted[0]?.body).toContain("$170.00 USDC to @octocat");
    expect(context.posted[0]?.body).toContain("$30.00 USDC to @maintainer");
    expect(context.posted[0]?.body).toContain(`https://testnet.arcscan.app/tx/${TX_HASH}`);
  });

  it("marks every other claim lost once one is paid", async () => {
    const context = deps();
    context.store.claims.push(fakeClaim({ id: "claim-2", githubLogin: "someone-else" }));

    await settleBountyById(context, "bounty-1");

    expect(context.store.claims[1]).toMatchObject({ status: "lost" });
  });

  it("records reputation locally for an agent with no on-chain identity", async () => {
    const context = deps();
    context.store.agents.set("proofwork-agent", fakeAgent());
    context.store.claims = [fakeClaim({ claimantKind: "agent", agentId: "agent-1", userId: null })];

    await settleBountyById(context, "bounty-1");

    expect(context.store.reputation).toEqual([
      { agentId: "agent-1", bountyId: "bounty-1", score: 100, txHash: null },
    ]);
    // One contract call: the settlement. There is no ERC-8004 token to leave feedback on.
    expect(context.create).toHaveBeenCalledTimes(1);
  });

  it("writes ERC-8004 feedback for an agent that owns an identity", async () => {
    const context = deps();
    context.store.agents.set("proofwork-agent", fakeAgent({ erc8004AgentId: 7n }));
    context.store.claims = [fakeClaim({ claimantKind: "agent", agentId: "agent-1", userId: null })];

    await settleBountyById(context, "bounty-1");

    const feedback = context.create.mock.calls[1]?.[0];
    expect(feedback?.contractAddress).toBe(ERC8004_REPUTATION);
    expect(feedback?.abiFunctionSignature).toBe(GIVE_FEEDBACK_SIGNATURE);
    expect(feedback?.abiParameters?.slice(0, 5)).toEqual([
      "7",
      "100",
      "0",
      FEEDBACK_TAG,
      "0x-pankaj/proofwork",
    ]);
    // A different idempotency key from the settlement, or Circle would collapse the two.
    expect(feedback?.idempotencyKey).not.toBe("bounty-1");
    expect(context.store.reputation).toEqual([
      { agentId: "agent-1", bountyId: "bounty-1", score: 100, txHash: TX_HASH },
    ]);
  });

  it("still records reputation when the registry write fails", async () => {
    const context = deps();
    context.store.agents.set("proofwork-agent", fakeAgent({ erc8004AgentId: 7n }));
    context.store.claims = [fakeClaim({ claimantKind: "agent", agentId: "agent-1", userId: null })];
    context.create.mockImplementationOnce(async () => ({ data: { id: "circle-tx-1" } }));
    context.create.mockImplementationOnce(async () => {
      throw new Error("registry unreachable");
    });

    const outcome = await settleBountyById(context, "bounty-1");

    // The payment stands. Feedback is a footnote to it, not a condition of it.
    expect(outcome.kind).toBe("settled");
    expect(context.store.reputation).toEqual([
      { agentId: "agent-1", bountyId: "bounty-1", score: 100, txHash: null },
    ]);
  });

  it("does not pay an address compliance denied", async () => {
    const context = deps({ screening: "deny" });

    const outcome = await settleBountyById(context, "bounty-1");

    expect(outcome.kind).toBe("blocked");
    expect(context.create).not.toHaveBeenCalled();
    expect(context.store.bounties.get("bounty-1")?.status).toBe("submitted");
    expect(context.store.settlements.get("bounty-1")).toMatchObject({ status: "failed" });
    expect(context.posted[0]?.body).toContain("did not go through");
  });

  it("puts the bounty back for a retry when Circle denies the transaction", async () => {
    const context = deps({ finalState: "DENIED" });

    const outcome = await settleBountyById(context, "bounty-1");

    expect(outcome.kind).toBe("failed");
    expect(context.store.bounties.get("bounty-1")?.status).toBe("submitted");
    expect(context.store.settlements.get("bounty-1")).toMatchObject({
      status: "failed",
      circleTxId: "circle-tx-1",
    });
  });

  it("skips a bounty that has already been paid", async () => {
    const context = deps();

    await settleBountyById(context, "bounty-1");
    context.create.mockClear();
    const second = await settleBountyById(context, "bounty-1");

    expect(second.kind).toBe("skipped");
    expect(context.create).not.toHaveBeenCalled();
  });

  it("refuses to settle when the claimant has no payout address", async () => {
    const context = deps();
    context.store.claims = [fakeClaim({ payoutAddress: "" })];

    const outcome = await settleBountyById(context, "bounty-1");

    expect(outcome).toMatchObject({ kind: "skipped" });
    expect(context.create).not.toHaveBeenCalled();
  });

  it("does nothing for a bounty with no merged pull request", async () => {
    const context = deps();
    context.store.submissions = [fakeSubmission({ status: "open" })];

    expect(await settleBountyById(context, "bounty-1")).toMatchObject({ kind: "skipped" });
  });
});
