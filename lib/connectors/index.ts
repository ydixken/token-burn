/**
 * Connector Module Index
 *
 * Exports all connector types and ensures auto-registration.
 * Import this module to register all available connectors.
 */

// Export base connector and types
export { BaseConnector } from "./base";
export type { ConnectorConfig, ConnectorResponse, HealthStatus, MessageMetadata } from "./base";

// Export registry
export { ConnectorRegistry } from "./registry";

// Import all connectors to trigger auto-registration
import "./http";
import "./websocket";
import "./sse";
import "./grpc";
import "./browser-websocket";

// Re-export connector classes for direct usage
export { HTTPConnector } from "./http";
export { WebSocketConnector } from "./websocket";
export { SSEConnector } from "./sse";
export { gRPCConnector } from "./grpc";
export { BrowserWebSocketConnector } from "./browser-websocket";
