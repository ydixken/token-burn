/**
 * Browser WebSocket Connector
 *
 * Extends BaseConnector to provide automated browser-based WebSocket discovery.
 * Uses Playwright to navigate to a chatbot page, detect the widget, capture the
 * WebSocket connection, and then delegate message sending to an internal
 * WebSocketConnector with the discovered credentials.
 */

import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectorResponse,
  type HealthStatus,
  type MessageMetadata,
  ConnectorError,
} from "./base";
import { ConnectorRegistry } from "./registry";
import { BrowserDiscoveryService } from "./browser/discovery-service";
import { SocketIOHandler } from "./browser/socketio-handler";
import { CredentialExtractor } from "./browser/credential-extractor";
import { WebSocketConnector } from "./websocket";
import type { BrowserWebSocketProtocolConfig, DiscoveryResult } from "./browser/types";
import {
  subscribeTokenRefreshed,
  type TokenRefreshSubscription,
} from "@/lib/jobs/token-refresh/events";

export class BrowserWebSocketConnector extends BaseConnector {
  private internalConnector: WebSocketConnector | null = null;
  private socketIOHandler: SocketIOHandler | null = null;
  private discoveryResult: DiscoveryResult | null = null;
  private protocolConfig: BrowserWebSocketProtocolConfig | null = null;
  private _connected = false;
  private refreshSubscription: TokenRefreshSubscription | null = null;

  constructor(targetId: string, config: ConnectorConfig) {
    super(targetId, config);
  }

  /**
   * Connect by running browser discovery and creating an internal WebSocket connection.
   */
  async connect(): Promise<void> {
    // 1. Parse protocolConfig
    this.protocolConfig = this.config.protocolConfig as unknown as BrowserWebSocketProtocolConfig;
    if (!this.protocolConfig?.pageUrl) {
      throw new ConnectorError(
        "BrowserWebSocketConnector requires protocolConfig with a pageUrl"
      );
    }

    // 2. Run browser discovery
    const forceFresh = !!(this.protocolConfig as unknown as Record<string, unknown>)?._forceFresh;
    this.emitProgress("connect", "Starting browser discovery");
    try {
      this.discoveryResult = await BrowserDiscoveryService.discover({
        config: this.protocolConfig,
        targetId: this.targetId,
        forceFresh,
        onProgress: (message: string) => {
          this.emitProgress("discovery", message);
        },
      });
    } catch (error) {
      throw new ConnectorError(
        `Browser discovery failed: ${(error as Error).message}`,
        error
      );
    }

    // 3. Build internal WS ConnectorConfig
    const internalConfig = this.buildInternalConfig(this.discoveryResult);

    // 4. Create and connect internal WebSocketConnector
    this.emitProgress("connect", "Connecting to discovered WebSocket endpoint");
    this.internalConnector = new WebSocketConnector(this.targetId, internalConfig);
    try {
      await this.internalConnector.connect();
    } catch (error) {
      throw new ConnectorError(
        `Failed to connect to discovered WebSocket ${this.discoveryResult.wssUrl}: ${(error as Error).message}`,
        error
      );
    }

    // 5. If Socket.IO detected, set up handler
    if (
      this.discoveryResult.detectedProtocol === "socket.io" &&
      this.discoveryResult.socketIoConfig
    ) {
      // Access the raw WS from the internal connector via its private field
      // We use a type assertion since WebSocketConnector doesn't expose its ws
      const rawWs = (this.internalConnector as unknown as { ws: import("ws").default | null }).ws;
      if (rawWs) {
        // SocketIOHandler manages ALL frame parsing in Socket.IO mode.
        // Remove WebSocketConnector's generic handler to prevent JSON.parse
        // errors on protocol frames ("0{...}", "40", "2", "42[...]").
        rawWs.removeAllListeners("message");

        this.socketIOHandler = new SocketIOHandler(
          rawWs,
          this.discoveryResult.socketIoConfig
        );
        this.socketIOHandler.start();
      }
    }

    this._connected = true;
    this.emitProgress("connect", "Connected successfully");

    // 6. Subscribe to token refresh notifications if enabled
    if (this.protocolConfig?.session?.tokenRefreshEnabled !== false) {
      this.subscribeToRefreshNotifications();
    }
  }

  /**
   * Disconnect from the WebSocket and clean up resources.
   */
  async disconnect(): Promise<void> {
    // Unsubscribe from token refresh notifications
    if (this.refreshSubscription) {
      await this.refreshSubscription.unsubscribe();
      this.refreshSubscription = null;
    }

    if (this.socketIOHandler) {
      this.socketIOHandler.stop();
      this.socketIOHandler = null;
    }

    if (this.internalConnector) {
      await this.internalConnector.disconnect();
      this.internalConnector = null;
    }

    if (!this.protocolConfig?.session?.keepBrowserAlive) {
      await BrowserDiscoveryService.closeBrowser();
    }

    this._connected = false;
    this.discoveryResult = null;
  }

  /**
   * Check if the connector is currently connected.
   */
  isConnected(): boolean {
    return this._connected && (this.internalConnector?.isConnected() ?? false);
  }

  /**
   * Send a message through the WebSocket connection.
   *
   * In Socket.IO mode, encodes the message as a Socket.IO EVENT frame.
   * In raw mode, delegates directly to the internal WebSocketConnector.
   */
  async sendMessage(
    message: string,
    metadata?: MessageMetadata
  ): Promise<ConnectorResponse> {
    if (!this._connected || !this.internalConnector) {
      throw new ConnectorError("BrowserWebSocketConnector is not connected");
    }

    if (this.socketIOHandler && this.discoveryResult?.detectedProtocol === "socket.io") {
      // Socket.IO mode: encode the message
      const payload = this.applyRequestTemplate(message);
      const encoded = SocketIOHandler.encodeMessage("message", payload);

      // Send the raw encoded frame through the internal connector's WS
      const rawWs = (this.internalConnector as unknown as { ws: import("ws").default | null }).ws;
      if (!rawWs) {
        throw new ConnectorError("Internal WebSocket is not available");
      }

      const startTime = Date.now();

      return new Promise<ConnectorResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new ConnectorError("Socket.IO message timeout"));
        }, this.config.timeout || 30_000);

        // Listen for the next Socket.IO message frame as response
        const onMessage = (data: import("ws").RawData) => {
          const frame = data.toString();
          if (SocketIOHandler.isMessageFrame(frame)) {
            clearTimeout(timeout);
            rawWs.removeListener("message", onMessage);

            const decoded = SocketIOHandler.decodeMessage(frame);
            const content = decoded
              ? typeof decoded.data === "string"
                ? decoded.data
                : JSON.stringify(decoded.data)
              : frame;

            resolve({
              content,
              metadata: {
                responseTimeMs: Date.now() - startTime,
                rawResponse: decoded,
              },
            });
          }
        };

        rawWs.on("message", onMessage);

        rawWs.send(encoded, (error) => {
          if (error) {
            clearTimeout(timeout);
            rawWs.removeListener("message", onMessage);
            reject(new ConnectorError(`Failed to send Socket.IO message: ${error.message}`, error));
          }
        });
      });
    }

    // Raw mode: delegate directly
    return this.internalConnector.sendMessage(message, metadata);
  }

  /**
   * WebSocket connections inherently support streaming.
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Check the health of the WebSocket connection.
   * If unhealthy and the session is expired, trigger rediscovery.
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.internalConnector) {
      return {
        healthy: false,
        error: "Not connected",
        timestamp: new Date(),
      };
    }

    // Socket.IO mode: Engine.IO heartbeat already monitors liveness via
    // text-frame ping/pong ("2"/"3"). WS-level ping won't get a pong from
    // Socket.IO servers. Just verify the underlying WebSocket is still open.
    if (this.socketIOHandler && this.discoveryResult?.detectedProtocol === "socket.io") {
      const rawWs = (this.internalConnector as unknown as { ws: import("ws").default | null }).ws;
      const isOpen = rawWs?.readyState === 1; // WebSocket.OPEN
      return {
        healthy: isOpen,
        latencyMs: 0,
        error: isOpen ? undefined : "WebSocket is not open",
        timestamp: new Date(),
      };
    }

    // Raw WS mode: delegate to internal connector's ping-based health check
    const health = await this.internalConnector.healthCheck();

    if (!health.healthy && this.discoveryResult) {
      const maxAge = this.protocolConfig?.session?.maxAge ?? 300_000;
      const elapsed = Date.now() - this.discoveryResult.discoveredAt.getTime();

      if (elapsed >= maxAge) {
        try {
          await this.rediscover();
          return {
            healthy: true,
            latencyMs: health.latencyMs,
            timestamp: new Date(),
          };
        } catch (error) {
          return {
            healthy: false,
            error: `Rediscovery failed: ${(error as Error).message}`,
            timestamp: new Date(),
          };
        }
      }
    }

    return health;
  }

  /**
   * Subscribe to Redis Pub/Sub token refresh notifications.
   * When a refresh worker updates the cached discovery result for this target,
   * we hot-swap the stored credentials without disconnecting the WebSocket.
   */
  private async subscribeToRefreshNotifications(): Promise<void> {
    try {
      this.refreshSubscription = await subscribeTokenRefreshed((event) => {
        if (event.targetId === this.targetId) {
          this.updateCredentials().catch((error) => {
            console.error(
              `Failed to update credentials for target ${this.targetId}:`,
              (error as Error).message
            );
          });
        }
      });
    } catch (error) {
      // Non-fatal — connector continues without proactive refresh
      console.warn(
        `Failed to subscribe to token refresh for target ${this.targetId}:`,
        (error as Error).message
      );
    }
  }

  /**
   * Hot-swap credentials from the refreshed Redis cache.
   * Reads the latest DiscoveryResult, rebuilds internal config (headers, cookies),
   * and stores it for the next reconnect. Does NOT disconnect the active WebSocket.
   */
  private async updateCredentials(): Promise<void> {
    const freshResult = await BrowserDiscoveryService.getCached(this.targetId);
    if (!freshResult) {
      console.warn(`No cached discovery result for target ${this.targetId} after refresh`);
      return;
    }

    this.discoveryResult = freshResult;

    // Rebuild the internal config with new headers/cookies for the next reconnect
    const newConfig = this.buildInternalConfig(freshResult);

    // Store the config on the internal connector so the next reconnect uses it
    if (this.internalConnector) {
      (this.internalConnector as unknown as { config: ConnectorConfig }).config = newConfig;
    }

    console.log(`Token refresh applied for target ${this.targetId}`);
  }

  /**
   * Re-run browser discovery and reconnect.
   */
  private async rediscover(): Promise<void> {
    // Disconnect current connection
    if (this.socketIOHandler) {
      this.socketIOHandler.stop();
      this.socketIOHandler = null;
    }
    if (this.internalConnector) {
      await this.internalConnector.disconnect();
      this.internalConnector = null;
    }

    this._connected = false;

    // Reconnect
    await this.connect();
  }

  /**
   * Build a ConnectorConfig for the internal WebSocketConnector from discovery results.
   */
  private buildInternalConfig(result: DiscoveryResult): ConnectorConfig {
    // Merge discovered upgrade headers with cookie header
    const headers: Record<string, string> = { ...result.headers };

    const cookieHeader = CredentialExtractor.buildCookieHeader(result.cookies);
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    return {
      endpoint: result.wssUrl,
      authType: "CUSTOM_HEADER",
      authConfig: { headers },
      requestTemplate: this.config.requestTemplate,
      responseTemplate: this.config.responseTemplate,
      protocolConfig: { noReconnect: true },
      timeout: this.config.timeout,
      retries: this.config.retries,
    };
  }
}

// Auto-register with ConnectorRegistry
ConnectorRegistry.register("BROWSER_WEBSOCKET", BrowserWebSocketConnector);
