import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockQueueAdd,
  mockQueueGetRepeatableJobs,
  mockQueueRemoveRepeatableByKey,
  mockQueueClose,
  mockQueueGetWaitingCount,
  mockQueueGetActiveCount,
  mockQueueGetCompletedCount,
  mockQueueGetFailedCount,
  mockRedisHgetall,
  mockRedisHset,
  mockRedisDel,
  mockRedisPublish,
} = vi.hoisted(() => {
  return {
    mockQueueAdd: vi.fn().mockResolvedValue({ id: "job-1", name: "refresh" }),
    mockQueueGetRepeatableJobs: vi.fn().mockResolvedValue([]),
    mockQueueRemoveRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    mockQueueClose: vi.fn().mockResolvedValue(undefined),
    mockQueueGetWaitingCount: vi.fn().mockResolvedValue(0),
    mockQueueGetActiveCount: vi.fn().mockResolvedValue(0),
    mockQueueGetCompletedCount: vi.fn().mockResolvedValue(0),
    mockQueueGetFailedCount: vi.fn().mockResolvedValue(0),
    mockRedisHgetall: vi.fn().mockResolvedValue({}),
    mockRedisHset: vi.fn().mockResolvedValue(1),
    mockRedisDel: vi.fn().mockResolvedValue(1),
    mockRedisPublish: vi.fn().mockResolvedValue(1),
  };
});

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
    getRepeatableJobs: mockQueueGetRepeatableJobs,
    removeRepeatableByKey: mockQueueRemoveRepeatableByKey,
    getWaitingCount: mockQueueGetWaitingCount,
    getActiveCount: mockQueueGetActiveCount,
    getCompletedCount: mockQueueGetCompletedCount,
    getFailedCount: mockQueueGetFailedCount,
  })),
}));

vi.mock("@/lib/cache/redis", () => ({
  redis: {
    hgetall: mockRedisHgetall,
    hset: mockRedisHset,
    del: mockRedisDel,
    publish: mockRedisPublish,
    duplicate: vi.fn().mockReturnValue({
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import SUTs after mocks
// ---------------------------------------------------------------------------

import { TokenRefreshScheduler } from "@/lib/jobs/token-refresh/scheduler";
import { TokenRefreshStatus } from "@/lib/jobs/token-refresh/status";
import {
  addTokenRefreshJob,
  getTokenRefreshQueueStats,
} from "@/lib/jobs/token-refresh/queue";
import { publishTokenRefreshed } from "@/lib/jobs/token-refresh/events";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Token Refresh Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Schedule → Queue → Status flow
  // =========================================================================

  describe("schedule → queue → status flow", () => {
    it("should schedule a refresh, add job to queue, and update status", async () => {
      const config: BrowserWebSocketProtocolConfig = {
        pageUrl: "https://test.com/chat",
        widgetDetection: { strategy: "heuristic" },
        session: { maxAge: 200_000 },
      };

      // Schedule a refresh
      await TokenRefreshScheduler.schedule("target-1", config);

      // Verify job was added to queue with correct parameters
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "refresh",
        expect.objectContaining({
          targetId: "target-1",
          maxAge: 200_000,
          refreshAheadPercent: 0.75,
          triggeredBy: "scheduled",
        }),
        expect.objectContaining({
          jobId: "refresh:target-1",
          repeat: { every: 150_000 }, // 200_000 * 0.75
        })
      );

      // Verify status was updated
      expect(mockRedisHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        expect.objectContaining({
          isActive: "true",
          refreshIntervalMs: "150000",
        })
      );
    });
  });

  // =========================================================================
  // Cancel flow
  // =========================================================================

  describe("cancel flow", () => {
    it("should cancel a scheduled refresh and clear status", async () => {
      mockQueueGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "repeat-key-1" },
      ]);

      await TokenRefreshScheduler.cancel("target-1");

      // Verify repeatable job was removed
      expect(mockQueueRemoveRepeatableByKey).toHaveBeenCalledWith("repeat-key-1");

      // Verify status was cleared
      expect(mockRedisDel).toHaveBeenCalledWith("krawall:refresh-status:target-1");
    });
  });

  // =========================================================================
  // Force refresh flow
  // =========================================================================

  describe("force refresh flow", () => {
    it("should enqueue a one-off manual refresh job", async () => {
      await TokenRefreshScheduler.forceRefresh("target-1");

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "refresh",
        expect.objectContaining({
          targetId: "target-1",
          triggeredBy: "manual",
          forceFresh: true,
        }),
        expect.objectContaining({
          jobId: expect.stringContaining("refresh:target-1:manual:"),
        })
      );
    });
  });

  // =========================================================================
  // Status lifecycle
  // =========================================================================

  describe("status lifecycle", () => {
    it("should set and retrieve status", async () => {
      // Set status
      await TokenRefreshStatus.setStatus("target-1", {
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "success",
        consecutiveFailures: 0,
        isActive: true,
      });

      expect(mockRedisHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        expect.objectContaining({
          lastRefreshAt: "2026-01-15T10:00:00.000Z",
          lastRefreshStatus: "success",
          consecutiveFailures: "0",
          isActive: "true",
        })
      );

      // Get status (mock the return)
      mockRedisHgetall.mockResolvedValueOnce({
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "success",
        consecutiveFailures: "0",
        isActive: "true",
        refreshIntervalMs: "225000",
      });

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status.lastRefreshStatus).toBe("success");
      expect(status.consecutiveFailures).toBe(0);
      expect(status.isActive).toBe(true);
      expect(status.refreshIntervalMs).toBe(225000);
    });

    it("should clear status completely", async () => {
      await TokenRefreshStatus.clearStatus("target-1");

      expect(mockRedisDel).toHaveBeenCalledWith("krawall:refresh-status:target-1");
    });
  });

  // =========================================================================
  // Queue stats
  // =========================================================================

  describe("queue stats", () => {
    it("should return aggregated queue statistics", async () => {
      mockQueueGetWaitingCount.mockResolvedValueOnce(5);
      mockQueueGetActiveCount.mockResolvedValueOnce(2);
      mockQueueGetCompletedCount.mockResolvedValueOnce(100);
      mockQueueGetFailedCount.mockResolvedValueOnce(3);

      const stats = await getTokenRefreshQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        total: 7,
      });
    });
  });

  // =========================================================================
  // Event publishing
  // =========================================================================

  describe("event publishing", () => {
    it("should publish token-refreshed event to Redis Pub/Sub", async () => {
      await publishTokenRefreshed("target-1", "scheduled");

      expect(mockRedisPublish).toHaveBeenCalledWith(
        "krawall:token-refreshed",
        expect.stringContaining("target-1")
      );

      const publishedJson = mockRedisPublish.mock.calls[0][1];
      const parsed = JSON.parse(publishedJson);

      expect(parsed.targetId).toBe("target-1");
      expect(parsed.triggeredBy).toBe("scheduled");
      expect(parsed.timestamp).toBeDefined();
    });
  });

  // =========================================================================
  // Schedule → isScheduled → cancel roundtrip
  // =========================================================================

  describe("schedule → isScheduled → cancel roundtrip", () => {
    it("should confirm scheduled state after schedule and clear after cancel", async () => {
      const config: BrowserWebSocketProtocolConfig = {
        pageUrl: "https://test.com/chat",
        widgetDetection: { strategy: "heuristic" },
        session: { maxAge: 300_000 },
      };

      // Schedule
      await TokenRefreshScheduler.schedule("target-1", config);
      expect(mockQueueAdd).toHaveBeenCalled();

      // isScheduled (mock repeatable jobs exist)
      mockQueueGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
      ]);
      const isScheduled = await TokenRefreshScheduler.isScheduled("target-1");
      expect(isScheduled).toBe(true);

      // Cancel
      mockQueueGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
      ]);
      await TokenRefreshScheduler.cancel("target-1");
      expect(mockQueueRemoveRepeatableByKey).toHaveBeenCalledWith("key-1");
      expect(mockRedisDel).toHaveBeenCalledWith("krawall:refresh-status:target-1");

      // isScheduled (no more repeatable jobs)
      mockQueueGetRepeatableJobs.mockResolvedValueOnce([]);
      const isStillScheduled = await TokenRefreshScheduler.isScheduled("target-1");
      expect(isStillScheduled).toBe(false);
    });
  });
});
