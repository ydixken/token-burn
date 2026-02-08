import type { BaseConnector, ConnectorConfig } from "./base";
import type { ConnectorType } from "@prisma/client";

/**
 * Connector Registry
 *
 * Central registry for all connector types.
 * Provides factory methods for creating connector instances based on type.
 */

type ConnectorConstructor = new (targetId: string, config: ConnectorConfig) => BaseConnector;

export class ConnectorRegistry {
  private static connectors = new Map<string, ConnectorConstructor>();
  private static allRegistered = false;

  /**
   * Register a connector type
   */
  static register(type: string, connector: ConnectorConstructor): void {
    if (this.connectors.has(type)) {
      console.warn(`⚠️  Connector ${type} is already registered, overwriting`);
    }

    this.connectors.set(type, connector);
    console.log(`✅ Registered connector: ${type}`);
  }

  /**
   * Create a connector instance.
   * Automatically registers all built-in connectors on first use if needed.
   */
  static async create(type: ConnectorType, targetId: string, config: ConnectorConfig): Promise<BaseConnector> {
    if (!this.allRegistered) {
      await this.registerAll();
    }

    const ConnectorClass = this.connectors.get(type);

    if (!ConnectorClass) {
      throw new Error(`Unknown connector type: ${type}. Available: ${Array.from(this.connectors.keys()).join(", ")}`);
    }

    return new ConnectorClass(targetId, config);
  }

  /**
   * Get all registered connector types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Check if a connector type is registered
   */
  static isRegistered(type: string): boolean {
    return this.connectors.has(type);
  }

  /**
   * Unregister a connector (primarily for testing)
   */
  static unregister(type: string): boolean {
    return this.connectors.delete(type);
  }

  /**
   * Clear all registered connectors (primarily for testing)
   */
  static clear(): void {
    this.connectors.clear();
  }

  /**
   * Ensure all built-in connectors are registered.
   * Uses dynamic imports to avoid circular dependency issues.
   */
  static async registerAll(): Promise<void> {
    if (this.allRegistered) return;

    const { HTTPConnector } = await import("./http");
    const { WebSocketConnector } = await import("./websocket");
    const { gRPCConnector } = await import("./grpc");
    const { SSEConnector } = await import("./sse");
    const { BrowserWebSocketConnector } = await import("./browser-websocket");

    if (!this.isRegistered("HTTP_REST")) {
      this.register("HTTP_REST", HTTPConnector);
    }
    if (!this.isRegistered("WEBSOCKET")) {
      this.register("WEBSOCKET", WebSocketConnector);
    }
    if (!this.isRegistered("GRPC")) {
      this.register("GRPC", gRPCConnector);
    }
    if (!this.isRegistered("SSE")) {
      this.register("SSE", SSEConnector);
    }
    if (!this.isRegistered("BROWSER_WEBSOCKET")) {
      this.register("BROWSER_WEBSOCKET", BrowserWebSocketConnector);
    }

    this.allRegistered = true;
  }
}

// Eagerly register HTTP_REST (no circular dep since http.ts doesn't import registry)
import { HTTPConnector } from "./http";
ConnectorRegistry.register("HTTP_REST", HTTPConnector);
