import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockHgetall, mockHset, mockDel } = vi.hoisted(() => {
  return {
    mockHgetall: vi.fn().mockResolvedValue({}),
    mockHset: vi.fn().mockResolvedValue(1),
    mockDel: vi.fn().mockResolvedValue(1),
  };
});

vi.mock("@/lib/cache/redis", () => ({
  redis: {
    hgetall: mockHgetall,
    hset: mockHset,
    del: mockDel,
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { TokenRefreshStatus, type RefreshStatusData } from "@/lib/jobs/token-refresh/status";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TokenRefreshStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe("getStatus", () => {
    it("should return defaults when Redis hash is empty", async () => {
      mockHgetall.mockResolvedValueOnce({});

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status).toEqual({
        lastRefreshAt: null,
        lastRefreshStatus: null,
        lastRefreshError: null,
        consecutiveFailures: 0,
        nextRefreshAt: null,
        refreshIntervalMs: null,
        isActive: false,
      });
    });

    it("should return defaults when Redis hash is null", async () => {
      mockHgetall.mockResolvedValueOnce(null);

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status.consecutiveFailures).toBe(0);
      expect(status.isActive).toBe(false);
    });

    it("should parse Redis hash correctly", async () => {
      mockHgetall.mockResolvedValueOnce({
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "success",
        lastRefreshError: "",
        consecutiveFailures: "0",
        nextRefreshAt: "2026-01-15T10:05:00.000Z",
        refreshIntervalMs: "225000",
        isActive: "true",
      });

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status).toEqual({
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "success",
        lastRefreshError: null, // empty string maps to null
        consecutiveFailures: 0,
        nextRefreshAt: "2026-01-15T10:05:00.000Z",
        refreshIntervalMs: 225000,
        isActive: true,
      });
    });

    it("should parse failed status with error message", async () => {
      mockHgetall.mockResolvedValueOnce({
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "failed",
        lastRefreshError: "Navigation timeout exceeded",
        consecutiveFailures: "3",
        isActive: "true",
      });

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status.lastRefreshStatus).toBe("failed");
      expect(status.lastRefreshError).toBe("Navigation timeout exceeded");
      expect(status.consecutiveFailures).toBe(3);
    });

    it("should use correct Redis key prefix", async () => {
      await TokenRefreshStatus.getStatus("my-target-id");

      expect(mockHgetall).toHaveBeenCalledWith("krawall:refresh-status:my-target-id");
    });

    it("should handle isActive=false correctly", async () => {
      mockHgetall.mockResolvedValueOnce({
        isActive: "false",
      });

      const status = await TokenRefreshStatus.getStatus("target-1");

      expect(status.isActive).toBe(false);
    });
  });

  // =========================================================================
  // setStatus
  // =========================================================================

  describe("setStatus", () => {
    it("should call redis.hset with correct key and fields", async () => {
      await TokenRefreshStatus.setStatus("target-1", {
        lastRefreshAt: "2026-01-15T10:00:00.000Z",
        lastRefreshStatus: "success",
        consecutiveFailures: 0,
      });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        expect.objectContaining({
          lastRefreshAt: "2026-01-15T10:00:00.000Z",
          lastRefreshStatus: "success",
          consecutiveFailures: "0",
        })
      );
    });

    it("should handle partial updates", async () => {
      await TokenRefreshStatus.setStatus("target-1", {
        isActive: true,
      });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        { isActive: "true" }
      );
    });

    it("should convert null values to empty strings", async () => {
      await TokenRefreshStatus.setStatus("target-1", {
        lastRefreshAt: null,
        lastRefreshError: null,
      });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        expect.objectContaining({
          lastRefreshAt: "",
          lastRefreshError: "",
        })
      );
    });

    it("should convert numeric values to strings", async () => {
      await TokenRefreshStatus.setStatus("target-1", {
        consecutiveFailures: 5,
        refreshIntervalMs: 225000,
      });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        expect.objectContaining({
          consecutiveFailures: "5",
          refreshIntervalMs: "225000",
        })
      );
    });

    it("should convert boolean isActive to string", async () => {
      await TokenRefreshStatus.setStatus("target-1", { isActive: false });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        { isActive: "false" }
      );
    });

    it("should not call redis.hset when no fields provided", async () => {
      await TokenRefreshStatus.setStatus("target-1", {});

      expect(mockHset).not.toHaveBeenCalled();
    });

    it("should handle nextRefreshAt", async () => {
      await TokenRefreshStatus.setStatus("target-1", {
        nextRefreshAt: "2026-01-15T10:05:00.000Z",
      });

      expect(mockHset).toHaveBeenCalledWith(
        "krawall:refresh-status:target-1",
        { nextRefreshAt: "2026-01-15T10:05:00.000Z" }
      );
    });
  });

  // =========================================================================
  // clearStatus
  // =========================================================================

  describe("clearStatus", () => {
    it("should delete the Redis hash", async () => {
      await TokenRefreshStatus.clearStatus("target-1");

      expect(mockDel).toHaveBeenCalledWith("krawall:refresh-status:target-1");
    });

    it("should use correct key for different target IDs", async () => {
      await TokenRefreshStatus.clearStatus("other-target");

      expect(mockDel).toHaveBeenCalledWith("krawall:refresh-status:other-target");
    });
  });
});
