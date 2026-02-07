import type { BaseConnector, ConnectorConfig, ConnectorResponse, MessageMetadata } from "../base";

/**
 * Plugin Config Field
 *
 * Describes a single configuration field for UI form generation.
 * Used to dynamically render plugin configuration forms.
 */
export interface PluginConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "json";
  required: boolean;
  default?: unknown;
  description: string;
  options?: { label: string; value: string }[];
}

/**
 * ConnectorPlugin Interface
 *
 * Plugins extend base connectors with additional capabilities such as
 * conversation history management, custom auth flows, streaming support,
 * and provider-specific token usage extraction.
 */
export interface ConnectorPlugin {
  /** Unique plugin identifier */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin description */
  description: string;

  /** Plugin version (semver) */
  version: string;

  /** Connector types this plugin is compatible with */
  compatibleConnectors: string[];

  /** Execution priority - lower runs first. Default 100. Auth plugins use 10. */
  priority?: number;

  /** Minimum connector version required (semver) */
  minConnectorVersion?: string;

  /** Configuration schema for UI form generation */
  configSchema?: PluginConfigField[];

  /**
   * Hook called before sending a message.
   * Can modify the message or metadata before it reaches the connector.
   */
  beforeSend?(
    message: string,
    metadata: MessageMetadata | undefined,
    context: PluginContext
  ): Promise<{ message: string; metadata?: Record<string, unknown> }>;

  /**
   * Hook called after receiving a response.
   * Can transform the response before it's returned to the caller.
   */
  afterReceive?(
    response: ConnectorResponse,
    context: PluginContext
  ): Promise<{ response: ConnectorResponse; metadata?: Record<string, unknown> }>;

  /**
   * Hook called when establishing a connection.
   * Useful for multi-step auth handshakes.
   */
  onConnect?(config: ConnectorConfig, context: PluginContext): Promise<ConnectorConfig>;

  /**
   * Hook called when disconnecting.
   * Useful for cleanup of plugin-managed state.
   */
  onDisconnect?(context: PluginContext): Promise<void>;

  /**
   * Initialize plugin state for a session.
   */
  initialize?(context: PluginContext): Promise<void>;

  /**
   * Optional error handler invoked when any hook throws.
   * Allows plugins to log or recover from errors in their own hooks.
   */
  onError?(error: Error, hookName: string, context: PluginContext): void;
}

/**
 * Plugin Context
 *
 * Shared state container passed to plugin hooks.
 * Allows plugins to maintain state across messages within a session.
 */
export interface PluginContext {
  /** The session ID this plugin instance is operating in */
  sessionId: string;

  /** The target ID being tested */
  targetId: string;

  /** Mutable state store for the plugin */
  state: Record<string, unknown>;

  /** The underlying connector instance */
  connector: BaseConnector;

  /** Plugin-specific configuration */
  pluginConfig?: Record<string, unknown>;
}

/**
 * Plugin Metadata
 *
 * Registration info for the plugin loader.
 */
export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  compatibleConnectors: string[];
  priority?: number;
}
