import { redis } from "@/lib/cache/redis";

/**
 * Token Refresh Status
 *
 * Manages per-target refresh status using Redis hashes.
 * Each target gets a hash at `krawall:refresh-status:{targetId}`
 * tracking its refresh lifecycle.
 */

const STATUS_PREFIX = "krawall:refresh-status:";

// ---------- types ----------

export interface RefreshStatusData {
  /** ISO timestamp of the last refresh attempt */
  lastRefreshAt: string | null;
  /** Outcome of the last refresh */
  lastRefreshStatus: "success" | "failed" | null;
  /** Error message from the last failed refresh */
  lastRefreshError: string | null;
  /** Number of consecutive failures (reset on success) */
  consecutiveFailures: number;
  /** ISO timestamp of the next scheduled refresh */
  nextRefreshAt: string | null;
  /** Current refresh interval in milliseconds */
  refreshIntervalMs: number | null;
  /** Whether this target has an active refresh schedule */
  isActive: boolean;
}

// ---------- class ----------

export class TokenRefreshStatus {
  /**
   * Get the refresh status for a target.
   *
   * @param targetId - The target to query
   * @returns Status data, or defaults if no status exists
   */
  static async getStatus(targetId: string): Promise<RefreshStatusData> {
    const key = `${STATUS_PREFIX}${targetId}`;
    const raw = await redis.hgetall(key);

    if (!raw || Object.keys(raw).length === 0) {
      return {
        lastRefreshAt: null,
        lastRefreshStatus: null,
        lastRefreshError: null,
        consecutiveFailures: 0,
        nextRefreshAt: null,
        refreshIntervalMs: null,
        isActive: false,
      };
    }

    return {
      lastRefreshAt: raw.lastRefreshAt || null,
      lastRefreshStatus: (raw.lastRefreshStatus as "success" | "failed") || null,
      lastRefreshError: raw.lastRefreshError || null,
      consecutiveFailures: parseInt(raw.consecutiveFailures || "0", 10),
      nextRefreshAt: raw.nextRefreshAt || null,
      refreshIntervalMs: raw.refreshIntervalMs
        ? parseInt(raw.refreshIntervalMs, 10)
        : null,
      isActive: raw.isActive === "true",
    };
  }

  /**
   * Update the refresh status for a target.
   * Only provided fields are updated; others are left unchanged.
   *
   * @param targetId - The target to update
   * @param data - Partial status fields to set
   */
  static async setStatus(
    targetId: string,
    data: Partial<RefreshStatusData>
  ): Promise<void> {
    const key = `${STATUS_PREFIX}${targetId}`;
    const fields: Record<string, string> = {};

    if (data.lastRefreshAt !== undefined) {
      fields.lastRefreshAt = data.lastRefreshAt ?? "";
    }
    if (data.lastRefreshStatus !== undefined) {
      fields.lastRefreshStatus = data.lastRefreshStatus ?? "";
    }
    if (data.lastRefreshError !== undefined) {
      fields.lastRefreshError = data.lastRefreshError ?? "";
    }
    if (data.consecutiveFailures !== undefined) {
      fields.consecutiveFailures = String(data.consecutiveFailures);
    }
    if (data.nextRefreshAt !== undefined) {
      fields.nextRefreshAt = data.nextRefreshAt ?? "";
    }
    if (data.refreshIntervalMs !== undefined) {
      fields.refreshIntervalMs = data.refreshIntervalMs
        ? String(data.refreshIntervalMs)
        : "";
    }
    if (data.isActive !== undefined) {
      fields.isActive = data.isActive ? "true" : "false";
    }

    if (Object.keys(fields).length > 0) {
      await redis.hset(key, fields);
    }
  }

  /**
   * Remove all refresh status data for a target.
   *
   * @param targetId - The target to clear
   */
  static async clearStatus(targetId: string): Promise<void> {
    const key = `${STATUS_PREFIX}${targetId}`;
    await redis.del(key);
  }
}
