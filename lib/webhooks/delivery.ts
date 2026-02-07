import { Queue, Worker, Job } from "bullmq";
import axios from "axios";
import { redis } from "@/lib/cache/redis";
import { buildSignedHeaders } from "./signer";

/**
 * Webhook delivery system using BullMQ.
 *
 * Handles reliable delivery of webhook payloads with:
 * - HMAC-SHA256 signed payloads
 * - Exponential backoff retry (up to 5 attempts)
 * - Dead letter tracking for permanently failed deliveries
 * - Delivery status tracking
 */

// ---------- types ----------

export interface WebhookDeliveryJobData {
  deliveryId: string;
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface DeliveryResult {
  statusCode: number;
  success: boolean;
  error?: string;
  attemptNumber: number;
  deliveredAt: string;
}

// ---------- queue ----------

export const webhookQueue = new Queue<WebhookDeliveryJobData>(
  "webhook-delivery",
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000, // 1s, 2s, 4s, 8s, 16s
      },
      removeOnComplete: {
        count: 200,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 500,
        age: 7 * 24 * 3600, // 7 days
      },
    },
  }
);

// ---------- worker ----------

/**
 * Create a webhook delivery worker.
 *
 * The worker:
 * 1. Serializes the payload to JSON
 * 2. Signs it with HMAC-SHA256 using the webhook secret
 * 3. POSTs to the webhook URL with signed headers
 * 4. Returns success/failure result
 *
 * On failure, BullMQ retries with exponential backoff (1s base, 5 attempts max).
 */
export function createWebhookWorker(
  concurrency: number = 3
): Worker<WebhookDeliveryJobData, DeliveryResult> {
  const worker = new Worker<WebhookDeliveryJobData, DeliveryResult>(
    "webhook-delivery",
    async (job: Job<WebhookDeliveryJobData>): Promise<DeliveryResult> => {
      const { url, secret, event, payload, deliveryId } = job.data;
      const attemptNumber = job.attemptsMade + 1;

      const body = JSON.stringify({
        event,
        payload,
        deliveryId,
        timestamp: new Date().toISOString(),
      });

      const headers = buildSignedHeaders(body, secret);

      try {
        const response = await axios.post(url, body, {
          headers,
          timeout: 10000, // 10s timeout per delivery attempt
          validateStatus: () => true, // Don't throw on non-2xx
        });

        if (response.status >= 200 && response.status < 300) {
          return {
            statusCode: response.status,
            success: true,
            attemptNumber,
            deliveredAt: new Date().toISOString(),
          };
        }

        // Non-2xx response - treat as failure and let BullMQ retry
        const errorMsg = `HTTP ${response.status}: ${typeof response.data === "string" ? response.data.slice(0, 200) : JSON.stringify(response.data).slice(0, 200)}`;
        throw new WebhookDeliveryError(errorMsg, response.status);
      } catch (error) {
        if (error instanceof WebhookDeliveryError) {
          throw error;
        }

        // Network/timeout errors
        const message =
          axios.isAxiosError(error) && error.code === "ECONNABORTED"
            ? "Request timeout (10s)"
            : (error as Error).message;

        throw new WebhookDeliveryError(message);
      }
    },
    {
      connection: redis,
      concurrency,
    }
  );

  worker.on("completed", (job, result) => {
    console.log(
      `Webhook delivered: ${job.data.deliveryId} -> ${job.data.url} (${result.statusCode})`
    );
  });

  worker.on("failed", (job, error) => {
    const attempts = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 5;
    const remaining = maxAttempts - attempts;

    if (remaining > 0) {
      console.warn(
        `Webhook delivery retry: ${job?.data.deliveryId} attempt ${attempts}/${maxAttempts} - ${error.message}`
      );
    } else {
      console.error(
        `Webhook delivery permanently failed: ${job?.data.deliveryId} -> ${job?.data.url} - ${error.message}`
      );
    }
  });

  return worker;
}

// ---------- helper: enqueue delivery ----------

/**
 * Enqueue a webhook delivery job.
 *
 * @param data - Delivery job data
 * @returns The created BullMQ job
 */
export async function enqueueWebhookDelivery(data: WebhookDeliveryJobData) {
  return webhookQueue.add(`deliver:${data.event}`, data, {
    jobId: data.deliveryId, // Idempotent by delivery ID
  });
}

// ---------- helper: close ----------

export async function closeWebhookQueue() {
  await webhookQueue.close();
}

// ---------- error class ----------

export class WebhookDeliveryError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "WebhookDeliveryError";
    this.statusCode = statusCode;
  }
}
