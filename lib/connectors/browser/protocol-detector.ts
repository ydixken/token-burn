import type { CapturedFrame, SocketIOConfig } from "./types";

/**
 * Engine.IO packet type constants.
 *
 * These are the single-digit prefixes used in Engine.IO's text-based framing:
 *   0 = open (server sends handshake JSON)
 *   1 = close
 *   2 = ping  (server → client)
 *   3 = pong  (client → server)
 *   4 = message (payload follows)
 *   5 = upgrade
 *   6 = noop
 */
const ENGINE_IO_PACKET = {
  OPEN: 0,
  CLOSE: 1,
  PING: 2,
  PONG: 3,
  MESSAGE: 4,
  UPGRADE: 5,
  NOOP: 6,
} as const;

/**
 * Socket.IO packet type constants (carried inside Engine.IO message frames).
 *
 * A Socket.IO packet is an Engine.IO MESSAGE (4) followed by one of these digits:
 *   40 = CONNECT      (join namespace)
 *   41 = DISCONNECT
 *   42 = EVENT         (e.g., 42["message",{...}])
 *   43 = ACK
 *   44 = CONNECT_ERROR
 */
const SOCKET_IO_PACKET = {
  CONNECT: 0,
  DISCONNECT: 1,
  EVENT: 2,
  ACK: 3,
  CONNECT_ERROR: 4,
} as const;

/**
 * ProtocolDetector
 *
 * Analyses captured WebSocket URLs and initial frames to determine whether the
 * connection is using raw WebSocket or Socket.IO (built on top of Engine.IO).
 *
 * Detection heuristics (in priority order):
 * 1. URL contains `/socket.io/` path segment or `EIO=` query parameter.
 * 2. First received frame starts with `0{` (Engine.IO OPEN / handshake).
 * 3. Frames use Engine.IO framing patterns (ping `2`, pong `3`, message `42`…).
 */
export class ProtocolDetector {
  /**
   * Detect the protocol from a URL and an array of captured frames.
   *
   * Returns the detected protocol (`'socket.io'` or `'raw'`) and, when the
   * protocol is Socket.IO and a handshake frame is found, the parsed config.
   */
  static detect(
    url: string,
    frames: CapturedFrame[],
  ): {
    protocol: "socket.io" | "raw";
    socketIoConfig?: SocketIOConfig;
  } {
    // Fast-path: URL-based detection is the most reliable signal.
    const urlMatch = ProtocolDetector.isSocketIOUrl(url);

    // Try to find & parse a handshake frame (Engine.IO OPEN packet: `0{...}`).
    let socketIoConfig: SocketIOConfig | null = null;
    for (const frame of frames) {
      if (frame.direction === "received") {
        const parsed = ProtocolDetector.parseHandshake(frame.data);
        if (parsed) {
          socketIoConfig = parsed;
          break;
        }
      }
    }

    // If we found a handshake, we can be confident it's Socket.IO.
    if (socketIoConfig) {
      // Attempt to detect EIO version from URL; fall back to config value.
      const eioVersion = ProtocolDetector.detectEIOVersion(url);
      if (eioVersion > 0) {
        socketIoConfig = { ...socketIoConfig, version: eioVersion };
      }
      return { protocol: "socket.io", socketIoConfig };
    }

    // URL matched Socket.IO pattern — even without a handshake frame we'll
    // classify it, since the handshake may not have been captured.
    if (urlMatch) {
      const eioVersion = ProtocolDetector.detectEIOVersion(url);
      return {
        protocol: "socket.io",
        socketIoConfig: {
          sid: "",
          pingInterval: 25000,
          pingTimeout: 20000,
          version: eioVersion || 4,
        },
      };
    }

    // Frame-pattern based detection (last resort, less reliable).
    if (ProtocolDetector.hasSocketIOFramePatterns(frames)) {
      return {
        protocol: "socket.io",
        socketIoConfig: {
          sid: "",
          pingInterval: 25000,
          pingTimeout: 20000,
          version: 4,
        },
      };
    }

    return { protocol: "raw" };
  }

  /**
   * Check whether a URL looks like a Socket.IO endpoint.
   *
   * Positive signals:
   *  - Path contains `socket.io` (e.g. `/socket.io/?EIO=4&transport=websocket`)
   *  - Query string contains `EIO=` (Engine.IO version parameter)
   */
  private static isSocketIOUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const pathLower = parsed.pathname.toLowerCase();
      if (pathLower.includes("socket.io")) {
        return true;
      }
      if (parsed.searchParams.has("EIO")) {
        return true;
      }
      // Also check case-insensitive query string (some servers use lowercase)
      const queryLower = parsed.search.toLowerCase();
      if (queryLower.includes("eio=")) {
        return true;
      }
      return false;
    } catch {
      // If URL parsing fails, do a simple string search.
      const lower = url.toLowerCase();
      return lower.includes("socket.io") || /[?&]eio=/i.test(lower);
    }
  }

  /**
   * Parse a Socket.IO handshake frame.
   *
   * Engine.IO OPEN packets look like:
   *   `0{"sid":"abc123","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`
   *
   * The leading `0` is the Engine.IO OPEN packet type.
   *
   * Returns a SocketIOConfig if the frame is a valid handshake, or `null`.
   */
  static parseHandshake(frame: string): SocketIOConfig | null {
    if (typeof frame !== "string" || frame.length < 2) {
      return null;
    }

    // Must start with '0' (Engine.IO OPEN) followed by '{'.
    if (frame.charAt(0) !== String(ENGINE_IO_PACKET.OPEN) || frame.charAt(1) !== "{") {
      return null;
    }

    try {
      const json = JSON.parse(frame.slice(1));

      // Validate required fields.
      if (typeof json.sid !== "string") {
        return null;
      }

      return {
        sid: json.sid,
        pingInterval: typeof json.pingInterval === "number" ? json.pingInterval : 25000,
        pingTimeout: typeof json.pingTimeout === "number" ? json.pingTimeout : 20000,
        version: typeof json.version === "number" ? json.version : 4,
      };
    } catch {
      return null;
    }
  }

  /**
   * Detect the Engine.IO protocol version from the URL's `EIO` query param.
   *
   * Returns the numeric version (e.g. 3 or 4) or 0 if not found.
   */
  private static detectEIOVersion(url: string): number {
    try {
      const parsed = new URL(url);
      const eio = parsed.searchParams.get("EIO");
      if (eio !== null) {
        const version = parseInt(eio, 10);
        return Number.isFinite(version) && version > 0 ? version : 0;
      }
    } catch {
      // Fall back to regex for malformed URLs.
      const match = url.match(/[?&]EIO=(\d+)/i);
      if (match) {
        const version = parseInt(match[1], 10);
        return Number.isFinite(version) && version > 0 ? version : 0;
      }
    }
    return 0;
  }

  /**
   * Check whether the captured frames contain patterns characteristic of
   * Socket.IO / Engine.IO communication.
   *
   * We look for:
   *  - Ping frames: exactly `"2"`
   *  - Pong frames: exactly `"3"`
   *  - Socket.IO event frames: start with `"42"`
   *  - Socket.IO connect frames: exactly `"40"` or starts with `"40/"`
   *  - Engine.IO noop: exactly `"6"`
   *
   * We require at least 2 distinct signals to reduce false positives (a raw
   * WS server could conceivably send single-character messages).
   */
  private static hasSocketIOFramePatterns(frames: CapturedFrame[]): boolean {
    let signals = 0;
    let hasPing = false;
    let hasPong = false;
    let hasEvent = false;
    let hasConnect = false;
    let hasNoop = false;

    for (const frame of frames) {
      const data = frame.data;
      if (typeof data !== "string" || data.length === 0) {
        continue;
      }

      // Ping (server → client, but we check both directions)
      if (!hasPing && data === "2") {
        hasPing = true;
        signals++;
      }

      // Pong
      if (!hasPong && data === "3") {
        hasPong = true;
        signals++;
      }

      // Socket.IO event frame: 42[...]
      if (
        !hasEvent &&
        data.length >= 3 &&
        data.charAt(0) === "4" &&
        data.charAt(1) === "2" &&
        data.charAt(2) === "["
      ) {
        hasEvent = true;
        signals++;
      }

      // Socket.IO connect: exactly "40" or "40/namespace,{...}"
      if (!hasConnect && (data === "40" || data.startsWith("40/"))) {
        hasConnect = true;
        signals++;
      }

      // Engine.IO noop
      if (!hasNoop && data === "6") {
        hasNoop = true;
        signals++;
      }

      // Early exit once we have enough confidence.
      if (signals >= 2) {
        return true;
      }
    }

    return false;
  }
}
