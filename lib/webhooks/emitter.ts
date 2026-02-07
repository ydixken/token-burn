import crypto from "crypto";
import { prisma } from "@/lib/db/client";
import { decrypt } from "@/lib/utils/crypto";
import { enqueueWebhookDelivery } from "./delivery";

/**
 * Emit a webhook event to all active webhooks subscribed to that event.
 *
 * Queries the database for active webhooks matching the event type,
 * creates WebhookDelivery records, and enqueues BullMQ jobs for
 * reliable delivery with retries.
 *
 * @param event - Event type (e.g. "session.completed", "session.failed")
 * @param payload - Event payload data
 */
export async function emitWebhookEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Find all active webhooks subscribed to this event
    const webhooks = await prisma.webhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    console.log(
      `Emitting webhook event "${event}" to ${webhooks.length} subscriber(s)`
    );

    for (const webhook of webhooks) {
      const deliveryId = crypto.randomUUID();

      // Decrypt the webhook secret
      let secret: string;
      try {
        secret = decrypt(webhook.secret);
      } catch (error) {
        console.error(
          `Failed to decrypt secret for webhook ${webhook.id}:`,
          error
        );
        // Record a failed delivery
        await prisma.webhookDelivery.create({
          data: {
            id: deliveryId,
            webhookId: webhook.id,
            event,
            payload: payload as any,
            status: "FAILED",
            attempts: 0,
            error: "Failed to decrypt webhook secret",
          },
        });
        continue;
      }

      // Create a delivery record in PENDING state
      await prisma.webhookDelivery.create({
        data: {
          id: deliveryId,
          webhookId: webhook.id,
          event,
          payload: payload as any,
          status: "PENDING",
        },
      });

      // Enqueue the delivery job
      try {
        await enqueueWebhookDelivery({
          deliveryId,
          webhookId: webhook.id,
          url: webhook.url,
          secret,
          event,
          payload,
        });
      } catch (error) {
        console.error(
          `Failed to enqueue delivery ${deliveryId} for webhook ${webhook.id}:`,
          error
        );
        // Update delivery record as FAILED
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "FAILED",
            error: `Failed to enqueue: ${(error as Error).message}`,
          },
        });
      }
    }
  } catch (error) {
    // Log but don't throw - webhook emission must never break session execution
    console.error(`Failed to emit webhook event "${event}":`, error);
  }
}
