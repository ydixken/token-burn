import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HTTPConnector } from "@/lib/connectors/http";
import { ConnectorConfig } from "@/lib/connectors/base";
import MockChatbotServer from "@/tests/mocks/chatbot-server";

describe("HTTPConnector", () => {
  let mockServer: MockChatbotServer;
  const mockPort = 3002;

  beforeAll(async () => {
    mockServer = new MockChatbotServer(mockPort);
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe("connection", () => {
    it("should connect successfully", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: { message: "" },
        },
        responseTemplate: {
          contentPath: "$.response",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      expect(connector.isConnected()).toBe(true);
    });

    it("should disconnect successfully", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: {},
        },
        responseTemplate: {
          contentPath: "$.response",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();
      await connector.disconnect();

      expect(connector.isConnected()).toBe(false);
    });
  });

  describe("sendMessage", () => {
    it("should send message and receive response", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: { message: "" },
        },
        responseTemplate: {
          contentPath: "$.response",
        },
        protocolConfig: {
          method: "POST",
          path: "/chat",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      const response = await connector.sendMessage("Hello, chatbot!");

      expect(response.content).toBeTruthy();
      expect(response.metadata.responseTimeMs).toBeGreaterThan(0);
    });

    it("should handle bearer token authentication", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "BEARER_TOKEN",
        authConfig: {
          token: "test-token-123",
        },
        requestTemplate: {
          messagePath: "$.messages[0].content",
          structure: {
            model: "test-model",
            messages: [{ role: "user", content: "" }],
          },
        },
        responseTemplate: {
          contentPath: "$.choices[0].message.content",
          tokenUsagePath: "$.usage",
        },
        protocolConfig: {
          method: "POST",
          path: "/v1/chat/completions",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      const response = await connector.sendMessage("Test with auth");

      expect(response.content).toBeTruthy();
      expect(response.metadata.tokenUsage).toBeDefined();
    });

    it("should extract token usage from response", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.messages[0].content",
          structure: {
            messages: [{ role: "user", content: "" }],
          },
        },
        responseTemplate: {
          contentPath: "$.choices[0].message.content",
          tokenUsagePath: "$.usage",
        },
        protocolConfig: {
          path: "/v1/chat/completions",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      const response = await connector.sendMessage("Hello!");

      expect(response.metadata.tokenUsage).toBeDefined();
      expect(response.metadata.tokenUsage?.totalTokens).toBeGreaterThan(0);
    });

    it("should measure response time accurately", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: { message: "" },
        },
        responseTemplate: {
          contentPath: "$.response",
        },
        protocolConfig: {
          path: "/chat",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      const response = await connector.sendMessage("Test timing");

      expect(response.metadata.responseTimeMs).toBeGreaterThan(100); // Mock has 100ms+ delay
      expect(response.metadata.responseTimeMs).toBeLessThan(3000);
    });

    it("should handle error responses", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: { message: "" },
        },
        responseTemplate: {
          contentPath: "$.response",
        },
        protocolConfig: {
          path: "/error",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      await connector.connect();

      await expect(connector.sendMessage("Trigger error")).rejects.toThrow();
    });
  });

  describe("healthCheck", () => {
    it("should return healthy status for working endpoint", async () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: {},
        },
        responseTemplate: {
          contentPath: "$.response",
        },
      };

      const connector = new HTTPConnector("test-target", config);
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it("should return unhealthy status for unreachable endpoint", async () => {
      const config: ConnectorConfig = {
        endpoint: "http://localhost:9999", // Non-existent port
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: {},
        },
        responseTemplate: {
          contentPath: "$.response",
        },
        timeout: 1000,
      };

      const connector = new HTTPConnector("test-target", config);
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe("streaming support", () => {
    it("should report streaming is not supported", () => {
      const config: ConnectorConfig = {
        endpoint: `http://localhost:${mockPort}`,
        authType: "NONE",
        authConfig: {},
        requestTemplate: {
          messagePath: "$.message",
          structure: {},
        },
        responseTemplate: {
          contentPath: "$.response",
        },
      };

      const connector = new HTTPConnector("test-target", config);

      expect(connector.supportsStreaming()).toBe(false);
    });
  });
});
