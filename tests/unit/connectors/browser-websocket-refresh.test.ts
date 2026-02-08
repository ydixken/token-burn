import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorConfig } from "@/lib/connectors/base";
import type { DiscoveryResult } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockDiscoveryResult,
  mockDiscover,
  mockCloseBrowser,
  mockGetCached,
  mockWs,
  mockInternalConnect,
  mockInternalDisconnect,
  mockInternalIsConnected,
  mockInternalHealthCheck,
  mockStart,
  mockStop,
  mockSubscribeTokenRefreshed,
  mockUnsubscribe,
} = vi.hoisted(() => {
  const mockDiscoveryResult: DiscoveryResult = {
    wssUrl: "wss://chat.test.com/socket.io/?EIO=4&transport=websocket",
    cookies: [{ name: "session", value: "abc123", domain: ".test.com" }],
    headers: { Origin: "https://test.com" },
    localStorage: { token: "jwt-xyz" },
    sessionStorage: {},
    capturedFrames: [],
    detectedProtocol: "socket.io" as const,
    socketIoConfig: {
      sid: "test-sid",
      pingInterval: 25000,
      pingTimeout: 20000,
      version: 4,
    },
    discoveredAt: new Date(),
  };

  const mockDiscover = vi.fn().mockResolvedValue(mockDiscoveryResult);
  const mockCloseBrowser = vi.fn().mockResolvedValue(undefined);
  const mockGetCached = vi.fn().mockResolvedValue(null);

  const mockWs = {
    send: vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      cb?.();
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    readyState: 1,
    close: vi.fn(),
    ping: vi.fn(),
    once: vi.fn(),
  };

  const mockInternalConnect = vi.fn().mockResolvedValue(undefined);
  const mockInternalDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockInternalIsConnected = vi.fn().mockReturnValue(true);
  const mockInternalHealthCheck = vi.fn().mockResolvedValue({
    healthy: true,
    latencyMs: 10,
    timestamp: new Date(),
  });

  const mockStart = vi.fn();
  const mockStop = vi.fn();

  const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
  const mockSubscribeTokenRefreshed = vi.fn().mockResolvedValue({
    unsubscribe: mockUnsubscribe,
  });

  return {
    mockDiscoveryResult,
    mockDiscover,
    mockCloseBrowser,
    mockGetCached,
    mockWs,
    mockInternalConnect,
    mockInternalDisconnect,
    mockInternalIsConnected,
    mockInternalHealthCheck,
    mockStart,
    mockStop,
    mockSubscribeTokenRefreshed,
    mockUnsubscribe,
  };
});

// ---------------------------------------------------------------------------
// vi.mock calls
// ---------------------------------------------------------------------------

vi.mock("@/lib/connectors/browser/discovery-service", () => ({
  BrowserDiscoveryService: {
    discover: mockDiscover,
    closeBrowser: mockCloseBrowser,
    getCached: mockGetCached,
  },
}));

vi.mock("@/lib/connectors/websocket", () => ({
  WebSocketConnector: vi.fn().mockImplementation(() => ({
    connect: mockInternalConnect,
    disconnect: mockInternalDisconnect,
    sendMessage: vi.fn().mockResolvedValue({ content: "ok", metadata: {} }),
    isConnected: mockInternalIsConnected,
    healthCheck: mockInternalHealthCheck,
    supportsStreaming: () => true,
    ws: mockWs,
  })),
}));

vi.mock("@/lib/connectors/browser/socketio-handler", () => {
  const SocketIOHandler = vi.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
  })) as ReturnType<typeof vi.fn> & Record<string, ReturnType<typeof vi.fn>>;
  SocketIOHandler.encodeMessage = vi.fn();
  SocketIOHandler.isMessageFrame = vi.fn();
  SocketIOHandler.decodeMessage = vi.fn();
  return { SocketIOHandler };
});

vi.mock("@/lib/connectors/browser/credential-extractor", () => ({
  CredentialExtractor: {
    buildCookieHeader: vi.fn().mockReturnValue("session=abc123"),
  },
}));

vi.mock("@/lib/connectors/registry", () => ({
  ConnectorRegistry: {
    register: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/token-refresh/events", () => ({
  subscribeTokenRefreshed: mockSubscribeTokenRefreshed,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { BrowserWebSocketConnector } from "@/lib/connectors/browser-websocket";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    endpoint: "https://test.com/chat",
    authType: "NONE",
    authConfig: {},
    requestTemplate: { messagePath: "message", structure: { message: "" } },
    responseTemplate: { responsePath: "response" },
    protocolConfig: {
      pageUrl: "https://test.com/chat",
      widgetDetection: { strategy: "heuristic" },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BrowserWebSocketConnector - Token Refresh Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInternalIsConnected.mockReturnValue(true);
    mockDiscover.mockResolvedValue(mockDiscoveryResult);
  });

  // =========================================================================
  // subscribeToRefreshNotifications on connect
  // =========================================================================

  describe("subscribeToRefreshNotifications", () => {
    it("should subscribe to token refresh on connect when tokenRefreshEnabled is not false", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      expect(mockSubscribeTokenRefreshed).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should NOT subscribe when tokenRefreshEnabled is explicitly false", async () => {
      const config = createConfig({
        protocolConfig: {
          pageUrl: "https://test.com/chat",
          widgetDetection: { strategy: "heuristic" },
          session: { tokenRefreshEnabled: false },
        },
      });

      const connector = new BrowserWebSocketConnector("target-1", config);
      await connector.connect();

      expect(mockSubscribeTokenRefreshed).not.toHaveBeenCalled();
    });

    it("should subscribe when session config exists but tokenRefreshEnabled is undefined", async () => {
      const config = createConfig({
        protocolConfig: {
          pageUrl: "https://test.com/chat",
          widgetDetection: { strategy: "heuristic" },
          session: { maxAge: 300_000 },
        },
      });

      const connector = new BrowserWebSocketConnector("target-1", config);
      await connector.connect();

      expect(mockSubscribeTokenRefreshed).toHaveBeenCalled();
    });

    it("should handle subscription failure gracefully (non-fatal)", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockSubscribeTokenRefreshed.mockRejectedValueOnce(new Error("Redis connection failed"));

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      // Should not throw - connector continues without refresh
      expect(connector.isConnected()).toBe(true);
      // console.warn is called with two args: message string and error message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to subscribe to token refresh"),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // updateCredentials hot-swap
  // =========================================================================

  describe("updateCredentials", () => {
    it("should read fresh cache and update discovery result on refresh event", async () => {
      const freshResult: DiscoveryResult = {
        ...mockDiscoveryResult,
        cookies: [{ name: "session", value: "new-token-999", domain: ".test.com" }],
        headers: { Origin: "https://test.com", "X-New-Header": "fresh" },
      };
      mockGetCached.mockResolvedValueOnce(freshResult);

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      // Get the callback that was registered with subscribeTokenRefreshed
      const refreshCallback = mockSubscribeTokenRefreshed.mock.calls[0][0];

      // Simulate a refresh event for this target
      await refreshCallback({
        targetId: "target-1",
        timestamp: new Date().toISOString(),
        triggeredBy: "scheduled",
      });

      // Wait for the async updateCredentials to complete
      await vi.waitFor(() => {
        expect(mockGetCached).toHaveBeenCalledWith("target-1");
      });
    });

    it("should warn when no cached result found after refresh", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetCached.mockResolvedValueOnce(null);

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const refreshCallback = mockSubscribeTokenRefreshed.mock.calls[0][0];

      await refreshCallback({
        targetId: "target-1",
        timestamp: new Date().toISOString(),
        triggeredBy: "scheduled",
      });

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("No cached discovery result")
        );
      });

      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Ignore wrong targetId
  // =========================================================================

  describe("targetId filtering", () => {
    it("should ignore refresh events for a different targetId", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const refreshCallback = mockSubscribeTokenRefreshed.mock.calls[0][0];

      // Event for a different target
      await refreshCallback({
        targetId: "target-OTHER",
        timestamp: new Date().toISOString(),
        triggeredBy: "scheduled",
      });

      // Should NOT try to read cache for our target
      expect(mockGetCached).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Unsubscribe on disconnect
  // =========================================================================

  describe("disconnect cleanup", () => {
    it("should unsubscribe from token refresh on disconnect", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      expect(mockSubscribeTokenRefreshed).toHaveBeenCalled();

      await connector.disconnect();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("should handle disconnect when no subscription exists", async () => {
      const config = createConfig({
        protocolConfig: {
          pageUrl: "https://test.com/chat",
          widgetDetection: { strategy: "heuristic" },
          session: { tokenRefreshEnabled: false },
        },
      });

      const connector = new BrowserWebSocketConnector("target-1", config);
      await connector.connect();
      await connector.disconnect();

      // Should not throw
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });

    it("should nullify subscription after disconnect", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();
      await connector.disconnect();

      // Second disconnect should not call unsubscribe again
      mockUnsubscribe.mockClear();
      await connector.disconnect();

      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });
  });
});
