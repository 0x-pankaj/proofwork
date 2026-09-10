import type { CircleWallets } from "@proofwork/circle";
import type { X402Payment } from "@proofwork/db";
import type { GitHubClient } from "@proofwork/github";
import { describe, expect, it, vi } from "vitest";
import { sweepExpiries, sweepStakes } from "./cron";
import type { Env } from "./env";
import { createFakeStore, fakeBounty, fakeClaim, fakeInstallation, fakeRepo } from "./store.fake";

const env = {
  ARC_NETWORK: "testnet",
  PUBLIC_WEB_URL: "https://app.example",
  CIRCLE_TREASURY_WALLET_ID: "treasury-wallet",
} as unknown as Env;

const HOUR = 3_600_000;

describe("sweepExpiries", () => {
  it("expires bounties whose deadline has passed", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [
        fakeBounty({ expiresAt: new Date(Date.now() - HOUR) }),
        fakeBounty({ id: "bounty-2", issueNumber: 13, expiresAt: new Date(Date.now() + HOUR) }),
      ],
    });

    const result = await sweepExpiries({ store, env });

    expect(result.bounties).toBe(1);
    expect(store.bounties.get("bounty-1")?.status).toBe("expired");
    expect(store.bounties.get("bounty-2")?.status).toBe("open");
  });

  it("leaves a bounty that is being paid alone", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "settling", expiresAt: new Date(Date.now() - HOUR) })],
    });

    await sweepExpiries({ store, env });

    expect(store.bounties.get("bounty-1")?.status).toBe("settling");
  });

  it("releases a claim held past the repository's time to live", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ status: "claimed" })],
      claims: [
        fakeClaim({ createdAt: new Date(Date.now() - 100 * HOUR), stakeStatus: "held" }),
        fakeClaim({ id: "claim-2", githubLogin: "fresh", createdAt: new Date() }),
      ],
    });

    const result = await sweepExpiries({ store, env });

    expect(result.claims).toBe(1);
    // The stake is still held: the column only says "forwarded" once the money has moved.
    expect(store.claims[0]).toMatchObject({ status: "expired", stakeStatus: "held" });
    expect(store.claims[1]?.status).toBe("active");
  });

  it("tells the issue when a bounty expires", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty({ expiresAt: new Date(Date.now() - HOUR) })],
    });
    const upsertIssueComment = vi.fn(async () => ({}));
    const github = { upsertIssueComment } as unknown as GitHubClient;

    await sweepExpiries({ store, env, github });

    expect(upsertIssueComment).toHaveBeenCalledTimes(1);
    const [repo, issueNumber, marker, body] = upsertIssueComment.mock.calls[0] as unknown as [
      { fullName: string },
      number,
      string,
      string,
    ];
    expect(repo.fullName).toBe("0x-pankaj/proofwork");
    expect(issueNumber).toBe(12);
    expect(marker).toContain("expired");
    expect(body).toContain("https://app.example/bounties/bounty-1");
  });

  it("does nothing when everything is current", async () => {
    const store = createFakeStore({
      repos: [{ repo: fakeRepo(), installation: fakeInstallation() }],
      bounties: [fakeBounty()],
      claims: [fakeClaim({ createdAt: new Date() })],
    });

    expect(await sweepExpiries({ store, env })).toEqual({ bounties: 0, claims: 0 });
  });
});

describe("sweepStakes", () => {
  const MAINTAINER = "0x1111111111111111111111111111111111111111";

  function payment(id: string, payer: string): X402Payment {
    return {
      id,
      endpoint: "/v1/claims/stake",
      payer,
      amountUsdc: 1_000_000n,
      network: "eip155:5042002",
      requestId: `request-${id}`,
      createdAt: new Date("2026-09-08T00:00:00Z"),
    };
  }

  function treasury() {
    const transfer = vi.fn(async () => ({ id: "circle-1" }));
    const waitForTransaction = vi.fn(async () => ({ state: "COMPLETE", txHash: "0xstake" }));
    return {
      transfer,
      waitForTransaction,
      wallets: { transfer, waitForTransaction } as unknown as CircleWallets,
    };
  }

  it("forwards an expired claim's stake to the maintainer and refunds a lost one", async () => {
    const store = createFakeStore({
      repos: [
        {
          repo: fakeRepo({ maintainerPayoutAddress: MAINTAINER }),
          installation: fakeInstallation(),
        },
      ],
      bounties: [fakeBounty({ status: "settled" })],
      claims: [
        fakeClaim({
          id: "timed-out",
          status: "expired",
          stakeStatus: "held",
          stakePaymentId: "pay-1",
        }),
        fakeClaim({
          id: "raced",
          githubLogin: "second",
          status: "lost",
          stakeStatus: "held",
          stakePaymentId: "pay-2",
        }),
        fakeClaim({
          id: "working",
          githubLogin: "third",
          stakeStatus: "held",
          stakePaymentId: "pay-3",
        }),
      ],
      payments: [
        payment("pay-1", "0xaaaa"),
        payment("pay-2", "0xbbbb"),
        payment("pay-3", "0xcccc"),
      ],
    });
    const { wallets, transfer } = treasury();

    const result = await sweepStakes({ store, env, wallets });

    expect(result).toEqual({ held: 2, resolved: 2 });
    const destinations = transfer.mock.calls.map(
      (call) => (call as unknown as [{ destinationAddress: string }])[0].destinationAddress,
    );
    expect(destinations.sort()).toEqual([MAINTAINER, "0xbbbb"].sort());
    expect(store.claims.find((claim) => claim.id === "timed-out")?.stakeStatus).toBe(
      "forwarded_to_maintainer",
    );
    expect(store.claims.find((claim) => claim.id === "raced")?.stakeStatus).toBe("refunded");
    // Still working: nothing to give back yet.
    expect(store.claims.find((claim) => claim.id === "working")?.stakeStatus).toBe("held");
  });

  it("leaves a stake held when the treasury cannot pay it", async () => {
    const store = createFakeStore({
      repos: [
        {
          repo: fakeRepo({ maintainerPayoutAddress: MAINTAINER }),
          installation: fakeInstallation(),
        },
      ],
      bounties: [fakeBounty({ status: "settled" })],
      claims: [fakeClaim({ status: "expired", stakeStatus: "held", stakePaymentId: "pay-1" })],
      payments: [payment("pay-1", "0xaaaa")],
    });
    const wallets = {
      transfer: vi.fn(async () => {
        throw new Error("treasury out of gas");
      }),
      waitForTransaction: vi.fn(),
    } as unknown as CircleWallets;

    const result = await sweepStakes({ store, env, wallets });

    expect(result).toEqual({ held: 1, resolved: 0 });
    expect(store.claims[0]?.stakeStatus).toBe("held");
  });
});
