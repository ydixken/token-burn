import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectorConfig, HealthStatus } from "@/lib/connectors/base";
import type { DiscoveryResult } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories are hoisted to the top, so all variables
// they reference must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

const {
  mockDiscoveryResult,
  mockDiscover,
  mockCloseBrowser,
  mockWsListeners,
  mockWs,
  mockInternalConnect,
  mockInternalDisconnect,
  mockInternalSendMessage,
  mockInternalIsConnected,
  mockInternalHealthCheck,
  mockStart,
  mockStop,
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

  const mockWsListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const mockWs = {
    send: vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      cb?.();
    }),
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!mockWsListeners.has(event)) mockWsListeners.set(event, []);
      mockWsListeners.get(event)!.push(cb);
    }),
    removeListener: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      const cbs = mockWsListeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(cb);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    }),
    readyState: 1,
    close: vi.fn(),
    ping: vi.fn(),
    once: vi.fn(),
  };

  const mockInternalConnect = vi.fn().mockResolvedValue(undefined);
  const mockInternalDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockInternalSendMessage = vi.fn().mockResolvedValue({
    content: "response from raw WS",
    metadata: { responseTimeMs: 42 },
  });
  const mockInternalIsConnected = vi.fn().mockReturnValue(true);
  const mockInternalHealthCheck = vi.fn().mockResolvedValue({
    healthy: true,
    latencyMs: 10,
    timestamp: new Date(),
  });

  const mockStart = vi.fn();
  const mockStop = vi.fn();

  return {
    mockDiscoveryResult,
    mockDiscover,
    mockCloseBrowser,
    mockWsListeners,
    mockWs,
    mockInternalConnect,
    mockInternalDisconnect,
    mockInternalSendMessage,
    mockInternalIsConnected,
    mockInternalHealthCheck,
    mockStart,
    mockStop,
  };
});

// ---------------------------------------------------------------------------
// vi.mock calls (hoisted to top — only reference hoisted variables)
// ---------------------------------------------------------------------------

vi.mock("@/lib/connectors/browser/discovery-service", () => ({
  BrowserDiscoveryService: {
    discover: mockDiscover,
    closeBrowser: mockCloseBrowser,
  },
}));

vi.mock("@/lib/connectors/websocket", () => ({
  WebSocketConnector: vi.fn().mockImplementation(() => ({
    connect: mockInternalConnect,
    disconnect: mockInternalDisconnect,
    sendMessage: mockInternalSendMessage,
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
  }));
  // Static methods used by BrowserWebSocketConnector
  SocketIOHandler.encodeMessage = vi.fn().mockImplementation(
    (eventName: string, payload: unknown) => `42${JSON.stringify([eventName, payload])}`
  );
  SocketIOHandler.isMessageFrame = vi.fn().mockImplementation(
    (frame: string) => typeof frame === "string" && frame.length >= 3 && frame.startsWith("42")
  );
  SocketIOHandler.decodeMessage = vi.fn().mockImplementation((frame: string) => {
    if (!frame.startsWith("42")) return null;
    try {
      const parsed = JSON.parse(frame.slice(2));
      if (Array.isArray(parsed) && parsed.length >= 1) {
        return { eventName: parsed[0], data: parsed[1] };
      }
    } catch { /* ignore */ }
    return null;
  });
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

// ---------------------------------------------------------------------------
// Import SUT after mocks are set up
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

describe("BrowserWebSocketConnector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsListeners.clear();
    mockInternalIsConnected.mockReturnValue(true);
    // Reset the discovery mock to default
    mockDiscover.mockResolvedValue(mockDiscoveryResult);
  });

  // =========================================================================
  // Connect / Disconnect lifecycle
  // =========================================================================

  describe("connect", () => {
    it("should run browser discovery and create internal connector", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      expect(mockDiscover).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "target-1",
          config: expect.objectContaining({ pageUrl: "https://test.com/chat" }),
        })
      );

      expect(mockInternalConnect).toHaveBeenCalled();
      expect(connector.isConnected()).toBe(true);
    });

    it("should start SocketIOHandler when Socket.IO is detected", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const { SocketIOHandler } = await import("@/lib/connectors/browser/socketio-handler");
      expect(SocketIOHandler).toHaveBeenCalledWith(mockWs, mockDiscoveryResult.socketIoConfig);
      expect(mockStart).toHaveBeenCalled();
    });

    it("should NOT start SocketIOHandler when protocol is raw", async () => {
      mockDiscover.mockResolvedValueOnce({
        ...mockDiscoveryResult,
        detectedProtocol: "raw",
        socketIoConfig: undefined,
      });

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      expect(mockStart).not.toHaveBeenCalled();
    });

    it("should throw ConnectorError when protocolConfig is missing pageUrl", async () => {
      const config = createConfig({ protocolConfig: {} });
      const connector = new BrowserWebSocketConnector("target-1", config);

      await expect(connector.connect()).rejects.toThrow(/requires protocolConfig with a pageUrl/);
    });

    it("should throw ConnectorError when discovery fails", async () => {
      mockDiscover.mockRejectedValueOnce(new Error("Navigation failed"));

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await expect(connector.connect()).rejects.toThrow(/Browser discovery failed/);
    });

    it("should throw ConnectorError when internal WS connection fails", async () => {
      mockInternalConnect.mockRejectedValueOnce(new Error("Connection refused"));

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await expect(connector.connect()).rejects.toThrow(/Failed to connect to discovered WebSocket/);
    });
  });

  describe("disconnect", () => {
    it("should stop SocketIOHandler and disconnect internal connector", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      await connector.disconnect();

      expect(mockStop).toHaveBeenCalled();
      expect(mockInternalDisconnect).toHaveBeenCalled();
      expect(connector.isConnected()).toBe(false);
    });

    it("should close browser when keepBrowserAlive is false", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();
      await connector.disconnect();

      expect(mockCloseBrowser).toHaveBeenCalled();
    });

    it("should NOT close browser when keepBrowserAlive is true", async () => {
      const config = createConfig({
        protocolConfig: {
          pageUrl: "https://test.com/chat",
          widgetDetection: { strategy: "heuristic" },
          session: { keepBrowserAlive: true },
        },
      });
      const connector = new BrowserWebSocketConnector("target-1", config);
      await connector.connect();
      await connector.disconnect();

      expect(mockCloseBrowser).not.toHaveBeenCalled();
    });

    it("should handle disconnect when not connected", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // isConnected
  // =========================================================================

  describe("isConnected", () => {
    it("should return false before connect", () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      expect(connector.isConnected()).toBe(false);
    });

    it("should return true after connect", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
    });

    it("should return false when internal connector reports disconnected", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      mockInternalIsConnected.mockReturnValue(false);
      expect(connector.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // sendMessage
  // =========================================================================

  describe("sendMessage - raw mode", () => {
    it("should delegate to internal connector in raw mode", async () => {
      mockDiscover.mockResolvedValueOnce({
        ...mockDiscoveryResult,
        detectedProtocol: "raw",
        socketIoConfig: undefined,
      });

      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const response = await connector.sendMessage("Hello");

      expect(mockInternalSendMessage).toHaveBeenCalledWith("Hello", undefined);
      expect(response.content).toBe("response from raw WS");
    });
  });

  describe("sendMessage - Socket.IO mode", () => {
    it("should encode message as Socket.IO frame and send via raw WS", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      // Simulate a response coming back after send
      mockWs.send.mockImplementation((data: string, cb?: (err?: Error) => void) => {
        cb?.();
        setTimeout(() => {
          const listeners = mockWsListeners.get("message") ?? [];
          for (const listener of listeners) {
            listener(Buffer.from('42["message",{"text":"Hi back"}]'));
          }
        }, 10);
      });

      const response = await connector.sendMessage("Hello");

      expect(mockWs.send).toHaveBeenCalled();
      expect(response.content).toBeDefined();
      expect(response.metadata.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should throw when not connected", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());

      await expect(connector.sendMessage("Hello")).rejects.toThrow(
        /not connected/
      );
    });
  });

  // =========================================================================
  // supportsStreaming
  // =========================================================================

  describe("supportsStreaming", () => {
    it("should return true", () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      expect(connector.supportsStreaming()).toBe(true);
    });
  });

  // =========================================================================
  // healthCheck
  // =========================================================================

  describe("healthCheck", () => {
    it("should delegate to internal connector when healthy", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(mockInternalHealthCheck).toHaveBeenCalled();
    });

    it("should return unhealthy when not connected", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe("Not connected");
    });

    it("should attempt rediscovery when unhealthy and session expired", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      mockInternalHealthCheck.mockResolvedValueOnce({
        healthy: false,
        error: "Ping timeout",
        timestamp: new Date(),
      } as HealthStatus);

      // Set discoveredAt to far in the past to simulate expiry
      const internalResult = (connector as unknown as { discoveryResult: DiscoveryResult }).discoveryResult;
      internalResult.discoveredAt = new Date(Date.now() - 400_000);

      await connector.healthCheck();

      // Rediscovery should have been attempted (discover called twice: initial + rediscovery)
      expect(mockDiscover).toHaveBeenCalledTimes(2);
    });

    it("should return unhealthy when rediscovery fails", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      mockInternalHealthCheck.mockResolvedValueOnce({
        healthy: false,
        error: "Ping timeout",
        timestamp: new Date(),
      } as HealthStatus);

      const internalResult = (connector as unknown as { discoveryResult: DiscoveryResult }).discoveryResult;
      internalResult.discoveredAt = new Date(Date.now() - 400_000);

      mockDiscover.mockRejectedValueOnce(new Error("Discovery failed again"));

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain("Rediscovery failed");
    });
  });

  // =========================================================================
  // Internal config building
  // =========================================================================

  describe("internal config", () => {
    it("should build internal config with discovered endpoint and headers", async () => {
      const connector = new BrowserWebSocketConnector("target-1", createConfig());
      await connector.connect();

      const { WebSocketConnector } = await import("@/lib/connectors/websocket");
      expect(WebSocketConnector).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({
          endpoint: "wss://chat.test.com/socket.io/?EIO=4&transport=websocket",
          authType: "CUSTOM_HEADER",
          authConfig: expect.objectContaining({
            headers: expect.objectContaining({
              Origin: "https://test.com",
              Cookie: "session=abc123",
            }),
          }),
        })
      );
    });

    it("should preserve requestTemplate and responseTemplate from original config", async () => {
      const config = createConfig({
        requestTemplate: { messagePath: "data.text", structure: { data: { text: "" } } },
        responseTemplate: { responsePath: "data.reply" },
      });

      const connector = new BrowserWebSocketConnector("target-1", config);
      await connector.connect();

      const { WebSocketConnector } = await import("@/lib/connectors/websocket");
      expect(WebSocketConnector).toHaveBeenCalledWith(
        "target-1",
        expect.objectContaining({
          requestTemplate: { messagePath: "data.text", structure: { data: { text: "" } } },
          responseTemplate: { responsePath: "data.reply" },
        })
      );
    });
  });

});

// =========================================================================
// Auto-registration (outside main describe to avoid clearAllMocks)
// The registration happens as a module-level side-effect when
// browser-websocket.ts is first imported.
// =========================================================================

describe("BrowserWebSocketConnector auto-registration", () => {
  it("should register with ConnectorRegistry as BROWSER_WEBSOCKET on import", async () => {
    // Re-import to trigger the side-effect registration again
    vi.resetModules();

    // Re-apply the registry mock
    vi.doMock("@/lib/connectors/registry", () => ({
      ConnectorRegistry: {
        register: vi.fn(),
      },
    }));
    // Re-apply other mocks needed for the import
    vi.doMock("@/lib/connectors/browser/discovery-service", () => ({
      BrowserDiscoveryService: { discover: vi.fn(), closeBrowser: vi.fn() },
    }));
    vi.doMock("@/lib/connectors/browser/socketio-handler", () => ({
      SocketIOHandler: vi.fn(),
    }));
    vi.doMock("@/lib/connectors/browser/credential-extractor", () => ({
      CredentialExtractor: { buildCookieHeader: vi.fn() },
    }));
    vi.doMock("@/lib/connectors/websocket", () => ({
      WebSocketConnector: vi.fn(),
    }));

    const { BrowserWebSocketConnector: BWC } = await import(
      "@/lib/connectors/browser-websocket"
    );
    const { ConnectorRegistry } = await import("@/lib/connectors/registry");

    expect(ConnectorRegistry.register).toHaveBeenCalledWith("BROWSER_WEBSOCKET", BWC);
  });
});
