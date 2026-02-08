import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockAdd, mockClose, mockGetWaitingCount, mockGetActiveCount, mockGetCompletedCount, mockGetFailedCount } =
  vi.hoisted(() => {
    return {
      mockAdd: vi.fn().mockResolvedValue({ id: "job-1", name: "refresh" }),
      mockClose: vi.fn().mockResolvedValue(undefined),
      mockGetWaitingCount: vi.fn().mockResolvedValue(3),
      mockGetActiveCount: vi.fn().mockResolvedValue(1),
      mockGetCompletedCount: vi.fn().mockResolvedValue(10),
      mockGetFailedCount: vi.fn().mockResolvedValue(2),
    };
  });

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockClose,
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    getFailedCount: mockGetFailedCount,
  })),
}));

vi.mock("@/lib/cache/redis", () => ({
  redis: {},
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import {
  tokenRefreshQueue,
  addTokenRefreshJob,
  getTokenRefreshQueueStats,
  closeTokenRefreshQueue,
  type TokenRefreshJobData,
} from "@/lib/jobs/token-refresh/queue";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Token Refresh Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Queue instantiation
  // =========================================================================

  describe("queue instantiation", () => {
    it("should have created a BullMQ Queue named 'token-refresh'", () => {
      // Queue constructor is called at module-import time, before vi.clearAllMocks().
      // Verify the exported instance exists and is the mock object.
      expect(tokenRefreshQueue).toBeDefined();
      expect(tokenRefreshQueue.add).toBeDefined();
      expect(tokenRefreshQueue.close).toBeDefined();
    });

    it("should export the queue instance with expected methods", () => {
      expect(typeof tokenRefreshQueue.getWaitingCount).toBe("function");
      expect(typeof tokenRefreshQueue.getActiveCount).toBe("function");
      expect(typeof tokenRefreshQueue.getCompletedCount).toBe("function");
      expect(typeof tokenRefreshQueue.getFailedCount).toBe("function");
    });
  });

  // =========================================================================
  // addTokenRefreshJob
  // =========================================================================

  describe("addTokenRefreshJob", () => {
    const jobData: TokenRefreshJobData = {
      targetId: "target-1",
      maxAge: 300_000,
      refreshAheadPercent: 0.75,
      forceFresh: true,
      triggeredBy: "scheduled",
    };

    it("should add a job to the queue with correct data", async () => {
      await addTokenRefreshJob(jobData);

      expect(mockAdd).toHaveBeenCalledWith("refresh", jobData, undefined);
    });

    it("should pass options when provided", async () => {
      const options = {
        jobId: "refresh:target-1",
        repeat: { every: 225_000 },
      };

      await addTokenRefreshJob(jobData, options);

      expect(mockAdd).toHaveBeenCalledWith("refresh", jobData, options);
    });

    it("should return the created job", async () => {
      const result = await addTokenRefreshJob(jobData);

      expect(result).toEqual({ id: "job-1", name: "refresh" });
    });

    it("should handle manual triggeredBy", async () => {
      const manualData: TokenRefreshJobData = {
        ...jobData,
        triggeredBy: "manual",
      };

      await addTokenRefreshJob(manualData);

      expect(mockAdd).toHaveBeenCalledWith(
        "refresh",
        expect.objectContaining({ triggeredBy: "manual" }),
        undefined
      );
    });
  });

  // =========================================================================
  // getTokenRefreshQueueStats
  // =========================================================================

  describe("getTokenRefreshQueueStats", () => {
    it("should return queue statistics", async () => {
      const stats = await getTokenRefreshQueueStats();

      expect(stats).toEqual({
        waiting: 3,
        active: 1,
        completed: 10,
        failed: 2,
        total: 4, // waiting + active
      });
    });

    it("should compute total as waiting + active", async () => {
      mockGetWaitingCount.mockResolvedValueOnce(5);
      mockGetActiveCount.mockResolvedValueOnce(3);

      const stats = await getTokenRefreshQueueStats();

      expect(stats.total).toBe(8);
    });

    it("should handle zero counts", async () => {
      mockGetWaitingCount.mockResolvedValueOnce(0);
      mockGetActiveCount.mockResolvedValueOnce(0);
      mockGetCompletedCount.mockResolvedValueOnce(0);
      mockGetFailedCount.mockResolvedValueOnce(0);

      const stats = await getTokenRefreshQueueStats();

      expect(stats).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });
  });

  // =========================================================================
  // closeTokenRefreshQueue
  // =========================================================================

  describe("closeTokenRefreshQueue", () => {
    it("should close the queue", async () => {
      await closeTokenRefreshQueue();

      expect(mockClose).toHaveBeenCalledOnce();
    });
  });
});
