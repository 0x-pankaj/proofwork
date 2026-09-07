import { sign } from "@octokit/webhooks-methods";
import { describe, expect, it, vi } from "vitest";
import { receiveGitHubWebhook, type WebhookStore } from "./github";

const SECRET = "webhook-secret";

function fakeStore(overrides: Partial<WebhookStore> = {}) {
  const recorded: Array<{ deliveryId: string; event: string; payload: unknown }> = [];
  const processed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const store: WebhookStore = {
    record: async (input) => {
      recorded.push(input);
      return { id: "row-1", alreadyProcessed: false };
    },
    markProcessed: async (id) => {
      processed.push(id);
    },
    markFailed: async (id, error) => {
      failed.push({ id, error });
    },
    ...overrides,
  };
  return { store, recorded, processed, failed };
}

async function delivery(body: string, headers: Record<string, string> = {}) {
  return new Request("https://api.proofwork.dev/webhooks/github", {
    method: "POST",
    headers: {
      "x-github-delivery": "d-1",
      "x-github-event": "issue_comment",
      "x-hub-signature-256": await sign(SECRET, body),
      ...headers,
    },
    body,
  });
}

const BODY = JSON.stringify({ action: "created" });

describe("receiveGitHubWebhook", () => {
  it("stores and acknowledges a signed delivery", async () => {
    const { store, recorded, processed } = fakeStore();
    const handle = vi.fn(async () => {});

    const outcome = await receiveGitHubWebhook(await delivery(BODY), {
      secret: SECRET,
      store,
      handle,
    });

    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ ok: true, event: "issue_comment", handled: true });
    expect(recorded).toEqual([
      { deliveryId: "d-1", event: "issue_comment", payload: { action: "created" } },
    ]);
    expect(handle).toHaveBeenCalledWith("issue_comment", { action: "created" });
    expect(processed).toEqual(["row-1"]);
  });

  it("rejects an unsigned delivery without touching the store", async () => {
    const { store, recorded } = fakeStore();
    const request = await delivery(BODY, { "x-hub-signature-256": "sha256=deadbeef" });

    const outcome = await receiveGitHubWebhook(request, { secret: SECRET, store });

    expect(outcome.status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it("rejects a body that was altered after signing", async () => {
    const { store, recorded } = fakeStore();
    const request = new Request("https://api.proofwork.dev/webhooks/github", {
      method: "POST",
      headers: {
        "x-github-delivery": "d-1",
        "x-github-event": "issue_comment",
        "x-hub-signature-256": await sign(SECRET, BODY),
      },
      body: JSON.stringify({ action: "deleted" }),
    });

    const outcome = await receiveGitHubWebhook(request, { secret: SECRET, store });

    expect(outcome.status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it("rejects a request that is missing the delivery headers", async () => {
    const { store } = fakeStore();
    const request = new Request("https://api.proofwork.dev/webhooks/github", {
      method: "POST",
      body: BODY,
    });

    const outcome = await receiveGitHubWebhook(request, { secret: SECRET, store });

    expect(outcome.status).toBe(400);
  });

  it("does not run a handler twice for the same delivery", async () => {
    const { store } = fakeStore({
      record: async () => ({ id: "row-1", alreadyProcessed: true }),
    });
    const handle = vi.fn(async () => {});

    const outcome = await receiveGitHubWebhook(await delivery(BODY), {
      secret: SECRET,
      store,
      handle,
    });

    expect(outcome.body).toEqual({ ok: true, event: "issue_comment", duplicate: true });
    expect(handle).not.toHaveBeenCalled();
  });

  it("records a handler failure and asks GitHub to redeliver", async () => {
    const { store, failed, processed } = fakeStore();

    const outcome = await receiveGitHubWebhook(await delivery(BODY), {
      secret: SECRET,
      store,
      handle: async () => {
        throw new Error("neon is down");
      },
    });

    expect(outcome.status).toBe(500);
    expect(failed).toEqual([{ id: "row-1", error: "neon is down" }]);
    expect(processed).toEqual([]);
  });

  it("stores a delivery it has no handler for", async () => {
    const { store, recorded, processed } = fakeStore();

    const outcome = await receiveGitHubWebhook(await delivery(BODY), { secret: SECRET, store });

    expect(outcome.body).toEqual({ ok: true, event: "issue_comment", handled: false });
    expect(recorded).toHaveLength(1);
    expect(processed).toEqual([]);
  });
});
