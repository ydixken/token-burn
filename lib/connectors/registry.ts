import { BaseConnector, ConnectorConfig } from "./base";
import { HTTPConnector } from "./http";

/**
 * Connector Registry
 *
 * Central registry for all connector types.
 * Allows dynamic creation of connectors based on type.
 */

export type ConnectorType = "HTTP_REST" | "WEBSOCKET" | "GRPC" | "SSE";

type ConnectorConstructor = new (targetId: string, config: ConnectorConfig) => BaseConnector;

class ConnectorRegistry {
  private connectors: Map<ConnectorType, ConnectorConstructor> = new Map();

  /**
   * Register a connector type
   */
  register(type: ConnectorType, connector: ConnectorConstructor): void {
    this.connectors.set(type, connector);
    console.log(`✅ Registered connector: ${type}`);
  }

  /**
   * Create a connector instance
   */
  create(type: ConnectorType, targetId: string, config: ConnectorConfig): BaseConnector {
    const ConnectorClass = this.connectors.get(type);

    if (!ConnectorClass) {
      throw new Error(`Unknown connector type: ${type}. Available: ${Array.from(this.connectors.keys()).join(", ")}`);
    }

    return new ConnectorClass(targetId, config);
  }

  /**
   * Get all registered connector types
   */
  getRegisteredTypes(): ConnectorType[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Check if a connector type is registered
   */
  isRegistered(type: ConnectorType): boolean {
    return this.connectors.has(type);
  }
}

// Singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Auto-register built-in connectors
connectorRegistry.register("HTTP_REST", HTTPConnector);

// Placeholder registrations for connectors to be implemented
// connectorRegistry.register("WEBSOCKET", WebSocketConnector);
// connectorRegistry.register("GRPC", gRPCConnector);
// connectorRegistry.register("SSE", SSEConnector);

export default connectorRegistry;
