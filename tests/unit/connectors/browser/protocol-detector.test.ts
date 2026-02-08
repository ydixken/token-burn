import { describe, it, expect } from "vitest";
import { ProtocolDetector } from "@/lib/connectors/browser/protocol-detector";
import type { CapturedFrame } from "@/lib/connectors/browser/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frame(direction: "sent" | "received", data: string, timestamp = Date.now()): CapturedFrame {
  return { direction, data, timestamp };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProtocolDetector", () => {
  // =========================================================================
  // URL-based detection
  // =========================================================================

  describe("URL-based detection", () => {
    it("should detect Socket.IO v4 from URL with EIO=4", () => {
      const result = ProtocolDetector.detect(
        "wss://example.com/socket.io/?EIO=4&transport=websocket",
        [],
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.version).toBe(4);
    });

    it("should detect Socket.IO v3 from URL with EIO=3", () => {
      const result = ProtocolDetector.detect(
        "wss://example.com/socket.io/?EIO=3&transport=websocket",
        [],
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.version).toBe(3);
    });

    it("should detect Socket.IO from socket.io in URL path", () => {
      const result = ProtocolDetector.detect(
        "wss://chat.example.com/socket.io/?transport=websocket",
        [],
      );
      expect(result.protocol).toBe("socket.io");
    });

    it("should detect Socket.IO from case-insensitive EIO param", () => {
      const result = ProtocolDetector.detect(
        "wss://example.com/ws?eio=4&transport=websocket",
        [],
      );
      expect(result.protocol).toBe("socket.io");
    });

    it("should detect Socket.IO from EIO param without socket.io path", () => {
      const result = ProtocolDetector.detect(
        "wss://example.com/chat?EIO=4&transport=websocket&sid=abc",
        [],
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig!.version).toBe(4);
    });

    it("should return raw protocol for plain WS URL", () => {
      const result = ProtocolDetector.detect("wss://example.com/ws/chat", []);
      expect(result.protocol).toBe("raw");
      expect(result.socketIoConfig).toBeUndefined();
    });

    it("should return raw for URL without any Socket.IO signals", () => {
      const result = ProtocolDetector.detect("wss://api.example.com/v1/stream", []);
      expect(result.protocol).toBe("raw");
    });
  });

  // =========================================================================
  // Handshake parsing
  // =========================================================================

  describe("parseHandshake", () => {
    it("should parse a valid Engine.IO open handshake", () => {
      const handshake = '0{"sid":"xB7m2JLF-Vt1AAAA","upgrades":[],"pingInterval":25000,"pingTimeout":20000}';
      const config = ProtocolDetector.parseHandshake(handshake);

      expect(config).not.toBeNull();
      expect(config!.sid).toBe("xB7m2JLF-Vt1AAAA");
      expect(config!.pingInterval).toBe(25000);
      expect(config!.pingTimeout).toBe(20000);
    });

    it("should parse handshake with extra fields", () => {
      const handshake = '0{"sid":"abc123","upgrades":["websocket"],"pingInterval":30000,"pingTimeout":10000,"maxPayload":100000}';
      const config = ProtocolDetector.parseHandshake(handshake);

      expect(config).not.toBeNull();
      expect(config!.sid).toBe("abc123");
      expect(config!.pingInterval).toBe(30000);
      expect(config!.pingTimeout).toBe(10000);
    });

    it("should use defaults for missing optional numeric fields", () => {
      const handshake = '0{"sid":"test-sid"}';
      const config = ProtocolDetector.parseHandshake(handshake);

      expect(config).not.toBeNull();
      expect(config!.sid).toBe("test-sid");
      expect(config!.pingInterval).toBe(25000);
      expect(config!.pingTimeout).toBe(20000);
    });

    it("should return null for frame not starting with 0{", () => {
      expect(ProtocolDetector.parseHandshake('1{"sid":"abc"}')).toBeNull();
      expect(ProtocolDetector.parseHandshake('4{"sid":"abc"}')).toBeNull();
      expect(ProtocolDetector.parseHandshake('{"sid":"abc"}')).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      expect(ProtocolDetector.parseHandshake("0{invalid json}")).toBeNull();
      expect(ProtocolDetector.parseHandshake("0{")).toBeNull();
      expect(ProtocolDetector.parseHandshake("0")).toBeNull();
    });

    it("should return null for missing sid", () => {
      expect(ProtocolDetector.parseHandshake('0{"pingInterval":25000}')).toBeNull();
    });

    it("should return null for non-string sid", () => {
      expect(ProtocolDetector.parseHandshake('0{"sid":12345}')).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(ProtocolDetector.parseHandshake("")).toBeNull();
    });

    it("should return null for non-string input", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(ProtocolDetector.parseHandshake(null as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(ProtocolDetector.parseHandshake(undefined as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(ProtocolDetector.parseHandshake(42 as any)).toBeNull();
    });
  });

  // =========================================================================
  // Detection from frames
  // =========================================================================

  describe("detection from frames", () => {
    it("should detect Socket.IO from handshake frame in captured frames", () => {
      const frames: CapturedFrame[] = [
        frame("received", '0{"sid":"abc123","upgrades":[],"pingInterval":25000,"pingTimeout":20000}'),
        frame("received", "40"),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.sid).toBe("abc123");
      expect(result.socketIoConfig!.pingInterval).toBe(25000);
    });

    it("should detect Socket.IO from frame patterns (ping + event)", () => {
      const frames: CapturedFrame[] = [
        frame("received", "2"),
        frame("sent", "3"),
        frame("received", '42["message",{"text":"Hello!"}]'),
      ];

      const result = ProtocolDetector.detect("wss://example.com/chat", frames);
      expect(result.protocol).toBe("socket.io");
    });

    it("should detect Socket.IO from connect + event patterns", () => {
      const frames: CapturedFrame[] = [
        frame("received", "40"),
        frame("received", '42["welcome",{"msg":"Hi"}]'),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("socket.io");
    });

    it("should not false-positive from a single Socket.IO-like frame", () => {
      // A single "2" or "3" could be a raw WS message, so we require >= 2 signals.
      const frames: CapturedFrame[] = [frame("received", "2")];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should return raw when frames don't match Socket.IO patterns", () => {
      const frames: CapturedFrame[] = [
        frame("sent", '{"type":"subscribe","channel":"updates"}'),
        frame("received", '{"type":"data","payload":[1,2,3]}'),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should only parse handshake from received frames", () => {
      const frames: CapturedFrame[] = [
        // Sent frame with handshake-like data — should be ignored.
        frame("sent", '0{"sid":"fake","upgrades":[],"pingInterval":25000,"pingTimeout":20000}'),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should use EIO version from URL even when handshake is in frames", () => {
      const frames: CapturedFrame[] = [
        frame("received", '0{"sid":"abc123","upgrades":[],"pingInterval":25000,"pingTimeout":20000}'),
      ];

      const result = ProtocolDetector.detect(
        "wss://example.com/socket.io/?EIO=3&transport=websocket",
        frames,
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig!.version).toBe(3);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe("edge cases", () => {
    it("should handle empty frames array", () => {
      const result = ProtocolDetector.detect("wss://example.com/ws", []);
      expect(result.protocol).toBe("raw");
    });

    it("should handle frames with empty data", () => {
      const frames: CapturedFrame[] = [
        frame("received", ""),
        frame("sent", ""),
      ];
      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should handle binary-like string frames", () => {
      const frames: CapturedFrame[] = [
        frame("received", "\x00\x01\x02\x03"),
        frame("sent", "\xff\xfe"),
      ];
      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should handle very long frames without crashing", () => {
      const longPayload = "x".repeat(100000);
      const frames: CapturedFrame[] = [frame("received", longPayload)];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("raw");
    });

    it("should handle real-world Lidl-style Socket.IO sequence", () => {
      const frames: CapturedFrame[] = [
        frame("received", '0{"sid":"dG9rZW4x","upgrades":[],"pingInterval":25000,"pingTimeout":20000}'),
        frame("received", "40"),
        frame("sent", '42["message",{"text":"Hallo"}]'),
        frame("received", '42["message",{"text":"Wie kann ich Ihnen helfen?"}]'),
        frame("received", "2"),
        frame("sent", "3"),
        frame("received", "2"),
        frame("sent", "3"),
      ];

      const result = ProtocolDetector.detect(
        "wss://chat.lidl.com/socket.io/?EIO=4&transport=websocket",
        frames,
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.sid).toBe("dG9rZW4x");
      expect(result.socketIoConfig!.pingInterval).toBe(25000);
      expect(result.socketIoConfig!.pingTimeout).toBe(20000);
      expect(result.socketIoConfig!.version).toBe(4);
    });

    it("should handle noop frames as a Socket.IO signal", () => {
      const frames: CapturedFrame[] = [
        frame("received", "6"),
        frame("received", "2"),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("socket.io");
    });

    it("should handle Socket.IO namespace connect frame", () => {
      const frames: CapturedFrame[] = [
        frame("received", "40/admin,"),
        frame("received", '42["data",{}]'),
      ];

      const result = ProtocolDetector.detect("wss://example.com/ws", frames);
      expect(result.protocol).toBe("socket.io");
    });

    it("should provide default config when URL matches but no frames", () => {
      const result = ProtocolDetector.detect(
        "wss://example.com/socket.io/?EIO=4&transport=websocket",
        [],
      );
      expect(result.protocol).toBe("socket.io");
      expect(result.socketIoConfig).toBeDefined();
      expect(result.socketIoConfig!.sid).toBe("");
      expect(result.socketIoConfig!.pingInterval).toBe(25000);
      expect(result.socketIoConfig!.pingTimeout).toBe(20000);
      expect(result.socketIoConfig!.version).toBe(4);
    });
  });
});
