import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockRedisSet,
  mockRedisGet,
  mockRedisDel,
  mockFindUnique,
  mockDiscover,
  mockSetCached,
  mockPublishTokenRefreshed,
  mockGetStatus,
  mockSetStatus,
  capturedProcessor,
  mockWorkerOn,
} = vi.hoisted(() => {
  return {
    mockRedisSet: vi.fn().mockResolvedValue("OK"),
    mockRedisGet: vi.fn().mockResolvedValue(null),
    mockRedisDel: vi.fn().mockResolvedValue(1),
    mockFindUnique: vi.fn(),
    mockDiscover: vi.fn().mockResolvedValue({
      wssUrl: "wss://chat.test.com/ws",
      cookies: [],
      headers: {},
      discoveredAt: new Date(),
    }),
    mockSetCached: vi.fn().mockResolvedValue(undefined),
    mockPublishTokenRefreshed: vi.fn().mockResolvedValue(undefined),
    mockGetStatus: vi.fn().mockResolvedValue({ consecutiveFailures: 0 }),
    mockSetStatus: vi.fn().mockResolvedValue(undefined),
    capturedProcessor: { fn: null as null | ((job: unknown) => Promise<void>) },
    mockWorkerOn: vi.fn(),
  };
});

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: unknown) => Promise<void>) => {
    capturedProcessor.fn = processor;
    return { on: mockWorkerOn };
  }),
}));

vi.mock("@/lib/cache/redis", () => ({
  redis: {
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    target: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("@/lib/connectors/browser/discovery-service", () => ({
  BrowserDiscoveryService: {
    discover: mockDiscover,
    setCached: mockSetCached,
  },
}));

vi.mock("@/lib/jobs/token-refresh/events", () => ({
  publishTokenRefreshed: mockPublishTokenRefreshed,
}));

vi.mock("@/lib/jobs/token-refresh/status", () => ({
  TokenRefreshStatus: {
    getStatus: mockGetStatus,
    setStatus: mockSetStatus,
  },
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-worker-uuid"),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { createTokenRefreshWorker } from "@/lib/jobs/workers/token-refresh-worker";
import { Worker } from "bullmq";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      targetId: "target-1",
      maxAge: 300_000,
      refreshAheadPercent: 0.75,
      forceFresh: true,
      triggeredBy: "scheduled" as const,
      ...(overrides.data as Record<string, unknown> ?? {}),
    },
    attemptsMade: (overrides.attemptsMade as number) ?? 0,
    opts: { attempts: 5, ...(overrides.opts as Record<string, unknown> ?? {}) },
  };
}

const defaultTarget = {
  id: "target-1",
  protocolConfig: {
    pageUrl: "https://test.com/chat",
    widgetDetection: { strategy: "heuristic" },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Token Refresh Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor.fn = null;

    // Default: lock acquired, no cache, target found
    mockRedisSet.mockResolvedValue("OK");
    mockRedisGet.mockResolvedValue(null);
    mockRedisDel.mockResolvedValue(1);
    mockFindUnique.mockResolvedValue(defaultTarget);
    mockGetStatus.mockResolvedValue({ consecutiveFailures: 0 });
  });

  // =========================================================================
  // Worker creation
  // =========================================================================

  describe("createTokenRefreshWorker", () => {
    it("should create a BullMQ Worker with name 'token-refresh'", () => {
      createTokenRefreshWorker();

      expect(Worker).toHaveBeenCalledWith(
        "token-refresh",
        expect.any(Function),
        expect.objectContaining({
          connection: expect.anything(),
          concurrency: 2,
        })
      );
    });

    it("should accept custom concurrency", () => {
      createTokenRefreshWorker(4);

      expect(Worker).toHaveBeenCalledWith(
        "token-refresh",
        expect.any(Function),
        expect.objectContaining({ concurrency: 4 })
      );
    });

    it("should register completed and failed event handlers", () => {
      createTokenRefreshWorker();

      expect(mockWorkerOn).toHaveBeenCalledWith("completed", expect.any(Function));
      expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
    });
  });

  // =========================================================================
  // Lock acquisition
  // =========================================================================

  describe("lock acquisition", () => {
    it("should acquire SETNX lock with correct key, value, and TTL", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockRedisSet).toHaveBeenCalledWith(
        "krawall:refresh-lock:target-1",
        "test-worker-uuid",
        "PX",
        120_000,
        "NX"
      );
    });

    it("should skip processing when lock is held by another worker", async () => {
      mockRedisSet.mockResolvedValueOnce(null); // Lock not acquired

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      // Should not proceed to database lookup
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockDiscover).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Cache pre-check
  // =========================================================================

  describe("cache pre-check", () => {
    it("should skip when recently refreshed (< 30s ago)", async () => {
      const recentCache = JSON.stringify({
        discoveredAt: new Date().toISOString(), // Just now
      });
      // First call: lock acquire (returns "OK")
      // Second call: cache check (returns cached data)
      mockRedisGet.mockResolvedValueOnce(recentCache);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockDiscover).not.toHaveBeenCalled();
    });

    it("should proceed when cache is older than 30s", async () => {
      const oldCache = JSON.stringify({
        discoveredAt: new Date(Date.now() - 60_000).toISOString(), // 60s ago
      });
      mockRedisGet.mockResolvedValueOnce(oldCache);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockFindUnique).toHaveBeenCalled();
    });

    it("should proceed when no cache exists", async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockFindUnique).toHaveBeenCalled();
    });

    it("should proceed when cache JSON is invalid", async () => {
      mockRedisGet.mockResolvedValueOnce("invalid-json{{{");

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockFindUnique).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Success flow
  // =========================================================================

  describe("success flow", () => {
    it("should load target from Prisma", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: "target-1" },
      });
    });

    it("should clear cache before discovery", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockRedisDel).toHaveBeenCalledWith("krawall:discovery:target-1");
    });

    it("should call discover with forceFresh config", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockDiscover).toHaveBeenCalledWith(
        expect.objectContaining({
          config: defaultTarget.protocolConfig,
          targetId: "target-1",
        })
      );
    });

    it("should write result to cache with maxAge", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockSetCached).toHaveBeenCalledWith(
        "target-1",
        expect.anything(), // discovery result
        300_000 // maxAge
      );
    });

    it("should publish token-refreshed event", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockPublishTokenRefreshed).toHaveBeenCalledWith("target-1", "scheduled");
    });

    it("should update status with success", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      expect(mockSetStatus).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({
          lastRefreshStatus: "success",
          lastRefreshError: null,
          consecutiveFailures: 0,
        })
      );
    });

    it("should release lock after success", async () => {
      // After processing: get lock value to verify ownership
      mockRedisGet
        .mockResolvedValueOnce(null) // cache check
        .mockResolvedValueOnce("test-worker-uuid"); // lock check in finally

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await processor(createMockJob());

      // Lock release: del is called for cache clear + lock release
      expect(mockRedisDel).toHaveBeenCalledWith("krawall:refresh-lock:target-1");
    });
  });

  // =========================================================================
  // Failure flow
  // =========================================================================

  describe("failure flow", () => {
    it("should update status with failure on error", async () => {
      mockFindUnique.mockResolvedValueOnce(null); // Target not found

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow("Target target-1 not found");

      expect(mockSetStatus).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({
          lastRefreshStatus: "failed",
          lastRefreshError: "Target target-1 not found in database",
          consecutiveFailures: 1,
        })
      );
    });

    it("should increment consecutiveFailures", async () => {
      mockGetStatus.mockResolvedValueOnce({ consecutiveFailures: 2 });
      mockFindUnique.mockResolvedValueOnce(null);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow();

      expect(mockSetStatus).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({
          consecutiveFailures: 3,
        })
      );
    });

    it("should warn on maxConsecutiveFailures reached", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetStatus.mockResolvedValueOnce({ consecutiveFailures: 4 });
      mockFindUnique.mockResolvedValueOnce(null);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("5 consecutive failures")
      );

      consoleSpy.mockRestore();
    });

    it("should throw error to let BullMQ retry", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow();
    });

    it("should throw when target has no valid protocolConfig", async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: "target-1",
        protocolConfig: {},
      });

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow(
        /no valid BrowserWebSocketProtocolConfig/
      );
    });

    it("should release lock on error", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      // Cache check returns null, then lock check returns worker uuid
      mockRedisGet
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("test-worker-uuid");

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      await expect(processor(createMockJob())).rejects.toThrow();

      expect(mockRedisDel).toHaveBeenCalledWith("krawall:refresh-lock:target-1");
    });

    it("should NOT release lock if held by another worker", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      // Cache check returns null, then lock check returns different worker
      mockRedisGet
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("other-worker-uuid");

      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      // Clear the del mock to track only finally-block calls
      mockRedisDel.mockClear();

      await expect(processor(createMockJob())).rejects.toThrow();

      // del should NOT be called for lock release (only for cache clear before discover)
      // Actually cache clear happens AFTER findUnique, which throws, so no del at all
      expect(mockRedisDel).not.toHaveBeenCalledWith("krawall:refresh-lock:target-1");
    });
  });

  // =========================================================================
  // triggeredBy passthrough
  // =========================================================================

  describe("triggeredBy", () => {
    it("should pass manual triggeredBy to publishTokenRefreshed", async () => {
      createTokenRefreshWorker();
      const processor = capturedProcessor.fn!;

      const job = createMockJob({ data: { triggeredBy: "manual" } });
      await processor(job);

      expect(mockPublishTokenRefreshed).toHaveBeenCalledWith("target-1", "manual");
    });
  });
});
