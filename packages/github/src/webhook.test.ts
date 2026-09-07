import { sign } from "@octokit/webhooks-methods";
import { describe, expect, it } from "vitest";
import { readDeliveryHeaders, verifyGitHubSignature } from "./webhook";

const SECRET = "a-webhook-secret";
const BODY = JSON.stringify({ action: "opened", number: 12 });

describe("readDeliveryHeaders", () => {
  it("reads a genuine delivery's headers", () => {
    const headers = new Headers({
      "x-github-delivery": "d-1",
      "x-github-event": "pull_request",
      "x-hub-signature-256": "sha256=abc",
    });

    expect(readDeliveryHeaders(headers)).toEqual({
      deliveryId: "d-1",
      event: "pull_request",
      signature: "sha256=abc",
    });
  });

  it("refuses a request missing any of them", () => {
    expect(readDeliveryHeaders(new Headers({ "x-github-event": "push" }))).toBeUndefined();
  });
});

describe("verifyGitHubSignature", () => {
  it("accepts the signature GitHub computes", async () => {
    await expect(verifyGitHubSignature(SECRET, BODY, await sign(SECRET, BODY))).resolves.toBe(true);
  });

  it("rejects a body that changed by one byte", async () => {
    const signature = await sign(SECRET, BODY);

    await expect(verifyGitHubSignature(SECRET, `${BODY} `, signature)).resolves.toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    await expect(
      verifyGitHubSignature(SECRET, BODY, await sign("not-our-secret", BODY)),
    ).resolves.toBe(false);
  });

  it("rejects a malformed or absent signature instead of throwing", async () => {
    await expect(verifyGitHubSignature(SECRET, BODY, "abc")).resolves.toBe(false);
    await expect(verifyGitHubSignature(SECRET, BODY, "sha256=zz")).resolves.toBe(false);
    await expect(verifyGitHubSignature(SECRET, BODY, "")).resolves.toBe(false);
  });

  it("refuses to run without a secret", async () => {
    await expect(verifyGitHubSignature("", BODY, "sha256=abc")).rejects.toThrow(
      /GITHUB_WEBHOOK_SECRET/,
    );
  });
});
