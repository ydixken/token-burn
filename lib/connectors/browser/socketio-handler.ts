import WebSocket from "ws";
import type { SocketIOConfig } from "./types";

/**
 * Engine.IO packet type codes (text framing).
 */
const EIO = {
  OPEN: 0,
  CLOSE: 1,
  PING: 2,
  PONG: 3,
  MESSAGE: 4,
  UPGRADE: 5,
  NOOP: 6,
} as const;

/**
 * Socket.IO packet type codes (nested inside Engine.IO MESSAGE packets).
 *
 * On the wire a Socket.IO CONNECT looks like `40`, an EVENT like `42["name", data]`, etc.
 */
const SIO = {
  CONNECT: 0,
  DISCONNECT: 1,
  EVENT: 2,
  ACK: 3,
  CONNECT_ERROR: 4,
} as const;

export interface SocketIOHandlerOptions {
  /** Socket.IO namespace to connect to. Defaults to `"/"` (default namespace). */
  namespace?: string;
  /** Callback invoked when a decoded Socket.IO event message is received. */
  onMessage?: (data: string) => void;
  /** Callback invoked when a Socket.IO error frame (`44`) is received. */
  onError?: (error: string) => void;
}

/**
 * SocketIOHandler
 *
 * Manages the Engine.IO / Socket.IO text-based framing on top of a raw
 * WebSocket connection. Responsibilities:
 *
 *  - **Heartbeat**: Responds to server pings (`2`) with pongs (`3`), and
 *    monitors for missed pings based on `pingInterval + pingTimeout`.
 *  - **Namespace connect**: Sends a `40` (or `40/ns,`) packet after the
 *    underlying WebSocket opens.
 *  - **Message encoding/decoding**: Translates between application-level
 *    event payloads and the Socket.IO wire format (`42["event", data]`).
 *  - **Lifecycle**: Cleans up timers and listeners on `stop()`.
 */
export class SocketIOHandler {
  private ws: WebSocket;
  private config: SocketIOConfig;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingTimeoutTimer: NodeJS.Timeout | null = null;
  private namespace: string;
  private onMessage: (data: string) => void;
  private onError: (error: string) => void;
  private messageListener: ((data: WebSocket.RawData) => void) | null = null;
  private started = false;

  constructor(ws: WebSocket, config: SocketIOConfig, options?: SocketIOHandlerOptions) {
    this.ws = ws;
    this.config = config;
    this.namespace = options?.namespace ?? "/";
    this.onMessage = options?.onMessage ?? (() => {});
    this.onError = options?.onError ?? (() => {});
  }

  /**
   * Start handling the Socket.IO protocol over the WebSocket.
   *
   * 1. Registers a `message` listener on the underlying WS to process
   *    incoming Engine.IO / Socket.IO frames.
   * 2. Sends a namespace CONNECT packet (`40`).
   * 3. Starts the heartbeat monitor.
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    // Attach the raw frame listener.
    this.messageListener = (rawData: WebSocket.RawData) => {
      const data = rawData.toString();
      this.handleFrame(data);
    };
    this.ws.on("message", this.messageListener);

    // Connect to the requested namespace.
    this.connectNamespace();

    // Begin heartbeat monitoring.
    this.startHeartbeat();
  }

  /**
   * Stop handling the Socket.IO protocol.
   *
   * Clears all timers and removes the message listener so this handler can
   * be safely garbage-collected without leaking resources.
   */
  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
      this.pingTimeoutTimer = null;
    }
    if (this.messageListener) {
      this.ws.removeListener("message", this.messageListener);
      this.messageListener = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Static helpers — encoding / decoding
  // ---------------------------------------------------------------------------

  /**
   * Encode a user message as a Socket.IO EVENT frame.
   *
   * @param eventName - The Socket.IO event name (e.g. `"message"`).
   * @param payload   - Arbitrary data to send with the event.
   * @returns The encoded wire string, e.g. `'42["message",{"text":"hello"}]'`.
   *
   * The `4` prefix is the Engine.IO MESSAGE type, and the `2` is the
   * Socket.IO EVENT type.
   */
  static encodeMessage(eventName: string, payload: unknown): string {
    const arr = [eventName, payload];
    return `${EIO.MESSAGE}${SIO.EVENT}${JSON.stringify(arr)}`;
  }

  /**
   * Decode a Socket.IO EVENT frame to extract the event name and data.
   *
   * @param frame - Raw frame string, e.g. `'42["message",{"text":"hello"}]'`.
   * @returns The decoded event, or `null` if the frame is not a valid event.
   *
   * Handles optional namespace and ack-id prefixes:
   *  - `42["event",data]`          — default namespace, no ack
   *  - `42/admin,["event",data]`   — `/admin` namespace, no ack
   *  - `421["event",data]`         — default namespace, ack id 1
   *  - `42/admin,1["event",data]`  — `/admin` namespace, ack id 1
   */
  static decodeMessage(frame: string): { eventName: string; data: unknown } | null {
    if (!SocketIOHandler.isMessageFrame(frame)) {
      return null;
    }

    // Strip the `42` prefix.
    let rest = frame.slice(2);

    // Handle optional namespace prefix: `/namespace,`
    if (rest.startsWith("/")) {
      const commaIndex = rest.indexOf(",");
      if (commaIndex === -1) {
        return null;
      }
      rest = rest.slice(commaIndex + 1);
    }

    // Handle optional ack ID (digits before the `[`).
    const bracketIndex = rest.indexOf("[");
    if (bracketIndex === -1) {
      return null;
    }
    rest = rest.slice(bracketIndex);

    try {
      const parsed = JSON.parse(rest);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return null;
      }

      const [eventName, ...dataParts] = parsed;
      if (typeof eventName !== "string") {
        return null;
      }

      // Socket.IO typically sends [eventName, data] but may also send
      // [eventName, data1, data2, ...] for multi-arg events.
      const data = dataParts.length === 1 ? dataParts[0] : dataParts.length === 0 ? undefined : dataParts;
      return { eventName, data };
    } catch {
      return null;
    }
  }

  /**
   * Check if a frame is a Socket.IO EVENT (starts with `"42"`).
   */
  static isMessageFrame(frame: string): boolean {
    return (
      typeof frame === "string" &&
      frame.length >= 3 &&
      frame.charAt(0) === String(EIO.MESSAGE) &&
      frame.charAt(1) === String(SIO.EVENT)
    );
  }

  /**
   * Check if a frame is an Engine.IO PING (exactly `"2"`).
   */
  static isPingFrame(frame: string): boolean {
    return frame === String(EIO.PING);
  }

  /**
   * Get the Engine.IO packet type from the first character of a frame.
   *
   * Returns -1 if the frame is empty or non-numeric.
   */
  static getPacketType(frame: string): number {
    if (typeof frame !== "string" || frame.length === 0) {
      return -1;
    }
    const code = frame.charCodeAt(0) - 48; // '0' = 48
    if (code >= 0 && code <= 9) {
      return code;
    }
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Private — frame handling
  // ---------------------------------------------------------------------------

  /**
   * Route an incoming raw Engine.IO frame to the appropriate handler.
   */
  private handleFrame(data: string): void {
    if (typeof data !== "string" || data.length === 0) {
      return;
    }

    const packetType = SocketIOHandler.getPacketType(data);

    switch (packetType) {
      case EIO.PING:
        this.sendPong();
        this.resetPingTimeout();
        break;

      case EIO.PONG:
        // Server acknowledged our ping — reset timeout.
        this.resetPingTimeout();
        break;

      case EIO.CLOSE:
        this.stop();
        break;

      case EIO.NOOP:
        // Nothing to do.
        break;

      case EIO.MESSAGE:
        this.handleSocketIOPacket(data);
        break;

      default:
        // Unknown or unsupported packet type — ignore silently.
        break;
    }
  }

  /**
   * Handle a Socket.IO packet (carried inside an Engine.IO MESSAGE frame).
   */
  private handleSocketIOPacket(data: string): void {
    if (data.length < 2) {
      return;
    }

    const sioType = parseInt(data.charAt(1), 10);

    switch (sioType) {
      case SIO.CONNECT:
        // Namespace connect acknowledgement — nothing extra to do.
        break;

      case SIO.DISCONNECT:
        this.stop();
        break;

      case SIO.EVENT: {
        const decoded = SocketIOHandler.decodeMessage(data);
        if (decoded) {
          this.onMessage(JSON.stringify(decoded));
        }
        break;
      }

      case SIO.ACK:
        // ACK handling could be extended; for now, pass raw frame.
        break;

      case SIO.CONNECT_ERROR: {
        // Error payload is the JSON after `44`.
        const errorPayload = data.slice(2);
        this.onError(errorPayload || "Socket.IO connection error");
        break;
      }

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — heartbeat
  // ---------------------------------------------------------------------------

  /**
   * Start the heartbeat monitor.
   *
   * Engine.IO servers send PING (`2`) at `pingInterval` intervals. If the
   * client doesn't respond with PONG (`3`) within `pingTimeout`, the server
   * closes the connection.
   *
   * We set up a safety timer at `pingInterval + pingTimeout` — if we don't
   * hear a ping within that window the connection is probably dead.
   */
  private startHeartbeat(): void {
    this.resetPingTimeout();
  }

  /**
   * Reset (restart) the ping-timeout safety timer.
   *
   * Called whenever we receive a PING or PONG from the server, proving the
   * connection is still alive.
   */
  private resetPingTimeout(): void {
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
    }

    const deadline = this.config.pingInterval + this.config.pingTimeout;

    this.pingTimeoutTimer = setTimeout(() => {
      // Connection appears dead — the server didn't ping in time.
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(4000, "Ping timeout");
      }
      this.stop();
    }, deadline);

    // Ensure the timer doesn't keep the Node process alive.
    if (this.pingTimeoutTimer && typeof this.pingTimeoutTimer === "object" && "unref" in this.pingTimeoutTimer) {
      this.pingTimeoutTimer.unref();
    }
  }

  /**
   * Send a namespace CONNECT packet.
   *
   * Default namespace (`/`) → `"40"`
   * Custom namespace         → `"40/namespace,"`
   */
  private connectNamespace(): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.namespace === "/") {
      this.ws.send("40");
    } else {
      this.ws.send(`40${this.namespace},`);
    }
  }

  /**
   * Respond to a server PING with a PONG.
   */
  private sendPong(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(String(EIO.PONG));
    }
  }
}
