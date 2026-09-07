import { readDeliveryHeaders, verifyGitHubSignature } from "@proofwork/github";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { apiError } from "../http";

/**
 * Receiving a GitHub delivery: verify, write it down, then act on it — in that order.
 *
 * The store is an interface rather than the database itself so this can be tested for
 * what it guarantees (nothing unsigned gets through, nothing runs twice) without a
 * network. The handler is invoked after the delivery is durable, so a crash mid-handling
 * leaves a record to replay instead of a lost event.
 */

export interface DeliveryRecord {
  id: string;
  alreadyProcessed: boolean;
}

export interface WebhookStore {
  record(input: { deliveryId: string; event: string; payload: unknown }): Promise<DeliveryRecord>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export type GitHubEventHandler = (event: string, payload: unknown) => Promise<void>;

export interface ReceiveOptions {
  secret: string;
  store: WebhookStore;
  /** Runs once the delivery is stored. Without it, deliveries are recorded and acknowledged. */
  handle?: GitHubEventHandler;
}

export interface WebhookOutcome {
  status: ContentfulStatusCode;
  body: unknown;
}

export async function receiveGitHubWebhook(
  request: Request,
  options: ReceiveOptions,
): Promise<WebhookOutcome> {
  const headers = readDeliveryHeaders(request.headers);
  if (!headers) {
    return {
      status: 400,
      body: apiError("bad_delivery", "missing GitHub delivery, event or signature header"),
    };
  }

  // The raw text, not a parsed body: re-serialising JSON changes the bytes being signed.
  const rawBody = await request.text();
  if (!(await verifyGitHubSignature(options.secret, rawBody, headers.signature))) {
    return { status: 401, body: apiError("invalid_signature", "signature does not match") };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: apiError("bad_delivery", "body is not valid JSON") };
  }

  const record = await options.store.record({
    deliveryId: headers.deliveryId,
    event: headers.event,
    payload,
  });

  if (record.alreadyProcessed) {
    return { status: 200, body: { ok: true, event: headers.event, duplicate: true } };
  }

  if (!options.handle) {
    return { status: 200, body: { ok: true, event: headers.event, handled: false } };
  }

  try {
    await options.handle(headers.event, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("github webhook failed", {
      deliveryId: headers.deliveryId,
      event: headers.event,
      message,
    });
    await options.store.markFailed(record.id, message);
    // A 5xx tells GitHub to redeliver, and an unprocessed record accepts the retry.
    return { status: 500, body: apiError("handler_failed", message) };
  }

  await options.store.markProcessed(record.id);
  return { status: 200, body: { ok: true, event: headers.event, handled: true } };
}
