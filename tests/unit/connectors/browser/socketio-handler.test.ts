import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SocketIOHandler } from "@/lib/connectors/browser/socketio-handler";
import type { SocketIOConfig } from "@/lib/connectors/browser/types";
import WebSocket from "ws";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

/**
 * Minimal mock that emulates the subset of the `ws` WebSocket API used
 * by SocketIOHandler: `send`, `on`, `removeListener`, `readyState`,
 * and incoming `message` events.
 */
class MockWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];

  send(data: string, _cb?: (err?: Error) => void) {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = WebSocket.CLOSED;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SocketIOConfig>): SocketIOConfig {
  return {
    sid: "test-session-id",
    pingInterval: 25000,
    pingTimeout: 20000,
    version: 4,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SocketIOHandler", () => {
  let ws: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    ws = new MockWebSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Static: encodeMessage
  // =========================================================================

  describe("encodeMessage", () => {
    it("should encode a simple string payload", () => {
      const result = SocketIOHandler.encodeMessage("message", "hello");
      expect(result).toBe('42["message","hello"]');
    });

    it("should encode an object payload", () => {
      const result = SocketIOHandler.encodeMessage("message", { text: "hello" });
      expect(result).toBe('42["message",{"text":"hello"}]');
    });

    it("should encode an array payload", () => {
      const result = SocketIOHandler.encodeMessage("data", [1, 2, 3]);
      expect(result).toBe('42["data",[1,2,3]]');
    });

    it("should encode a null payload", () => {
      const result = SocketIOHandler.encodeMessage("ping", null);
      expect(result).toBe('42["ping",null]');
    });

    it("should encode a numeric payload", () => {
      const result = SocketIOHandler.encodeMessage("count", 42);
      expect(result).toBe('42["count",42]');
    });

    it("should encode a boolean payload", () => {
      const result = SocketIOHandler.encodeMessage("flag", true);
      expect(result).toBe('42["flag",true]');
    });

    it("should encode complex nested objects", () => {
      const payload = {
        user: { name: "Alice", age: 30 },
        messages: [{ id: 1, text: "hi" }],
      };
      const result = SocketIOHandler.encodeMessage("complex", payload);
      expect(result).toBe(`42["complex",${JSON.stringify(payload)}]`);
    });

    it("should produce frames that round-trip through decodeMessage", () => {
      const encoded = SocketIOHandler.encodeMessage("chat", { text: "round trip" });
      const decoded = SocketIOHandler.decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.eventName).toBe("chat");
      expect(decoded!.data).toEqual({ text: "round trip" });
    });
  });

  // =========================================================================
  // Static: decodeMessage
  // =========================================================================

  describe("decodeMessage", () => {
    it("should decode a standard event frame", () => {
      const result = SocketIOHandler.decodeMessage('42["message",{"text":"hello"}]');
      expect(result).toEqual({ eventName: "message", data: { text: "hello" } });
    });

    it("should decode a frame with string data", () => {
      const result = SocketIOHandler.decodeMessage('42["greeting","hi there"]');
      expect(result).toEqual({ eventName: "greeting", data: "hi there" });
    });

    it("should decode a frame with array data", () => {
      const result = SocketIOHandler.decodeMessage('42["numbers",[1,2,3]]');
      expect(result).toEqual({ eventName: "numbers", data: [1, 2, 3] });
    });

    it("should decode a frame with no data (event name only)", () => {
      const result = SocketIOHandler.decodeMessage('42["disconnect"]');
      expect(result).not.toBeNull();
      expect(result!.eventName).toBe("disconnect");
      expect(result!.data).toBeUndefined();
    });

    it("should decode a frame with multiple data arguments", () => {
      const result = SocketIOHandler.decodeMessage('42["multi","arg1","arg2","arg3"]');
      expect(result).not.toBeNull();
      expect(result!.eventName).toBe("multi");
      expect(result!.data).toEqual(["arg1", "arg2", "arg3"]);
    });

    it("should decode a namespaced event frame", () => {
      const result = SocketIOHandler.decodeMessage('42/admin,["update",{"id":1}]');
      expect(result).not.toBeNull();
      expect(result!.eventName).toBe("update");
      expect(result!.data).toEqual({ id: 1 });
    });

    it("should decode a frame with ack ID", () => {
      const result = SocketIOHandler.decodeMessage('4213["message",{"text":"acked"}]');
      expect(result).not.toBeNull();
      expect(result!.eventName).toBe("message");
      expect(result!.data).toEqual({ text: "acked" });
    });

    it("should decode a namespaced frame with ack ID", () => {
      const result = SocketIOHandler.decodeMessage('42/chat,5["msg",{"body":"hi"}]');
      expect(result).not.toBeNull();
      expect(result!.eventName).toBe("msg");
      expect(result!.data).toEqual({ body: "hi" });
    });

    it("should return null for non-42 frames", () => {
      expect(SocketIOHandler.decodeMessage("40")).toBeNull();
      expect(SocketIOHandler.decodeMessage("2")).toBeNull();
      expect(SocketIOHandler.decodeMessage("3")).toBeNull();
      expect(SocketIOHandler.decodeMessage('43["ack",1]')).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      expect(SocketIOHandler.decodeMessage("42{not an array}")).toBeNull();
      expect(SocketIOHandler.decodeMessage("42[")).toBeNull();
    });

    it("should return null for empty array", () => {
      expect(SocketIOHandler.decodeMessage("42[]")).toBeNull();
    });

    it("should return null for non-string event name", () => {
      expect(SocketIOHandler.decodeMessage("42[123,{}]")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(SocketIOHandler.decodeMessage("")).toBeNull();
    });

    it("should return null for very short strings", () => {
      expect(SocketIOHandler.decodeMessage("4")).toBeNull();
      expect(SocketIOHandler.decodeMessage("42")).toBeNull();
    });
  });

  // =========================================================================
  // Static: isMessageFrame
  // =========================================================================

  describe("isMessageFrame", () => {
    it("should return true for event frames", () => {
      expect(SocketIOHandler.isMessageFrame('42["message","hi"]')).toBe(true);
    });

    it("should return false for ping", () => {
      expect(SocketIOHandler.isMessageFrame("2")).toBe(false);
    });

    it("should return false for pong", () => {
      expect(SocketIOHandler.isMessageFrame("3")).toBe(false);
    });

    it("should return false for connect", () => {
      expect(SocketIOHandler.isMessageFrame("40")).toBe(false);
    });

    it("should return false for ack", () => {
      expect(SocketIOHandler.isMessageFrame('43["ack",1]')).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(SocketIOHandler.isMessageFrame("")).toBe(false);
    });

    it("should return false for non-string input", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(SocketIOHandler.isMessageFrame(null as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(SocketIOHandler.isMessageFrame(undefined as any)).toBe(false);
    });
  });

  // =========================================================================
  // Static: isPingFrame
  // =========================================================================

  describe("isPingFrame", () => {
    it('should return true for exactly "2"', () => {
      expect(SocketIOHandler.isPingFrame("2")).toBe(true);
    });

    it("should return false for pong", () => {
      expect(SocketIOHandler.isPingFrame("3")).toBe(false);
    });

    it("should return false for message starting with 2", () => {
      expect(SocketIOHandler.isPingFrame("2probe")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(SocketIOHandler.isPingFrame("")).toBe(false);
    });
  });

  // =========================================================================
  // Static: getPacketType
  // =========================================================================

  describe("getPacketType", () => {
    it("should return 0 for open packet", () => {
      expect(SocketIOHandler.getPacketType('0{"sid":"abc"}')).toBe(0);
    });

    it("should return 1 for close packet", () => {
      expect(SocketIOHandler.getPacketType("1")).toBe(1);
    });

    it("should return 2 for ping", () => {
      expect(SocketIOHandler.getPacketType("2")).toBe(2);
    });

    it("should return 3 for pong", () => {
      expect(SocketIOHandler.getPacketType("3")).toBe(3);
    });

    it("should return 4 for message", () => {
      expect(SocketIOHandler.getPacketType('42["event",{}]')).toBe(4);
    });

    it("should return 5 for upgrade", () => {
      expect(SocketIOHandler.getPacketType("5")).toBe(5);
    });

    it("should return 6 for noop", () => {
      expect(SocketIOHandler.getPacketType("6")).toBe(6);
    });

    it("should return -1 for empty string", () => {
      expect(SocketIOHandler.getPacketType("")).toBe(-1);
    });

    it("should return -1 for non-numeric first char", () => {
      expect(SocketIOHandler.getPacketType("hello")).toBe(-1);
    });

    it("should return -1 for non-string input", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(SocketIOHandler.getPacketType(null as any)).toBe(-1);
    });
  });

  // =========================================================================
  // Heartbeat behaviour
  // =========================================================================

  describe("heartbeat", () => {
    it("should send pong when ping is received", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();

      // Simulate server sending a ping.
      ws.emit("message", "2");

      expect(ws.sent).toContain("3");
      handler.stop();
    });

    it("should send pong for multiple consecutive pings", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();

      ws.emit("message", "2");
      ws.emit("message", "2");
      ws.emit("message", "2");

      const pongs = ws.sent.filter((s) => s === "3");
      expect(pongs).toHaveLength(3);
      handler.stop();
    });

    it("should close WebSocket if no ping within pingInterval + pingTimeout", () => {
      const closeSpy = vi.spyOn(ws, "close");
      const config = makeConfig({ pingInterval: 1000, pingTimeout: 500 });
      const handler = new SocketIOHandler(ws as unknown as WebSocket, config);
      handler.start();

      // Advance past the deadline (1000 + 500 = 1500ms).
      vi.advanceTimersByTime(1501);

      expect(closeSpy).toHaveBeenCalledWith(4000, "Ping timeout");
      handler.stop();
    });

    it("should reset the timeout when a ping is received", () => {
      const closeSpy = vi.spyOn(ws, "close");
      const config = makeConfig({ pingInterval: 1000, pingTimeout: 500 });
      const handler = new SocketIOHandler(ws as unknown as WebSocket, config);
      handler.start();

      // Advance 1400ms (almost at the 1500ms deadline).
      vi.advanceTimersByTime(1400);
      expect(closeSpy).not.toHaveBeenCalled();

      // Receive a ping — should reset the timer.
      ws.emit("message", "2");

      // Advance another 1400ms — we're now at 2800ms total but only 1400ms
      // since the last ping, which is before the 1500ms deadline.
      vi.advanceTimersByTime(1400);
      expect(closeSpy).not.toHaveBeenCalled();

      // Advance past the new deadline.
      vi.advanceTimersByTime(200);
      expect(closeSpy).toHaveBeenCalled();
      handler.stop();
    });
  });

  // =========================================================================
  // Namespace connect
  // =========================================================================

  describe("namespace connect", () => {
    it("should send 40 for default namespace on start", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();

      expect(ws.sent).toContain("40");
      handler.stop();
    });

    it("should send 40/namespace, for custom namespace", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        namespace: "/admin",
      });
      handler.start();

      expect(ws.sent).toContain("40/admin,");
      handler.stop();
    });

    it("should not send connect when WS is not open", () => {
      ws.readyState = WebSocket.CLOSED;
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();

      // 40 should not be present since the WS is closed.
      expect(ws.sent.filter((s) => s.startsWith("40"))).toHaveLength(0);
      handler.stop();
    });
  });

  // =========================================================================
  // Frame handling
  // =========================================================================

  describe("frame handling", () => {
    it("should invoke onMessage for Socket.IO event frames", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();

      ws.emit("message", '42["message",{"text":"Wie kann ich Ihnen helfen?"}]');

      expect(onMessage).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(onMessage.mock.calls[0][0]);
      expect(parsed.eventName).toBe("message");
      expect(parsed.data).toEqual({ text: "Wie kann ich Ihnen helfen?" });
      handler.stop();
    });

    it("should invoke onError for Socket.IO error frames", () => {
      const onError = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onError,
      });
      handler.start();

      ws.emit("message", '44{"message":"Unauthorized"}');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBe('{"message":"Unauthorized"}');
      handler.stop();
    });

    it("should stop handler on Engine.IO close frame", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();

      ws.emit("message", "1");

      // After receiving close, further pings should not produce pongs.
      const sentBefore = ws.sent.length;
      ws.emit("message", "2");
      expect(ws.sent.length).toBe(sentBefore);
    });

    it("should stop handler on Socket.IO disconnect frame", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();

      ws.emit("message", "41");

      // After disconnect, events should not be forwarded.
      ws.emit("message", '42["message","after disconnect"]');
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("should ignore noop frames", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();

      ws.emit("message", "6");

      expect(onMessage).not.toHaveBeenCalled();
      handler.stop();
    });

    it("should ignore empty frames", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();

      ws.emit("message", "");

      expect(onMessage).not.toHaveBeenCalled();
      handler.stop();
    });

    it("should handle Socket.IO connect ack frame (40) gracefully", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();

      // Server acknowledges namespace connect — should not throw or trigger onMessage.
      ws.emit("message", "40");

      expect(onMessage).not.toHaveBeenCalled();
      handler.stop();
    });
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe("lifecycle", () => {
    it("should not start twice", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();
      handler.start(); // Should be a no-op.

      // Only one `40` connect packet should be sent.
      const connects = ws.sent.filter((s) => s === "40");
      expect(connects).toHaveLength(1);
      handler.stop();
    });

    it("should clean up listeners on stop", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();
      handler.stop();

      const listenerCount = ws.listenerCount("message");
      // The handler's listener should be removed.
      expect(listenerCount).toBe(0);
    });

    it("should not process frames after stop", () => {
      const onMessage = vi.fn();
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage,
      });
      handler.start();
      handler.stop();

      ws.emit("message", '42["message","after stop"]');
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("stop should be idempotent", () => {
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig());
      handler.start();
      handler.stop();
      handler.stop(); // Should not throw.
    });
  });

  // =========================================================================
  // Real-world sequence (Lidl-style)
  // =========================================================================

  describe("real-world Socket.IO sequence", () => {
    it("should handle a complete Lidl-style conversation flow", () => {
      const messages: string[] = [];
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage: (data) => messages.push(data),
      });
      handler.start();

      // 1. Server sends namespace connect ack.
      ws.emit("message", "40");

      // 2. Server sends a welcome event.
      ws.emit("message", '42["message",{"text":"Wie kann ich Ihnen helfen?"}]');

      // 3. Client sends a message (done externally, not via handler).
      // ws.send('42["message",{"text":"Was kostet das?"}]');

      // 4. Server sends a response event.
      ws.emit("message", '42["message",{"text":"Das kostet 5,99 EUR."}]');

      // 5. Server sends ping.
      ws.emit("message", "2");

      // 6. Verify pong was sent.
      expect(ws.sent.filter((s) => s === "3")).toHaveLength(1);

      // 7. Another ping.
      ws.emit("message", "2");
      expect(ws.sent.filter((s) => s === "3")).toHaveLength(2);

      // 8. Verify all messages were received.
      expect(messages).toHaveLength(2);

      const first = JSON.parse(messages[0]);
      expect(first.eventName).toBe("message");
      expect(first.data.text).toBe("Wie kann ich Ihnen helfen?");

      const second = JSON.parse(messages[1]);
      expect(second.eventName).toBe("message");
      expect(second.data.text).toBe("Das kostet 5,99 EUR.");

      handler.stop();
    });

    it("should handle handshake + connect + events + heartbeat", () => {
      const messages: string[] = [];
      const handler = new SocketIOHandler(ws as unknown as WebSocket, makeConfig(), {
        onMessage: (data) => messages.push(data),
      });
      handler.start();

      // Handshake (0-packet) is normally handled before SocketIOHandler is
      // created, but if it arrives we should not crash.
      ws.emit(
        "message",
        '0{"sid":"abc","upgrades":[],"pingInterval":25000,"pingTimeout":20000}',
      );

      ws.emit("message", "40");
      ws.emit("message", '42["welcome",{"msg":"Willkommen!"}]');
      ws.emit("message", "2"); // ping
      ws.emit("message", '42["response",{"answer":"42"}]');

      // Pong was sent.
      expect(ws.sent).toContain("3");

      // Two event messages received.
      expect(messages).toHaveLength(2);

      handler.stop();
    });
  });
});
