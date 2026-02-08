import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  BrowserWebSocketProtocolConfig,
  BrowserDiscoveryOptions,
  DiscoveryResult,
} from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories are hoisted to top, so all variables
// referenced inside must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

const {
  redisStore,
  mockPageListeners,
  mockPage,
  mockContext,
  mockBrowser,
  mockCapturedWs,
} = vi.hoisted(() => {
  const redisStore = new Map<string, { value: string; expiry?: number }>();

  const mockPageListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const mockPage: Record<string, unknown> = {
    goto: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!mockPageListeners.has(event)) mockPageListeners.set(event, []);
      mockPageListeners.get(event)!.push(cb);
      return mockPage;
    }),
    removeListener: vi.fn(),
    context: vi.fn(),
    _emit(event: string, ...args: unknown[]) {
      for (const cb of mockPageListeners.get(event) ?? []) cb(...args);
    },
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
    cookies: vi.fn().mockResolvedValue([{ name: "sid", value: "abc", domain: ".test.com" }]),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockCapturedWs = {
    url: "wss://chat.test.com/socket.io/?EIO=4&transport=websocket",
    frames: [
      { direction: "received" as const, data: '0{"sid":"test-sid","pingInterval":25000,"pingTimeout":20000}', timestamp: Date.now() },
      { direction: "received" as const, data: "40", timestamp: Date.now() },
    ],
    headers: { Origin: "https://test.com", Cookie: "sid=abc" },
    createdAt: Date.now(),
  };

  return { redisStore, mockPageListeners, mockPage, mockContext, mockBrowser, mockCapturedWs };
});

// ---------------------------------------------------------------------------
// vi.mock calls
// ---------------------------------------------------------------------------

vi.mock("@/lib/cache/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiry && Date.now() > entry.expiry) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: string, ex?: string, ttl?: number) => {
      const expiry = ex === "EX" && ttl ? Date.now() + ttl * 1000 : undefined;
      redisStore.set(key, { value, expiry });
      return "OK";
    }),
  },
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock("@/lib/connectors/browser/ws-capture", () => ({
  WebSocketCapture: vi.fn().mockImplementation(() => ({
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    waitForWebSocket: vi.fn().mockResolvedValue(mockCapturedWs),
    getCapturedConnections: vi.fn().mockReturnValue([mockCapturedWs]),
  })),
}));

vi.mock("@/lib/connectors/browser/widget-detector", () => ({
  WidgetDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockResolvedValue(undefined),
    setWsDetectedCallback: vi.fn(),
    notifyWsDetected: vi.fn(),
  })),
}));

vi.mock("@/lib/connectors/browser/credential-extractor", () => ({
  CredentialExtractor: {
    extract: vi.fn().mockResolvedValue({
      cookies: [{ name: "sid", value: "abc", domain: ".test.com" }],
      localStorage: { token: "jwt-xyz" },
      sessionStorage: { chat: "sess-1" },
    }),
    buildCookieHeader: vi.fn().mockReturnValue("sid=abc"),
  },
}));

vi.mock("@/lib/connectors/browser/protocol-detector", () => ({
  ProtocolDetector: {
    detect: vi.fn().mockReturnValue({
      protocol: "socket.io",
      socketIoConfig: { sid: "test-sid", pingInterval: 25000, pingTimeout: 20000, version: 4 },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { BrowserDiscoveryService } from "@/lib/connectors/browser/discovery-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<BrowserWebSocketProtocolConfig> = {}): BrowserWebSocketProtocolConfig {
  return {
    pageUrl: "https://test.com/chat",
    widgetDetection: { strategy: "heuristic" },
    ...overrides,
  };
}

function createOptions(overrides: Partial<BrowserDiscoveryOptions> = {}): BrowserDiscoveryOptions {
  return {
    config: createConfig(overrides.config as Partial<BrowserWebSocketProtocolConfig>),
    targetId: "target-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BrowserDiscoveryService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPageListeners.clear();
    redisStore.clear();
    await BrowserDiscoveryService.closeBrowser();
  });

  afterEach(async () => {
    await BrowserDiscoveryService.closeBrowser();
  });

  // =========================================================================
  // Cache behavior
  // =========================================================================

  describe("caching", () => {
    it("should check Redis cache first and return cached result", async () => {
      const cachedResult: DiscoveryResult = {
        wssUrl: "wss://cached.test.com/ws",
        cookies: [],
        headers: {},
        localStorage: {},
        sessionStorage: {},
        capturedFrames: [],
        detectedProtocol: "raw",
        discoveredAt: new Date("2026-01-01"),
      };

      await BrowserDiscoveryService.setCached("target-1", cachedResult, 60_000);

      const result = await BrowserDiscoveryService.discover(createOptions());

      expect(result.wssUrl).toBe("wss://cached.test.com/ws");
      expect(result.detectedProtocol).toBe("raw");
      const { chromium } = await import("playwright");
      expect(chromium.launch).not.toHaveBeenCalled();
    });

    it("should cache discovery result after successful discovery", async () => {
      const result = await BrowserDiscoveryService.discover(createOptions());

      const cached = await BrowserDiscoveryService.getCached("target-1");
      expect(cached).not.toBeNull();
      expect(cached!.wssUrl).toBe(result.wssUrl);
    });

    it("should use custom TTL from session.maxAge", async () => {
      const options = createOptions({
        config: createConfig({ session: { maxAge: 120_000 } }) as unknown as Partial<BrowserWebSocketProtocolConfig>,
      });

      await BrowserDiscoveryService.discover(options);

      const { redis } = await import("@/lib/cache/redis");
      expect(redis.set).toHaveBeenCalledWith(
        "krawall:discovery:target-1",
        expect.any(String),
        "EX",
        120
      );
    });

    it("should return null for non-existent cache key", async () => {
      const result = await BrowserDiscoveryService.getCached("nonexistent");
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Full discovery flow
  // =========================================================================

  describe("discover", () => {
    it("should run the full discovery flow and return a DiscoveryResult", async () => {
      const result = await BrowserDiscoveryService.discover(createOptions());

      expect(result.wssUrl).toBe("wss://chat.test.com/socket.io/?EIO=4&transport=websocket");
      expect(result.detectedProtocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.sid).toBe("test-sid");
      expect(result.cookies).toHaveLength(1);
      expect(result.localStorage).toEqual({ token: "jwt-xyz" });
      expect(result.sessionStorage).toEqual({ chat: "sess-1" });
      expect(result.headers).toEqual(mockCapturedWs.headers);
      expect(result.discoveredAt).toBeInstanceOf(Date);
    });

    it("should invoke onProgress callback at each stage", async () => {
      const onProgress = vi.fn();
      await BrowserDiscoveryService.discover(createOptions({ onProgress }));

      expect(onProgress).toHaveBeenCalledWith("Starting browser discovery");
      expect(onProgress).toHaveBeenCalledWith("WebSocket capture attached");
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("Navigating to"));
      expect(onProgress).toHaveBeenCalledWith("Page loaded");
      expect(onProgress).toHaveBeenCalledWith("Detecting chat widget");
      expect(onProgress).toHaveBeenCalledWith("Widget activated");
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("WebSocket captured"));
      expect(onProgress).toHaveBeenCalledWith("Detecting protocol");
      expect(onProgress).toHaveBeenCalledWith("Extracting credentials");
      expect(onProgress).toHaveBeenCalledWith("Discovery complete and cached");
    });

    it("should pass browser config to Playwright launch", async () => {
      const config = createConfig({
        browser: { headless: false, viewport: { width: 800, height: 600 } },
      });

      await BrowserDiscoveryService.discover(createOptions({ config } as Partial<BrowserDiscoveryOptions>));

      const { chromium } = await import("playwright");
      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({ headless: false })
      );
    });

    it("should pass wsFilter options to waitForWebSocket", async () => {
      const config = createConfig({
        wsFilter: { urlPattern: "socket\\.io", index: 1 },
      });

      await BrowserDiscoveryService.discover(createOptions({ config } as Partial<BrowserDiscoveryOptions>));

      const { WebSocketCapture } = await import("@/lib/connectors/browser/ws-capture");
      const instance = vi.mocked(WebSocketCapture).mock.results[0]?.value;
      expect(instance.waitForWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          urlPattern: "socket\\.io",
          index: 1,
        })
      );
    });
  });

  // =========================================================================
  // Protocol override
  // =========================================================================

  describe("protocol override", () => {
    it("should override detected protocol when config.protocol.type is not auto", async () => {
      const config = createConfig({
        protocol: { type: "raw" },
      });

      const result = await BrowserDiscoveryService.discover(
        createOptions({ config } as Partial<BrowserDiscoveryOptions>)
      );

      expect(result.detectedProtocol).toBe("raw");
      expect(result.socketIoConfig).toBeUndefined();
    });

    it("should keep auto-detected protocol when config.protocol.type is auto", async () => {
      const config = createConfig({
        protocol: { type: "auto" },
      });

      const result = await BrowserDiscoveryService.discover(
        createOptions({ config } as Partial<BrowserDiscoveryOptions>)
      );

      expect(result.detectedProtocol).toBe("socket.io");
    });
  });

  // =========================================================================
  // Browser reuse
  // =========================================================================

  describe("browser lifecycle", () => {
    it("should reuse browser instance when keepBrowserAlive is true", async () => {
      const config = createConfig({ session: { keepBrowserAlive: true } });

      await BrowserDiscoveryService.discover(createOptions({ config } as Partial<BrowserDiscoveryOptions>));

      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it("should close browser when keepBrowserAlive is false (default)", async () => {
      await BrowserDiscoveryService.discover(createOptions());

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it("should handle closeBrowser gracefully when no browser exists", async () => {
      await BrowserDiscoveryService.closeBrowser();
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe("error handling", () => {
    it("should throw descriptive error on navigation failure", async () => {
      (mockPage.goto as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("net::ERR_CONNECTION_REFUSED")
      );

      await expect(BrowserDiscoveryService.discover(createOptions())).rejects.toThrow(
        /Failed to navigate.*net::ERR_CONNECTION_REFUSED/
      );
    });

    it("should throw descriptive error on widget detection failure", async () => {
      const { WidgetDetector } = await import("@/lib/connectors/browser/widget-detector");
      vi.mocked(WidgetDetector).mockImplementationOnce(() => ({
        detect: vi.fn().mockRejectedValue(new Error("no widget found")),
        setWsDetectedCallback: vi.fn(),
        notifyWsDetected: vi.fn(),
      }) as unknown as InstanceType<typeof WidgetDetector>);

      await expect(BrowserDiscoveryService.discover(createOptions())).rejects.toThrow(
        /Widget detection failed.*no widget found/
      );
    });

    it("should throw descriptive error when no WebSocket connection detected", async () => {
      const { WebSocketCapture } = await import("@/lib/connectors/browser/ws-capture");
      vi.mocked(WebSocketCapture).mockImplementationOnce(() => ({
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        waitForWebSocket: vi.fn().mockRejectedValue(new Error("timed out after 15000ms")),
        getCapturedConnections: vi.fn().mockReturnValue([]),
      }) as unknown as InstanceType<typeof WebSocketCapture>);

      await expect(BrowserDiscoveryService.discover(createOptions())).rejects.toThrow(
        /No WebSocket connection detected/
      );
    });

    it("should clean up page and context on error", async () => {
      (mockPage.goto as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("navigation error")
      );

      await BrowserDiscoveryService.discover(createOptions()).catch(() => {});

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getCached / setCached
  // =========================================================================

  describe("getCached / setCached", () => {
    it("should round-trip a DiscoveryResult through Redis", async () => {
      const result: DiscoveryResult = {
        wssUrl: "wss://example.com/ws",
        cookies: [{ name: "a", value: "b", domain: ".example.com" }],
        headers: { Authorization: "Bearer tok" },
        localStorage: { key: "val" },
        sessionStorage: {},
        capturedFrames: [],
        detectedProtocol: "raw",
        discoveredAt: new Date("2026-02-01T12:00:00Z"),
      };

      await BrowserDiscoveryService.setCached("test-target", result, 60_000);
      const cached = await BrowserDiscoveryService.getCached("test-target");

      expect(cached).not.toBeNull();
      expect(cached!.wssUrl).toBe("wss://example.com/ws");
      expect(cached!.cookies).toEqual(result.cookies);
      expect(cached!.discoveredAt).toEqual(new Date("2026-02-01T12:00:00Z"));
    });
  });
});
