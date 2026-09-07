import {
  type Database,
  markWebhookFailed,
  markWebhookProcessed,
  recordWebhookDelivery,
  type WebhookSource,
} from "@proofwork/db";
import type { WebhookStore } from "./github";

/** The durable store behind the webhook pipeline. */
export function databaseWebhookStore(db: Database, source: WebhookSource): WebhookStore {
  return {
    record: (input) => recordWebhookDelivery(db, { source, ...input }),
    markProcessed: (id) => markWebhookProcessed(db, id),
    markFailed: (id, error) => markWebhookFailed(db, id, error),
  };
}
