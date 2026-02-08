import { Worker, Job } from "bullmq";
import { redis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/client";
import { BrowserDiscoveryService } from "@/lib/connectors/browser/discovery-service";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";
import type { TokenRefreshJobData } from "@/lib/jobs/token-refresh/queue";
import { TokenRefreshStatus } from "@/lib/jobs/token-refresh/status";
import { publishTokenRefreshed } from "@/lib/jobs/token-refresh/events";
import { randomUUID } from "crypto";

/**
 * Token Refresh Worker
 *
 * BullMQ worker that processes token refresh jobs:
 * 1. Acquires a distributed lock (SETNX) to prevent concurrent refreshes
 * 2. Pre-checks cache age — skips if recently refreshed
 * 3. Runs browser discovery with forceFresh to get new credentials
 * 4. Writes the result to the discovery cache
 * 5. Publishes a token-refreshed event via Redis Pub/Sub
 * 6. Updates the refresh status hash
 * 7. Releases the lock in a finally block
 */

const LOCK_PREFIX = "krawall:refresh-lock:";
const CACHE_PREFIX = "krawall:discovery:";
const LOCK_TTL_MS = 120_000; // 2 minutes
const SKIP_IF_REFRESHED_WITHIN_MS = 30_000; // 30 seconds
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Create a token refresh worker.
 *
 * @param concurrency - Number of concurrent refresh jobs (default: 2)
 * @returns The BullMQ worker instance
 */
export function createTokenRefreshWorker(
  concurrency: number = 2
): Worker<TokenRefreshJobData, void> {
  const workerId = randomUUID();

  const worker = new Worker<TokenRefreshJobData, void>(
    "token-refresh",
    async (job: Job<TokenRefreshJobData>): Promise<void> => {
      const { targetId, maxAge, triggeredBy } = job.data;
      const lockKey = `${LOCK_PREFIX}${targetId}`;

      // 1. Acquire distributed lock
      const lockAcquired = await redis.set(
        lockKey,
        workerId,
        "PX",
        LOCK_TTL_MS,
        "NX"
      );

      if (!lockAcquired) {
        console.log(
          `Token refresh skipped for ${targetId}: lock held by another worker`
        );
        return;
      }

      try {
        // 2. Pre-check: skip if recently refreshed
        const cachedRaw = await redis.get(`${CACHE_PREFIX}${targetId}`);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            const discoveredAt = new Date(cached.discoveredAt).getTime();
            const age = Date.now() - discoveredAt;

            if (age < SKIP_IF_REFRESHED_WITHIN_MS) {
              console.log(
                `Token refresh skipped for ${targetId}: refreshed ${age}ms ago (< ${SKIP_IF_REFRESHED_WITHIN_MS}ms)`
              );
              return;
            }
          } catch {
            // Cache parse error — proceed with refresh
          }
        }

        // 3. Load target config from database
        const target = await prisma.target.findUnique({
          where: { id: targetId },
        });

        if (!target) {
          throw new Error(`Target ${targetId} not found in database`);
        }

        const protocolConfig =
          target.protocolConfig as unknown as BrowserWebSocketProtocolConfig;

        if (!protocolConfig?.pageUrl) {
          throw new Error(
            `Target ${targetId} has no valid BrowserWebSocketProtocolConfig`
          );
        }

        // 4. Run discovery with forceFresh
        console.log(`Token refresh starting for ${targetId} (${triggeredBy})`);

        // Clear cache first to force a fresh discovery
        await redis.del(`${CACHE_PREFIX}${targetId}`);

        const result = await BrowserDiscoveryService.discover({
          config: protocolConfig,
          targetId,
        });

        // 5. Write result to cache with maxAge TTL
        await BrowserDiscoveryService.setCached(targetId, result, maxAge);

        // 6. Publish token-refreshed event
        await publishTokenRefreshed(targetId, triggeredBy);

        // 7. Update status — success
        await TokenRefreshStatus.setStatus(targetId, {
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: "success",
          lastRefreshError: null,
          consecutiveFailures: 0,
        });

        console.log(`Token refresh completed for ${targetId}`);
      } catch (error) {
        // Update status — failure
        const currentStatus = await TokenRefreshStatus.getStatus(targetId);
        const consecutiveFailures = currentStatus.consecutiveFailures + 1;

        await TokenRefreshStatus.setStatus(targetId, {
          lastRefreshAt: new Date().toISOString(),
          lastRefreshStatus: "failed",
          lastRefreshError: (error as Error).message,
          consecutiveFailures,
        });

        // Load max failures threshold from config
        const maxFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES;
        if (consecutiveFailures >= maxFailures) {
          console.warn(
            `Token refresh for ${targetId}: ${consecutiveFailures} consecutive failures ` +
              `(max ${maxFailures}). Refresh may need manual intervention.`
          );
        }

        console.error(
          `Token refresh failed for ${targetId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 5}):`,
          (error as Error).message
        );

        throw error; // Let BullMQ retry
      } finally {
        // 8. Release lock — only if we still hold it
        const currentHolder = await redis.get(lockKey);
        if (currentHolder === workerId) {
          await redis.del(lockKey);
        }
      }
    },
    {
      connection: redis,
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    console.log(`Token refresh job completed: ${job.data.targetId}`);
  });

  worker.on("failed", (job, error) => {
    const attempts = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 5;
    const remaining = maxAttempts - attempts;

    if (remaining > 0) {
      console.warn(
        `Token refresh retry: ${job?.data.targetId} attempt ${attempts}/${maxAttempts} - ${error.message}`
      );
    } else {
      console.error(
        `Token refresh permanently failed: ${job?.data.targetId} - ${error.message}`
      );
    }
  });

  return worker;
}
