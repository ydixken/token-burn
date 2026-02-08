import WebSocket from "ws";
import { BaseConnector, ConnectorConfig, ConnectorResponse, HealthStatus, MessageMetadata } from "./base";
import { ConnectorRegistry } from "./registry";

/**
 * WebSocket Connector
 *
 * Handles real-time bidirectional communication with chatbot APIs via WebSocket protocol.
 * Supports connection management, message queuing, and automatic reconnection.
 */
export class WebSocketConnector extends BaseConnector {
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private messageQueue: Array<{
    message: string;
    startTime: number;
    resolve: (response: ConnectorResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private _connected = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 2000;

  /**
   * Connect to WebSocket endpoint
   */
  async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        const url = new URL(this.config.endpoint);

        // Add authentication query parameters if needed
        if (this.config.authType === "BEARER_TOKEN" && this.config.authConfig?.token) {
          url.searchParams.set("token", String(this.config.authConfig.token));
        } else if (this.config.authType === "API_KEY" && this.config.authConfig?.apiKey) {
          url.searchParams.set("api_key", String(this.config.authConfig.apiKey));
        }

        // Create WebSocket connection
        this.ws = new WebSocket(url.toString(), {
          headers: this.buildAuthHeaders(),
        });

        // Connection opened
        this.ws.on("open", () => {
          console.log(`WebSocket connected: ${this.config.endpoint}`);
          this._connected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        // Connection closed
        this.ws.on("close", (code, reason) => {
          console.log(
            `WebSocket closed: ${this.config.endpoint} (code: ${code}, reason: ${reason.toString()})`
          );
          this._connected = false;
          this.handleDisconnect();
        });

        // Connection error
        this.ws.on("error", (error) => {
          console.error(`WebSocket error: ${this.config.endpoint}`, error);
          this._connected = false;
          reject(error);
        });

        // Message received
        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        // Timeout for connection
        const timeout = setTimeout(() => {
          if (!this._connected) {
            this.ws?.close();
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);

        this.ws.once("open", () => clearTimeout(timeout));
      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000, "Normal closure");
      this.ws = null;
    }
    this._connected = false;
    this.connectionPromise = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Send message to WebSocket endpoint
   */
  async sendMessage(message: string, metadata?: MessageMetadata): Promise<ConnectorResponse> {
    if (!this._connected || !this.ws) {
      throw new Error("WebSocket is not connected");
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Apply request template
      const payload = this.applyRequestTemplate(message);

      // Queue the message
      this.messageQueue.push({ message, startTime, resolve, reject });

      // Send message
      this.ws!.send(JSON.stringify(payload), (error) => {
        if (error) {
          // Remove from queue and reject
          const index = this.messageQueue.findIndex((item) => item.message === message);
          if (index !== -1) {
            this.messageQueue.splice(index, 1);
          }
          reject(error);
        }
      });

      // Timeout handler
      setTimeout(() => {
        const index = this.messageQueue.findIndex((item) => item.message === message);
        if (index !== -1) {
          this.messageQueue.splice(index, 1);
          reject(new Error("WebSocket message timeout"));
        }
      }, (this.config.protocolConfig?.timeout as number) || 30000);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const response = JSON.parse(data);
      const content = this.extractResponse(response);

      // Get the first message in queue
      const queued = this.messageQueue.shift();

      if (queued) {
        const responseTimeMs = Date.now() - queued.startTime;
        queued.resolve({
          content,
          metadata: {
            responseTimeMs,
            tokenUsage: this.extractTokenUsage(response),
            rawResponse: response,
          },
        });
      }
    } catch {
      // Silently skip protocol frames (Socket.IO handshake, keepalives, etc.)
      // Only warn if there are queued messages waiting for a response
      if (this.messageQueue.length > 0) {
        console.warn("Skipping unparseable WebSocket frame:", data.substring(0, 100));
      }
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(): void {
    // Reject all queued messages
    while (this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift();
      if (queued) {
        queued.reject(new Error("WebSocket disconnected"));
      }
    }

    // Skip auto-reconnection when managed externally (e.g. BrowserWebSocketConnector)
    if (this.config.protocolConfig?.noReconnect) return;

    // Attempt reconnection if not manual disconnect
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      console.log(
        `Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
      );

      setTimeout(() => {
        this.connectionPromise = null;
        this.connect().catch((error) => {
          console.error("WebSocket reconnection failed:", error);
        });
      }, this.RECONNECT_DELAY_MS * this.reconnectAttempts);
    }
  }

  /**
   * Check WebSocket health
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this._connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        healthy: false,
        error: "WebSocket is not connected",
        latencyMs: 0,
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();

    // Send ping if supported
    return new Promise((resolve) => {
      if (this.ws) {
        this.ws.ping();

        this.ws.once("pong", () => {
          resolve({
            healthy: true,
            latencyMs: Date.now() - startTime,
            timestamp: new Date(),
          });
        });

        // Timeout for pong
        setTimeout(() => {
          resolve({
            healthy: false,
            error: "WebSocket ping timeout",
            latencyMs: Date.now() - startTime,
            timestamp: new Date(),
          });
        }, 5000);
      } else {
        resolve({
          healthy: false,
          error: "WebSocket is null",
          latencyMs: 0,
          timestamp: new Date(),
        });
      }
    });
  }

  /**
   * Check if WebSocket supports streaming
   */
  supportsStreaming(): boolean {
    return true; // WebSocket inherently supports streaming
  }
}

// Auto-register WebSocketConnector
ConnectorRegistry.register("WEBSOCKET", WebSocketConnector);
