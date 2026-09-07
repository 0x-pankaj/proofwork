import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { webhookEvents } from "../schema";

/**
 * Webhook deliveries are written down before anything acts on them, so a delivery that
 * crashes mid-handling is still on record and can be replayed.
 */

export type WebhookSource = "github" | "circle";

export interface RecordedDelivery {
  id: string;
  /** True when this exact delivery has already been handled successfully. */
  alreadyProcessed: boolean;
}

export interface DeliveryInput {
  source: WebhookSource;
  deliveryId: string;
  event: string;
  payload: unknown;
}

/**
 * Stores a delivery, or recognises one we have seen before.
 *
 * A delivery that was stored but never processed — the isolate died, the database was
 * briefly unreachable — comes back as `alreadyProcessed: false`, so a provider retry is
 * a second chance rather than a silent no-op. Only a delivery we finished is skipped.
 */
export async function recordWebhookDelivery(
  db: Database,
  input: DeliveryInput,
): Promise<RecordedDelivery> {
  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      source: input.source,
      deliveryId: input.deliveryId,
      event: input.event,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.deliveryId] })
    .returning({ id: webhookEvents.id });

  if (inserted) return { id: inserted.id, alreadyProcessed: false };

  const [existing] = await db
    .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.source, input.source), eq(webhookEvents.deliveryId, input.deliveryId)),
    )
    .limit(1);

  if (!existing) {
    throw new Error(`webhook delivery ${input.source}/${input.deliveryId} vanished after insert`);
  }
  return { id: existing.id, alreadyProcessed: existing.processedAt !== null };
}

/** Marks a delivery handled. Nothing reprocesses it after this. */
export async function markWebhookProcessed(db: Database, id: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: null })
    .where(eq(webhookEvents.id, id));
}

/** Records why a delivery failed, leaving it eligible for a retry. */
export async function markWebhookFailed(db: Database, id: string, error: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ error: error.slice(0, 2000), processedAt: null })
    .where(eq(webhookEvents.id, id));
}
