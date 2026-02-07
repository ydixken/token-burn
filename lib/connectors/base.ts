/**
 * Base Connector Abstract Class
 *
 * All protocol implementations (HTTP, WebSocket, gRPC, SSE) must extend this class
 * and implement its abstract methods.
 */

export abstract class BaseConnector {
  protected targetId: string;
  protected config: ConnectorConfig;

  constructor(targetId: string, config: ConnectorConfig) {
    this.targetId = targetId;
    this.config = config;
  }

  /**
   * Establish connection to the target endpoint
   */
  abstract connect(): Promise<void>;

  /**
   * Close connection to the target endpoint
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if connector is currently connected
   */
  abstract isConnected(): boolean;

  /**
   * Send a message and receive response
   */
  abstract sendMessage(
    message: string,
    metadata?: MessageMetadata
  ): Promise<ConnectorResponse>;

  /**
   * Check if this connector supports streaming responses
   */
  abstract supportsStreaming(): boolean;

  /**
   * Stream a message with chunk-by-chunk callback (optional)
   */
  streamMessage?(
    message: string,
    onChunk: (chunk: string) => void,
    metadata?: MessageMetadata
  ): Promise<void>;

  /**
   * Perform health check on the target endpoint
   */
  abstract healthCheck(): Promise<HealthStatus>;

  /**
   * Apply request template to wrap the message
   */
  protected applyRequestTemplate(message: string): unknown {
    const template = this.config.requestTemplate;

    // Clone the structure to avoid mutations
    const payload = JSON.parse(JSON.stringify(template.structure || {}));

    // Set the message at the specified path
    this.setValueAtPath(payload, template.messagePath, message);

    // Apply any variable substitutions if provided
    if (template.variables) {
      for (const [key, value] of Object.entries(template.variables)) {
        this.replaceVariables(payload, key, value);
      }
    }

    return payload;
  }

  /**
   * Extract response content from raw response
   */
  protected extractResponse(rawResponse: unknown): string {
    const template = this.config.responseTemplate;

    if (!template.responsePath) {
      throw new ConnectorError(
        "Response template is missing 'responsePath'. Configure the JSON path to extract the response content."
      );
    }

    try {
      const content = this.getValueAtPath(rawResponse, template.responsePath);

      if (content === undefined || content === null) {
        throw new Error(`No content found at path: ${template.responsePath}`);
      }

      // Transform content if needed
      if (template.transform) {
        return this.transformContent(String(content), template.transform);
      }

      return String(content);
    } catch (error) {
      throw new ConnectorError(
        `Failed to extract response: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Extract token usage from response if available
   */
  protected extractTokenUsage(rawResponse: unknown): TokenUsage | undefined {
    const template = this.config.responseTemplate;

    if (!template.tokenUsagePath) {
      return undefined;
    }

    try {
      const usage = this.getValueAtPath(rawResponse, template.tokenUsagePath);
      return usage as TokenUsage;
    } catch {
      return undefined;
    }
  }

  /**
   * Build authentication headers based on auth config
   */
  protected buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (this.config.authType) {
      case "BEARER_TOKEN":
        if (this.config.authConfig.token) {
          headers["Authorization"] = `Bearer ${this.config.authConfig.token}`;
        }
        break;

      case "API_KEY":
        if (this.config.authConfig.apiKey && this.config.authConfig.headerName) {
          headers[String(this.config.authConfig.headerName)] = String(
            this.config.authConfig.apiKey
          );
        }
        break;

      case "BASIC_AUTH":
        if (this.config.authConfig.username && this.config.authConfig.password) {
          const credentials = Buffer.from(
            `${this.config.authConfig.username}:${this.config.authConfig.password}`
          ).toString("base64");
          headers["Authorization"] = `Basic ${credentials}`;
        }
        break;

      case "CUSTOM_HEADER":
        if (this.config.authConfig.headers) {
          Object.assign(headers, this.config.authConfig.headers);
        }
        break;

      case "NONE":
      default:
        break;
    }

    return headers;
  }

  /**
   * Helper: Set value at JSON path
   */
  private setValueAtPath(obj: any, path: string, value: unknown): void {
    const parts = this.parsePath(path);
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        // Create object or array based on next part
        current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Helper: Get value at JSON path
   */
  private getValueAtPath(obj: unknown, path: string): unknown {
    const parts = this.parsePath(path);
    let current: any = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Helper: Parse JSON path (supports $.foo.bar[0] or foo.bar.0)
   */
  private parsePath(path: string): string[] {
    if (!path) return [];

    // Remove leading $ if present
    const cleanPath = path.startsWith("$.") ? path.slice(2) : path;

    // Split by dots and handle array brackets
    return cleanPath.split(/[.\[\]]/).filter(Boolean);
  }

  /**
   * Helper: Replace variables in object
   */
  private replaceVariables(obj: any, key: string, value: unknown): void {
    for (const k in obj) {
      if (typeof obj[k] === "object" && obj[k] !== null) {
        this.replaceVariables(obj[k], key, value);
      } else if (obj[k] === `\${${key}}` || obj[k] === key) {
        obj[k] = value;
      }
    }
  }

  /**
   * Helper: Transform content based on transform type
   */
  private transformContent(content: string, transform: string): string {
    switch (transform) {
      case "markdown":
        // Basic markdown to text (remove common markdown syntax)
        return content
          .replace(/#{1,6}\s/g, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/`(.+?)`/g, "$1");

      case "html":
        // Basic HTML to text (remove tags)
        return content.replace(/<[^>]*>/g, "");

      case "none":
      default:
        return content;
    }
  }
}

/**
 * Connector Configuration Interface
 */
export interface ConnectorConfig {
  endpoint: string;
  authType: AuthType;
  authConfig: Record<string, unknown>;
  requestTemplate: RequestTemplate;
  responseTemplate: ResponseTemplate;
  protocolConfig?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

/**
 * Request Template Interface
 */
export interface RequestTemplate {
  messagePath: string; // JSON path where message should be inserted
  structure?: Record<string, unknown>; // Base structure to wrap message in
  variables?: Record<string, unknown>; // Variables to substitute
}

/**
 * Response Template Interface
 */
export interface ResponseTemplate {
  responsePath: string; // JSON path to extract response content
  tokenUsagePath?: string; // JSON path to extract token usage
  errorPath?: string; // JSON path to extract error messages
  transform?: "none" | "markdown" | "html"; // Content transformation
}

/**
 * Connector Response Interface
 */
export interface ConnectorResponse {
  content: string;
  metadata: ResponseMetadata;
}

/**
 * Response Metadata Interface
 */
export interface ResponseMetadata {
  responseTimeMs: number;
  tokenUsage?: TokenUsage;
  rawResponse?: unknown;
  headers?: Record<string, string>;
}

/**
 * Message Metadata Interface
 */
export interface MessageMetadata {
  sessionId: string;
  messageIndex: number;
  timestamp: Date;
}

/**
 * Token Usage Interface
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Health Status Interface
 */
export interface HealthStatus {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  timestamp: Date;
}

/**
 * Auth Type Enum
 */
export type AuthType = "NONE" | "BEARER_TOKEN" | "API_KEY" | "BASIC_AUTH" | "CUSTOM_HEADER" | "OAUTH2";

/**
 * Connector Error Class
 */
export class ConnectorError extends Error {
  public originalError?: unknown;
  public statusCode?: number;

  constructor(message: string, originalError?: unknown, statusCode?: number) {
    super(message);
    this.name = "ConnectorError";
    this.originalError = originalError;
    this.statusCode = statusCode;
  }
}
