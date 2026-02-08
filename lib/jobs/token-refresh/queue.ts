import { Queue } from "bullmq";
import { redis } from "@/lib/cache/redis";

/**
 * Token Refresh Queue
 *
 * BullMQ queue for background token/session refresh jobs.
 * Used by the scheduler to enqueue periodic re-discovery of
 * browser-based WebSocket targets (cookies, tokens, WS URLs).
 */

// ---------- types ----------

export interface TokenRefreshJobData {
  /** Target ID to refresh */
  targetId: string;
  /** Session maxAge in milliseconds */
  maxAge: number;
  /** Fraction of maxAge at which to refresh (0.0–1.0, default 0.75) */
  refreshAheadPercent: number;
  /** If true, bypass cache and force a fresh discovery */
  forceFresh: boolean;
  /** What triggered this refresh */
  triggeredBy: "scheduled" | "manual" | "auto-start";
}

// ---------- queue ----------

export const tokenRefreshQueue = new Queue<TokenRefreshJobData>(
  "token-refresh",
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000, // 5s, 10s, 20s, 40s, 80s
      },
      removeOnComplete: {
        count: 50, // Keep last 50 completed jobs
        age: 12 * 3600, // Keep for 12 hours
      },
      removeOnFail: {
        count: 200, // Keep last 200 failed jobs
        age: 3 * 24 * 3600, // Keep for 3 days
      },
    },
  }
);

// ---------- helpers ----------

/**
 * Enqueue a token refresh job.
 *
 * @param data - Token refresh job data
 * @param options - Optional BullMQ job options (e.g. jobId, repeat)
 * @returns The created BullMQ job
 */
export async function addTokenRefreshJob(
  data: TokenRefreshJobData,
  options?: { jobId?: string; repeat?: { every: number } }
) {
  return tokenRefreshQueue.add("refresh", data, options);
}

/**
 * Get current queue statistics.
 */
export async function getTokenRefreshQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    tokenRefreshQueue.getWaitingCount(),
    tokenRefreshQueue.getActiveCount(),
    tokenRefreshQueue.getCompletedCount(),
    tokenRefreshQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active,
  };
}

/**
 * Gracefully close the token refresh queue.
 */
export async function closeTokenRefreshQueue() {
  await tokenRefreshQueue.close();
}
