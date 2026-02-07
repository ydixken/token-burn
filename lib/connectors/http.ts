import axios, { AxiosInstance, AxiosError } from "axios";
import {
  BaseConnector,
  ConnectorConfig,
  ConnectorResponse,
  ConnectorError,
  MessageMetadata,
  HealthStatus,
} from "./base";

/**
 * HTTP/REST Connector Implementation
 *
 * Supports standard REST APIs with JSON payloads.
 * Uses axios for HTTP requests with configurable timeouts and retries.
 */
export class HTTPConnector extends BaseConnector {
  private client: AxiosInstance | null = null;

  constructor(targetId: string, config: ConnectorConfig) {
    super(targetId, config);
  }

  async connect(): Promise<void> {
    try {
      const headers = {
        "Content-Type": "application/json",
        ...this.buildAuthHeaders(),
        ...(this.config.protocolConfig?.headers as Record<string, string>),
      };

      this.client = axios.create({
        baseURL: this.config.endpoint,
        timeout: this.config.timeout || 30000,
        headers,
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });

      // Add request interceptor for logging (development only)
      if (process.env.NODE_ENV === "development") {
        this.client.interceptors.request.use((config) => {
          console.log(`📤 HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        });

        this.client.interceptors.response.use(
          (response) => {
            console.log(`📥 HTTP Response: ${response.status} ${response.statusText}`);
            return response;
          },
          (error) => {
            if (error.response) {
              console.error(
                `❌ HTTP Error: ${error.response.status} ${error.response.statusText}`
              );
            }
            return Promise.reject(error);
          }
        );
      }

      console.log(`✅ HTTP Connector connected to: ${this.config.endpoint}`);
    } catch (error) {
      throw new ConnectorError("Failed to initialize HTTP client", error);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    console.log(`🔌 HTTP Connector disconnected from: ${this.config.endpoint}`);
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async sendMessage(
    message: string,
    metadata?: MessageMetadata
  ): Promise<ConnectorResponse> {
    if (!this.client) {
      throw new ConnectorError("Connector not connected. Call connect() first.");
    }

    const startTime = Date.now();

    try {
      // Apply request template to wrap message
      const payload = this.applyRequestTemplate(message);

      // Inject persona into request body if configured
      const persona = this.config.protocolConfig?.persona as string | undefined;
      if (persona && typeof payload === "object" && payload !== null) {
        (payload as Record<string, unknown>).persona = persona;
      }

      // Determine HTTP method from protocol config (default to POST)
      const method = (this.config.protocolConfig?.method as string)?.toLowerCase() || "post";
      const path = (this.config.protocolConfig?.path as string) || "/";

      // Build per-request headers (persona header)
      const requestHeaders: Record<string, string> = {};
      if (persona) {
        requestHeaders["X-Persona"] = persona;
      }

      // Send request
      const response = await this.client.request({
        method,
        url: path,
        data: method !== "get" ? payload : undefined,
        params: method === "get" ? payload : undefined,
        headers: requestHeaders,
      });

      // Check for error responses
      if (response.status >= 400) {
        const errorMessage =
          this.extractError(response.data) || `HTTP ${response.status}: ${response.statusText}`;
        throw new ConnectorError(errorMessage, undefined, response.status);
      }

      // Extract response content
      const content = this.extractResponse(response.data);
      const tokenUsage = this.extractTokenUsage(response.data);

      const responseTimeMs = Date.now() - startTime;

      return {
        content,
        metadata: {
          responseTimeMs,
          tokenUsage,
          rawResponse: response.data,
          headers: response.headers as Record<string, string>,
        },
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.code === "ECONNABORTED") {
          throw new ConnectorError("Request timeout", error);
        }

        if (axiosError.response) {
          const errorMessage =
            this.extractError(axiosError.response.data) ||
            `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
          throw new ConnectorError(errorMessage, error, axiosError.response.status);
        }

        if (axiosError.code === "ENOTFOUND" || axiosError.code === "ECONNREFUSED") {
          throw new ConnectorError(`Cannot reach endpoint: ${this.config.endpoint}`, error);
        }
      }

      throw new ConnectorError(
        `HTTP request failed: ${(error as Error).message}`,
        error
      );
    }
  }

  supportsStreaming(): boolean {
    // HTTP can support streaming via SSE or chunked responses
    // For now, return false. Streaming will be handled by SSEConnector
    return false;
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.client) {
        await this.connect();
      }

      // Use explicit health check path from protocolConfig, or fall back to origin root.
      // We avoid using `this.client.get("/")` because axios combines baseURL + url,
      // which breaks when the endpoint includes a path (e.g., /v1/chat/completions).
      const healthCheckPath = this.config.protocolConfig?.healthCheckPath as string | undefined;

      let response;
      if (healthCheckPath) {
        response = await this.client!.get(healthCheckPath, {
          timeout: 5000,
          validateStatus: () => true,
        });
      } else {
        // Request the origin root directly to avoid baseURL path issues
        const origin = new URL(this.config.endpoint).origin;
        response = await axios.get(origin, {
          timeout: 5000,
          validateStatus: () => true,
          headers: {
            ...this.buildAuthHeaders(),
          },
        });
      }

      const latencyMs = Date.now() - startTime;

      return {
        healthy: response.status >= 200 && response.status < 300,
        latencyMs,
        timestamp: new Date(),
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Extract error message from response if available
   */
  private extractError(data: unknown): string | null {
    const errorPath = this.config.responseTemplate.errorPath;

    if (!errorPath) {
      return null;
    }

    try {
      const parts = errorPath.replace(/^\$\./, "").split(".");
      let current: any = data;

      for (const part of parts) {
        if (current === undefined || current === null) {
          return null;
        }
        current = current[part];
      }

      return current ? String(current) : null;
    } catch {
      return null;
    }
  }
}
