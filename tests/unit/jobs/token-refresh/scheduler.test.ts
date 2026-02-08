import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockAddTokenRefreshJob,
  mockGetRepeatableJobs,
  mockRemoveRepeatableByKey,
  mockSetStatus,
  mockClearStatus,
} = vi.hoisted(() => {
  return {
    mockAddTokenRefreshJob: vi.fn().mockResolvedValue({ id: "job-1" }),
    mockGetRepeatableJobs: vi.fn().mockResolvedValue([]),
    mockRemoveRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    mockSetStatus: vi.fn().mockResolvedValue(undefined),
    mockClearStatus: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/jobs/token-refresh/queue", () => ({
  tokenRefreshQueue: {
    getRepeatableJobs: mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
  },
  addTokenRefreshJob: mockAddTokenRefreshJob,
}));

vi.mock("@/lib/jobs/token-refresh/status", () => ({
  TokenRefreshStatus: {
    setStatus: mockSetStatus,
    clearStatus: mockClearStatus,
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { TokenRefreshScheduler } from "@/lib/jobs/token-refresh/scheduler";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProtocolConfig(
  overrides: Partial<BrowserWebSocketProtocolConfig> = {}
): BrowserWebSocketProtocolConfig {
  return {
    pageUrl: "https://test.com/chat",
    widgetDetection: { strategy: "heuristic" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TokenRefreshScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // schedule
  // =========================================================================

  describe("schedule", () => {
    it("should compute refresh interval as maxAge * refreshAheadPercent", async () => {
      const config = createProtocolConfig({
        session: { maxAge: 300_000 },
      });

      // Add refreshAheadPercent via type cast (extended session config)
      (config.session as Record<string, unknown>).refreshAheadPercent = 0.75;

      await TokenRefreshScheduler.schedule("target-1", config);

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "target-1",
          maxAge: 300_000,
          refreshAheadPercent: 0.75,
          forceFresh: true,
          triggeredBy: "scheduled",
        }),
        expect.objectContaining({
          jobId: "refresh:target-1",
          repeat: { every: 225_000 }, // 300_000 * 0.75
        })
      );
    });

    it("should use default maxAge (300_000) when not specified", async () => {
      const config = createProtocolConfig();

      await TokenRefreshScheduler.schedule("target-1", config);

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.objectContaining({ maxAge: 300_000 }),
        expect.anything()
      );
    });

    it("should use default refreshAheadPercent (0.75) when not specified", async () => {
      const config = createProtocolConfig({
        session: { maxAge: 400_000 },
      });

      await TokenRefreshScheduler.schedule("target-1", config);

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.objectContaining({ refreshAheadPercent: 0.75 }),
        expect.objectContaining({
          repeat: { every: 300_000 }, // 400_000 * 0.75
        })
      );
    });

    it("should create repeatable job with correct jobId", async () => {
      await TokenRefreshScheduler.schedule("my-target", createProtocolConfig());

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ jobId: "refresh:my-target" })
      );
    });

    it("should update status with isActive, refreshIntervalMs, and nextRefreshAt", async () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const config = createProtocolConfig({
        session: { maxAge: 200_000 },
      });

      await TokenRefreshScheduler.schedule("target-1", config);

      const expectedInterval = Math.floor(200_000 * 0.75); // 150_000
      const expectedNextRefresh = new Date(now + expectedInterval).toISOString();

      expect(mockSetStatus).toHaveBeenCalledWith("target-1", {
        isActive: true,
        refreshIntervalMs: expectedInterval,
        nextRefreshAt: expectedNextRefresh,
      });

      vi.restoreAllMocks();
    });
  });

  // =========================================================================
  // cancel
  // =========================================================================

  describe("cancel", () => {
    it("should remove repeatable job when found", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "repeatable-key-1" },
        { id: "refresh:target-2", key: "repeatable-key-2" },
      ]);

      await TokenRefreshScheduler.cancel("target-1");

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("repeatable-key-1");
    });

    it("should clear status even when no repeatable job found", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([]);

      await TokenRefreshScheduler.cancel("target-1");

      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
      expect(mockClearStatus).toHaveBeenCalledWith("target-1");
    });

    it("should clear status after removing repeatable job", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "repeatable-key-1" },
      ]);

      await TokenRefreshScheduler.cancel("target-1");

      expect(mockClearStatus).toHaveBeenCalledWith("target-1");
    });
  });

  // =========================================================================
  // forceRefresh
  // =========================================================================

  describe("forceRefresh", () => {
    it("should add a one-off job with manual triggeredBy", async () => {
      await TokenRefreshScheduler.forceRefresh("target-1");

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "target-1",
          forceFresh: true,
          triggeredBy: "manual",
        }),
        expect.objectContaining({
          jobId: expect.stringContaining("refresh:target-1:manual:"),
        })
      );
    });

    it("should use unique jobId with timestamp", async () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      await TokenRefreshScheduler.forceRefresh("target-1");

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          jobId: `refresh:target-1:manual:${now}`,
        })
      );

      vi.restoreAllMocks();
    });

    it("should use default maxAge and refreshAheadPercent", async () => {
      await TokenRefreshScheduler.forceRefresh("target-1");

      expect(mockAddTokenRefreshJob).toHaveBeenCalledWith(
        expect.objectContaining({
          maxAge: 300_000,
          refreshAheadPercent: 0.75,
        }),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // isScheduled
  // =========================================================================

  describe("isScheduled", () => {
    it("should return true when repeatable job exists for target", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
      ]);

      const result = await TokenRefreshScheduler.isScheduled("target-1");

      expect(result).toBe(true);
    });

    it("should return false when no repeatable job exists", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-2", key: "key-2" },
      ]);

      const result = await TokenRefreshScheduler.isScheduled("target-1");

      expect(result).toBe(false);
    });

    it("should return false when no repeatable jobs at all", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([]);

      const result = await TokenRefreshScheduler.isScheduled("target-1");

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // getScheduledTargets
  // =========================================================================

  describe("getScheduledTargets", () => {
    it("should return target IDs from repeatable jobs", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
        { id: "refresh:target-2", key: "key-2" },
      ]);

      const targets = await TokenRefreshScheduler.getScheduledTargets();

      expect(targets).toEqual(["target-1", "target-2"]);
    });

    it("should filter out manual (one-off) jobs", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
        { id: "refresh:target-2:manual:1234567890", key: "key-2" },
      ]);

      const targets = await TokenRefreshScheduler.getScheduledTargets();

      expect(targets).toEqual(["target-1"]);
    });

    it("should return empty array when no repeatable jobs", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([]);

      const targets = await TokenRefreshScheduler.getScheduledTargets();

      expect(targets).toEqual([]);
    });

    it("should filter out jobs without valid ID prefix", async () => {
      mockGetRepeatableJobs.mockResolvedValueOnce([
        { id: "refresh:target-1", key: "key-1" },
        { id: "other-job", key: "key-2" },
        { id: undefined, key: "key-3" },
      ]);

      const targets = await TokenRefreshScheduler.getScheduledTargets();

      expect(targets).toEqual(["target-1"]);
    });
  });
});
