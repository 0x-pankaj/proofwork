import { describe, expect, it } from "vitest";
import { sweepExpiries } from "./cron";
import type { Env } from "./env";
import { createFakeStore, fakeBounty, fakeClaim, fakeInstallation, fakeRepo } from "./store.fake";

const env = { ARC_NETWORK: "testnet" } as unknown as Env;

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
    expect(store.claims[0]).toMatchObject({
      status: "expired",
      stakeStatus: "forwarded_to_maintainer",
    });
    expect(store.claims[1]?.status).toBe("active");
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
