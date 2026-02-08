import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocketCapture, matchesUrlPattern } from "@/lib/connectors/browser/ws-capture";
import type { CapturedWebSocket } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// URL pattern matching (extracted helper – directly testable)
// ---------------------------------------------------------------------------

describe("matchesUrlPattern", () => {
  it("should match a simple substring pattern", () => {
    expect(matchesUrlPattern("wss://example.com/socket.io/?EIO=4", "socket\\.io")).toBe(true);
  });

  it("should not match when pattern is absent from URL", () => {
    expect(matchesUrlPattern("wss://example.com/ws/chat", "socket\\.io")).toBe(false);
  });

  it("should support full regex patterns", () => {
    expect(matchesUrlPattern("wss://chat.example.com/ws/v2/stream", "ws/v\\d+/stream")).toBe(true);
  });

  it("should match case-sensitively by default", () => {
    expect(matchesUrlPattern("wss://example.com/Socket.IO/", "socket\\.io")).toBe(false);
  });

  it("should support case-insensitive matching via regex character classes", () => {
    // JS RegExp doesn't support inline (?i), but users can use character classes.
    expect(matchesUrlPattern("wss://example.com/Socket.IO/", "[Ss]ocket\\.[Ii][Oo]")).toBe(true);
  });

  it("should fall back to includes when regex is invalid", () => {
    // An unbalanced bracket is invalid regex.
    expect(matchesUrlPattern("wss://example.com/chat[1", "chat[1")).toBe(true);
    expect(matchesUrlPattern("wss://example.com/ws", "chat[1")).toBe(false);
  });

  it("should match with anchored pattern", () => {
    expect(matchesUrlPattern("wss://example.com/ws", "^wss://example\\.com")).toBe(true);
    expect(matchesUrlPattern("wss://other.com/ws", "^wss://example\\.com")).toBe(false);
  });

  it("should handle empty pattern (matches everything)", () => {
    expect(matchesUrlPattern("wss://example.com/ws", "")).toBe(true);
  });

  it("should handle empty URL", () => {
    expect(matchesUrlPattern("", "socket\\.io")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WebSocketCapture – structural / behavioral tests
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock of a Playwright Page with controllable behaviour.
 *
 * We only mock the surface area that WebSocketCapture touches:
 * - page.on('websocket', listener)
 * - page.removeListener('websocket', listener)
 * - page.context().newCDPSession(page)
 */
function createMockPage() {
  const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  const cdpListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  const cdpSession = {
    send: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!cdpListeners.has(event)) {
        cdpListeners.set(event, []);
      }
      cdpListeners.get(event)!.push(cb);
    }),
    detach: vi.fn().mockResolvedValue(undefined),
    // Helper to emit CDP events in tests.
    _emit(event: string, data: unknown) {
      for (const cb of cdpListeners.get(event) ?? []) {
        cb(data);
      }
    },
  };

  const context = {
    newCDPSession: vi.fn().mockResolvedValue(cdpSession),
  };

  const page = {
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(cb);
    }),
    removeListener: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      const cbs = listeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(cb);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    }),
    context: vi.fn().mockReturnValue(context),
    // Helper to emit page events in tests.
    _emit(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) {
        cb(...args);
      }
    },
  };

  return { page, context, cdpSession };
}

/**
 * Create a mock Playwright WebSocket object.
 */
function createMockWs(url: string) {
  const wsListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  return {
    url: () => url,
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!wsListeners.has(event)) {
        wsListeners.set(event, []);
      }
      wsListeners.get(event)!.push(cb);
    }),
    _emit(event: string, data: unknown) {
      for (const cb of wsListeners.get(event) ?? []) {
        cb(data);
      }
    },
  };
}

describe("WebSocketCapture", () => {
  // =========================================================================
  // Initial state
  // =========================================================================

  describe("initial state", () => {
    it("should return empty array from getCapturedConnections()", () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      expect(capture.getCapturedConnections()).toEqual([]);
    });

    it("should return undefined from getConnection(0)", () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      expect(capture.getConnection(0)).toBeUndefined();
    });

    it("should return undefined from getConnection with any index", () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      expect(capture.getConnection(5)).toBeUndefined();
      expect(capture.getConnection(-1)).toBeUndefined();
    });
  });

  // =========================================================================
  // attach / detach
  // =========================================================================

  describe("attach", () => {
    it("should create a CDP session and register listeners", async () => {
      const { page, context, cdpSession } = createMockPage();
      const capture = new WebSocketCapture(page as never);

      await capture.attach();

      expect(context.newCDPSession).toHaveBeenCalledOnce();
      expect(cdpSession.send).toHaveBeenCalledWith("Network.enable");
      expect(page.on).toHaveBeenCalledWith("websocket", expect.any(Function));
    });

    it("should be idempotent (calling attach twice does not double-register)", async () => {
      const { page, context } = createMockPage();
      const capture = new WebSocketCapture(page as never);

      await capture.attach();
      await capture.attach();

      expect(context.newCDPSession).toHaveBeenCalledOnce();
      // page.on should only be called once for 'websocket'.
      const wsCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([event]: string[]) => event === "websocket",
      );
      expect(wsCalls).toHaveLength(1);
    });
  });

  describe("detach", () => {
    it("should disable network, detach CDP session, and remove listener", async () => {
      const { page, cdpSession } = createMockPage();
      const capture = new WebSocketCapture(page as never);

      await capture.attach();
      await capture.detach();

      expect(cdpSession.send).toHaveBeenCalledWith("Network.disable");
      expect(cdpSession.detach).toHaveBeenCalledOnce();
      expect(page.removeListener).toHaveBeenCalledWith("websocket", expect.any(Function));
    });

    it("should be idempotent (calling detach without attach is a no-op)", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);

      // Should not throw.
      await capture.detach();

      expect(page.removeListener).not.toHaveBeenCalled();
    });

    it("should handle CDP session already closed gracefully", async () => {
      const { page, cdpSession } = createMockPage();
      const capture = new WebSocketCapture(page as never);

      await capture.attach();

      // Simulate CDP session already closed.
      cdpSession.send.mockRejectedValueOnce(new Error("Session closed"));
      cdpSession.detach.mockRejectedValueOnce(new Error("Session closed"));

      // Should not throw.
      await capture.detach();
    });
  });

  // =========================================================================
  // Frame capture
  // =========================================================================

  describe("frame capture", () => {
    it("should capture a WebSocket connection and its frames", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      // Simulate a WebSocket connection.
      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      // Simulate frames.
      ws._emit("framesent", { payload: '{"type":"hello"}' });
      ws._emit("framereceived", { payload: '{"type":"welcome"}' });

      const connections = capture.getCapturedConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].url).toBe("wss://example.com/ws");
      expect(connections[0].frames).toHaveLength(2);
      expect(connections[0].frames[0].direction).toBe("sent");
      expect(connections[0].frames[0].data).toBe('{"type":"hello"}');
      expect(connections[0].frames[1].direction).toBe("received");
      expect(connections[0].frames[1].data).toBe('{"type":"welcome"}');
    });

    it("should capture multiple WebSocket connections independently", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws1 = createMockWs("wss://example.com/ws1");
      const ws2 = createMockWs("wss://example.com/ws2");

      page._emit("websocket", ws1);
      page._emit("websocket", ws2);

      ws1._emit("framesent", { payload: "frame-from-ws1" });
      ws2._emit("framereceived", { payload: "frame-from-ws2" });

      expect(capture.getCapturedConnections()).toHaveLength(2);
      expect(capture.getConnection(0)!.url).toBe("wss://example.com/ws1");
      expect(capture.getConnection(0)!.frames).toHaveLength(1);
      expect(capture.getConnection(1)!.url).toBe("wss://example.com/ws2");
      expect(capture.getConnection(1)!.frames).toHaveLength(1);
    });

    it("should handle Buffer payloads by converting to string", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      ws._emit("framesent", { payload: Buffer.from("binary-data") });

      const conn = capture.getConnection(0);
      expect(conn).toBeDefined();
      expect(conn!.frames[0].data).toBe("binary-data");
    });

    it("should record timestamps on frames", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      const before = Date.now();
      ws._emit("framereceived", { payload: "data" });
      const after = Date.now();

      const frame = capture.getConnection(0)!.frames[0];
      expect(frame.timestamp).toBeGreaterThanOrEqual(before);
      expect(frame.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // =========================================================================
  // CDP upgrade headers
  // =========================================================================

  describe("CDP upgrade headers", () => {
    it("should capture upgrade headers from CDP and attach to connection", async () => {
      const { page, cdpSession } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      // Simulate CDP event with upgrade headers BEFORE the Playwright WS event.
      cdpSession._emit("Network.webSocketWillSendHandshakeRequest", {
        requestId: "req-1",
        request: {
          url: "wss://example.com/ws",
          headers: {
            Origin: "https://example.com",
            Cookie: "session=abc123",
          },
        },
      });

      // Now the Playwright WS event fires.
      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      const conn = capture.getConnection(0);
      expect(conn).toBeDefined();
      expect(conn!.headers).toEqual({
        Origin: "https://example.com",
        Cookie: "session=abc123",
      });
    });

    it("should backfill headers when CDP event arrives after frame", async () => {
      const { page, cdpSession } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      // Playwright WS event fires first (headers not yet known).
      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      expect(capture.getConnection(0)!.headers).toEqual({});

      // CDP event arrives later.
      cdpSession._emit("Network.webSocketWillSendHandshakeRequest", {
        requestId: "req-1",
        request: {
          url: "wss://example.com/ws",
          headers: { Authorization: "Bearer tok" },
        },
      });

      // Headers are backfilled on the next received frame.
      ws._emit("framereceived", { payload: "data" });

      expect(capture.getConnection(0)!.headers).toEqual({
        Authorization: "Bearer tok",
      });
    });
  });

  // =========================================================================
  // waitForWebSocket
  // =========================================================================

  describe("waitForWebSocket", () => {
    it("should resolve immediately when a matching connection already exists", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      // Pre-populate a connection with frames.
      const ws = createMockWs("wss://example.com/socket.io/?EIO=4");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "frame1" });
      ws._emit("framereceived", { payload: "frame2" });

      const result = await capture.waitForWebSocket({
        urlPattern: "socket\\.io",
        timeout: 1000,
      });

      expect(result.url).toBe("wss://example.com/socket.io/?EIO=4");
      expect(result.frames).toHaveLength(2);
    });

    it("should wait for frames to accumulate before resolving", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "frame1" });

      // Start waiting (needs 2 frames but only 1 exists).
      const promise = capture.waitForWebSocket({ timeout: 2000, minFrames: 2 });

      // Add second frame after a short delay.
      setTimeout(() => {
        ws._emit("framereceived", { payload: "frame2" });
      }, 150);

      const result = await promise;
      expect(result.frames.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw on timeout when no connections exist", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      await expect(
        capture.waitForWebSocket({ timeout: 200 }),
      ).rejects.toThrow(/timed out/i);
    });

    it("should throw on timeout when pattern does not match", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/other-ws");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "f1" });
      ws._emit("framereceived", { payload: "f2" });

      await expect(
        capture.waitForWebSocket({
          urlPattern: "socket\\.io",
          timeout: 200,
        }),
      ).rejects.toThrow(/timed out/i);
    });

    it("should throw on timeout when not enough frames arrive", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "only-one" });

      await expect(
        capture.waitForWebSocket({ timeout: 200, minFrames: 5 }),
      ).rejects.toThrow(/timed out/i);
    });

    it("should return the correct connection by index", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      // Create two connections matching the same pattern.
      const ws1 = createMockWs("wss://example.com/ws/1");
      const ws2 = createMockWs("wss://example.com/ws/2");

      page._emit("websocket", ws1);
      ws1._emit("framereceived", { payload: "a" });
      ws1._emit("framereceived", { payload: "b" });

      page._emit("websocket", ws2);
      ws2._emit("framereceived", { payload: "c" });
      ws2._emit("framereceived", { payload: "d" });

      const result = await capture.waitForWebSocket({
        urlPattern: "example\\.com/ws",
        index: 1,
        timeout: 1000,
      });

      expect(result.url).toBe("wss://example.com/ws/2");
    });

    it("should use default options when none are provided", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "f1" });
      ws._emit("framereceived", { payload: "f2" });

      // Should return the first connection with defaults (index=0, minFrames=2).
      const result = await capture.waitForWebSocket({ timeout: 1000 });
      expect(result.url).toBe("wss://example.com/ws");
    });

    it("should include descriptive error info on timeout", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/other");
      page._emit("websocket", ws);
      ws._emit("framereceived", { payload: "f1" });
      ws._emit("framereceived", { payload: "f2" });

      try {
        await capture.waitForWebSocket({
          urlPattern: "socket\\.io",
          timeout: 200,
        });
        expect.fail("Should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain("200ms");
        expect(message).toContain("socket\\.io");
        expect(message).toContain("1 total connection");
        expect(message).toContain("0 matching");
      }
    });
  });

  // =========================================================================
  // getCapturedConnections returns a copy
  // =========================================================================

  describe("getCapturedConnections isolation", () => {
    it("should return a shallow copy, not the internal array", async () => {
      const { page } = createMockPage();
      const capture = new WebSocketCapture(page as never);
      await capture.attach();

      const ws = createMockWs("wss://example.com/ws");
      page._emit("websocket", ws);

      const connections = capture.getCapturedConnections();
      connections.push({} as CapturedWebSocket);

      // Internal array should not be affected.
      expect(capture.getCapturedConnections()).toHaveLength(1);
    });
  });
});
