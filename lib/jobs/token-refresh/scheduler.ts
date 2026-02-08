import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";
import {
  tokenRefreshQueue,
  addTokenRefreshJob,
  type TokenRefreshJobData,
} from "./queue";
import { TokenRefreshStatus } from "./status";

/**
 * Token Refresh Scheduler
 *
 * Manages BullMQ repeatable jobs for periodic token/session refresh.
 * Each target gets a repeatable job whose interval is derived from
 * `maxAge * refreshAheadPercent` (defaults: 300 000 ms * 0.75 = 225 s).
 *
 * Singleton — import and call static methods directly.
 */

const DEFAULT_MAX_AGE = 300_000; // 5 minutes
const DEFAULT_REFRESH_AHEAD_PERCENT = 0.75;

export class TokenRefreshScheduler {
  /**
   * Schedule a repeatable token refresh for a target.
   *
   * Computes the refresh interval from the protocol config's session settings
   * and creates a BullMQ repeatable job.
   *
   * @param targetId - Target to schedule
   * @param protocolConfig - Browser WS protocol config (session settings)
   */
  static async schedule(
    targetId: string,
    protocolConfig: BrowserWebSocketProtocolConfig
  ): Promise<void> {
    const maxAge = protocolConfig.session?.maxAge ?? DEFAULT_MAX_AGE;
    const sessionConfig = protocolConfig.session as
      | (typeof protocolConfig.session & { refreshAheadPercent?: number })
      | undefined;
    const refreshAheadPercent =
      sessionConfig?.refreshAheadPercent ?? DEFAULT_REFRESH_AHEAD_PERCENT;

    const refreshInterval = Math.floor(maxAge * refreshAheadPercent);

    const jobData: TokenRefreshJobData = {
      targetId,
      maxAge,
      refreshAheadPercent,
      forceFresh: true,
      triggeredBy: "scheduled",
    };

    await addTokenRefreshJob(jobData, {
      jobId: `refresh:${targetId}`,
      repeat: { every: refreshInterval },
    });

    // Update status hash
    const nextRefreshAt = new Date(Date.now() + refreshInterval).toISOString();
    await TokenRefreshStatus.setStatus(targetId, {
      isActive: true,
      refreshIntervalMs: refreshInterval,
      nextRefreshAt,
    });

    console.log(
      `Token refresh scheduled for target ${targetId}: every ${refreshInterval}ms (maxAge=${maxAge}ms, ahead=${refreshAheadPercent})`
    );
  }

  /**
   * Cancel the repeatable refresh schedule for a target.
   *
   * @param targetId - Target to cancel
   */
  static async cancel(targetId: string): Promise<void> {
    const repeatableJobs = await tokenRefreshQueue.getRepeatableJobs();
    const matching = repeatableJobs.find(
      (job) => job.id === `refresh:${targetId}`
    );

    if (matching) {
      await tokenRefreshQueue.removeRepeatableByKey(matching.key);
      console.log(`Token refresh cancelled for target ${targetId}`);
    }

    await TokenRefreshStatus.clearStatus(targetId);
  }

  /**
   * Trigger an immediate one-off refresh for a target.
   *
   * @param targetId - Target to refresh now
   */
  static async forceRefresh(targetId: string): Promise<void> {
    const jobData: TokenRefreshJobData = {
      targetId,
      maxAge: DEFAULT_MAX_AGE,
      refreshAheadPercent: DEFAULT_REFRESH_AHEAD_PERCENT,
      forceFresh: true,
      triggeredBy: "manual",
    };

    const timestamp = Date.now();
    await addTokenRefreshJob(jobData, {
      jobId: `refresh:${targetId}:manual:${timestamp}`,
    });

    console.log(`Forced token refresh enqueued for target ${targetId}`);
  }

  /**
   * Check if a target has an active repeatable refresh schedule.
   *
   * @param targetId - Target to check
   * @returns true if a repeatable job exists for this target
   */
  static async isScheduled(targetId: string): Promise<boolean> {
    const repeatableJobs = await tokenRefreshQueue.getRepeatableJobs();
    return repeatableJobs.some((job) => job.id === `refresh:${targetId}`);
  }

  /**
   * List all target IDs with active repeatable refresh schedules.
   *
   * @returns Array of target IDs
   */
  static async getScheduledTargets(): Promise<string[]> {
    const repeatableJobs = await tokenRefreshQueue.getRepeatableJobs();

    return repeatableJobs
      .filter((job) => job.id?.startsWith("refresh:"))
      .map((job) => job.id!.replace("refresh:", ""))
      .filter((id) => !id.includes(":manual:"));
  }
}
