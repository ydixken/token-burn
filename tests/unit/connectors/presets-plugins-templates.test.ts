import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PROVIDER_PRESETS, getAllPresets, getPresetById } from "@/lib/connectors/presets";
import type { ProviderPreset } from "@/lib/connectors/presets";
import { BaseConnector, ConnectorConfig } from "@/lib/connectors/base";
import { PluginLoader } from "@/lib/connectors/plugins/loader";
import { openaiPlugin } from "@/lib/connectors/plugins/openai-plugin";
import { multiStepAuthPlugin } from "@/lib/connectors/plugins/multi-step-auth-plugin";

// Mock Redis to prevent REDIS_URL requirement when browser-websocket auto-registers
vi.mock("@/lib/cache/redis", () => ({
  redis: {
    duplicate: vi.fn().mockReturnValue({
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    }),
    publish: vi.fn().mockResolvedValue(0),
    status: "ready",
  },
  default: {},
}));

import { ConnectorRegistry } from "@/lib/connectors/registry";

/**
 * Unit tests for Provider Presets, Connector Plugins, and Template logic.
 *
 * Covers:
 * - Every preset has valid templates that extract correctly from exampleResponse
 * - BaseConnector.applyRequestTemplate() with every preset's request template
 * - BaseConnector.extractResponse() with every preset's example response
 * - Plugin loading - plugins register with ConnectorRegistry
 * - Plugin lifecycle hooks
 */

// ---------- Test subclass to expose protected methods ----------

class TestConnector extends BaseConnector {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  isConnected(): boolean {
    return this.connected;
  }
  async sendMessage(message: string) {
    return {
      content: message,
      metadata: { responseTimeMs: 0 },
    };
  }
  supportsStreaming(): boolean {
    return false;
  }
  async healthCheck() {
    return { healthy: true, timestamp: new Date() };
  }

  // Expose protected methods for testing
  public testApplyRequestTemplate(message: string): unknown {
    return this.applyRequestTemplate(message);
  }

  public testExtractResponse(rawResponse: unknown): string {
    return this.extractResponse(rawResponse);
  }

  public testExtractTokenUsage(rawResponse: unknown) {
    return this.extractTokenUsage(rawResponse);
  }

  public testBuildAuthHeaders() {
    return this.buildAuthHeaders();
  }
}

function makeConfig(preset: ProviderPreset): ConnectorConfig {
  return {
    endpoint: preset.defaultEndpoint,
    authType: preset.authType,
    authConfig: {},
    requestTemplate: preset.requestTemplate,
    responseTemplate: preset.responseTemplate,
    protocolConfig: {},
  };
}

// ============================================================
// Provider Presets
// ============================================================

describe("Provider Presets", () => {
  it("should return all presets via getAllPresets()", () => {
    const presets = getAllPresets();
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThanOrEqual(6);
    expect(presets).toBe(PROVIDER_PRESETS);
  });

  it("should find presets by ID", () => {
    const openai = getPresetById("openai-chat");
    expect(openai).toBeDefined();
    expect(openai!.name).toBe("OpenAI Chat Completions");

    const anthropic = getPresetById("anthropic-messages");
    expect(anthropic).toBeDefined();
    expect(anthropic!.name).toBe("Anthropic Messages");
  });

  it("should return undefined for non-existent preset ID", () => {
    const result = getPresetById("nonexistent-provider");
    expect(result).toBeUndefined();
  });

  describe("each preset has required fields", () => {
    for (const preset of PROVIDER_PRESETS) {
      it(`${preset.id}: has all required fields`, () => {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.icon).toBeTruthy();
        expect(preset.connectorType).toBeTruthy();
        expect(preset.defaultEndpoint).toBeTruthy();
        expect(preset.authType).toBeTruthy();
        expect(Array.isArray(preset.authFields)).toBe(true);
        expect(preset.requestTemplate).toBeDefined();
        expect(preset.requestTemplate.messagePath).toBeTruthy();
        expect(preset.responseTemplate).toBeDefined();
        expect(preset.responseTemplate.responsePath).toBeTruthy();
        expect(preset.documentation).toBeTruthy();
        expect(preset.exampleResponse).toBeDefined();
      });
    }
  });

  describe("each preset's templates extract correctly from exampleResponse", () => {
    for (const preset of PROVIDER_PRESETS) {
      it(`${preset.id}: responsePath extracts from exampleResponse`, () => {
        const config = makeConfig(preset);
        const connector = new TestConnector("test", config);

        const content = connector.testExtractResponse(preset.exampleResponse);
        expect(content).toBeTruthy();
        expect(typeof content).toBe("string");
      });

      if (preset.responseTemplate.tokenUsagePath) {
        it(`${preset.id}: tokenUsagePath extracts from exampleResponse`, () => {
          const config = makeConfig(preset);
          const connector = new TestConnector("test", config);

          const usage = connector.testExtractTokenUsage(preset.exampleResponse);
          expect(usage).toBeDefined();
          expect(typeof usage).toBe("object");
        });
      }
    }
  });
});

// ============================================================
// BaseConnector.applyRequestTemplate() with every preset
// ============================================================

describe("BaseConnector.applyRequestTemplate()", () => {
  const testMessage = "Hello from test!";

  for (const preset of PROVIDER_PRESETS) {
    it(`${preset.id}: applies request template and sets message`, () => {
      const config = makeConfig(preset);
      const connector = new TestConnector("test", config);

      const payload = connector.testApplyRequestTemplate(testMessage) as any;

      expect(payload).toBeDefined();
      expect(typeof payload).toBe("object");

      // Verify the message was injected by extracting it from the payload
      const extractedValue = getNestedValue(payload, preset.requestTemplate.messagePath);
      expect(extractedValue).toBe(testMessage);
    });
  }

  it("should handle messagePath with array index notation", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: {
        messagePath: "messages.0.content",
        structure: { messages: [{ role: "user", content: "" }] },
      },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const payload = connector.testApplyRequestTemplate("Test") as any;

    expect(payload.messages[0].content).toBe("Test");
    expect(payload.messages[0].role).toBe("user");
  });

  it("should handle simple flat messagePath", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: {
        messagePath: "message",
        structure: { message: "" },
      },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const payload = connector.testApplyRequestTemplate("Hello") as any;

    expect(payload.message).toBe("Hello");
  });

  it("should not mutate the original template structure", () => {
    const structure = { message: "original" };
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: {
        messagePath: "message",
        structure,
      },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    connector.testApplyRequestTemplate("Modified");

    // Original structure should be unchanged
    expect(structure.message).toBe("original");
  });
});

// ============================================================
// BaseConnector.extractResponse() with every preset
// ============================================================

describe("BaseConnector.extractResponse()", () => {
  for (const preset of PROVIDER_PRESETS) {
    it(`${preset.id}: extracts content from exampleResponse`, () => {
      const config = makeConfig(preset);
      const connector = new TestConnector("test", config);

      const content = connector.testExtractResponse(preset.exampleResponse);

      expect(content).toBeTruthy();
      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });
  }

  it("should throw when responsePath leads to undefined", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "nonexistent.path.here" },
    };

    const connector = new TestConnector("test", config);

    expect(() => connector.testExtractResponse({ data: "test" })).toThrow(
      "Failed to extract response"
    );
  });

  it("should throw when raw response is null", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "content" },
    };

    const connector = new TestConnector("test", config);

    expect(() => connector.testExtractResponse(null)).toThrow(
      "Failed to extract response"
    );
  });
});

// ============================================================
// BaseConnector.buildAuthHeaders()
// ============================================================

describe("BaseConnector.buildAuthHeaders()", () => {
  it("should return empty headers for NONE auth", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const headers = connector.testBuildAuthHeaders();

    expect(Object.keys(headers).length).toBe(0);
  });

  it("should set Bearer token for BEARER_TOKEN auth", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "BEARER_TOKEN",
      authConfig: { token: "my-secret-token" },
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const headers = connector.testBuildAuthHeaders();

    expect(headers["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("should set API key header for API_KEY auth", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "API_KEY",
      authConfig: { apiKey: "key-123", headerName: "X-API-Key" },
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const headers = connector.testBuildAuthHeaders();

    expect(headers["X-API-Key"]).toBe("key-123");
  });

  it("should set Basic auth header for BASIC_AUTH", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "BASIC_AUTH",
      authConfig: { username: "user", password: "pass" },
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const headers = connector.testBuildAuthHeaders();

    const expected = Buffer.from("user:pass").toString("base64");
    expect(headers["Authorization"]).toBe(`Basic ${expected}`);
  });

  it("should set custom headers for CUSTOM_HEADER auth", () => {
    const config: ConnectorConfig = {
      endpoint: "http://localhost",
      authType: "CUSTOM_HEADER",
      authConfig: {
        headers: { "x-api-key": "sk-ant-123", "anthropic-version": "2023-06-01" },
      },
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    };

    const connector = new TestConnector("test", config);
    const headers = connector.testBuildAuthHeaders();

    expect(headers["x-api-key"]).toBe("sk-ant-123");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });
});

// ============================================================
// Plugin Loading
// ============================================================

describe("Plugin Loading", () => {
  beforeEach(() => {
    PluginLoader.clear();
  });

  it("should register the OpenAI plugin", () => {
    PluginLoader.register(openaiPlugin);

    expect(PluginLoader.isRegistered("openai")).toBe(true);
    expect(PluginLoader.get("openai")).toBe(openaiPlugin);
  });

  it("should register the Multi-Step Auth plugin", () => {
    PluginLoader.register(multiStepAuthPlugin);

    expect(PluginLoader.isRegistered("multi-step-auth")).toBe(true);
    expect(PluginLoader.get("multi-step-auth")).toBe(multiStepAuthPlugin);
  });

  it("should list all registered plugins", () => {
    PluginLoader.register(openaiPlugin);
    PluginLoader.register(multiStepAuthPlugin);

    const all = PluginLoader.getAll();
    expect(all.length).toBe(2);
    expect(all.map((p) => p.id).sort()).toEqual(["multi-step-auth", "openai"]);
  });

  it("should get compatible plugins for HTTP_REST", () => {
    PluginLoader.register(openaiPlugin);
    PluginLoader.register(multiStepAuthPlugin);

    const compatible = PluginLoader.getCompatible("HTTP_REST");
    expect(compatible.length).toBe(2);
  });

  it("should return empty for incompatible connector type", () => {
    PluginLoader.register(openaiPlugin);

    const compatible = PluginLoader.getCompatible("GRPC");
    expect(compatible.length).toBe(0);
  });

  it("should list plugin metadata", () => {
    PluginLoader.register(openaiPlugin);

    const metadata = PluginLoader.listMetadata();
    expect(metadata.length).toBe(1);
    expect(metadata[0].id).toBe("openai");
    expect(metadata[0].name).toBe("OpenAI Conversation Plugin");
    expect(metadata[0].version).toBe("1.0.0");
    expect(metadata[0].compatibleConnectors).toContain("HTTP_REST");
  });

  it("should unregister a plugin", () => {
    PluginLoader.register(openaiPlugin);
    expect(PluginLoader.isRegistered("openai")).toBe(true);

    const result = PluginLoader.unregister("openai");
    expect(result).toBe(true);
    expect(PluginLoader.isRegistered("openai")).toBe(false);
  });

  it("should overwrite existing plugin on re-register", () => {
    PluginLoader.register(openaiPlugin);

    const customPlugin = { ...openaiPlugin, name: "Custom OpenAI" };
    PluginLoader.register(customPlugin);

    const plugin = PluginLoader.get("openai");
    expect(plugin!.name).toBe("Custom OpenAI");
  });

  it("should return undefined for unregistered plugin", () => {
    expect(PluginLoader.get("nonexistent")).toBeUndefined();
    expect(PluginLoader.isRegistered("nonexistent")).toBe(false);
  });

  it("should clear all plugins", () => {
    PluginLoader.register(openaiPlugin);
    PluginLoader.register(multiStepAuthPlugin);

    PluginLoader.clear();

    expect(PluginLoader.getAll().length).toBe(0);
  });
});

// ============================================================
// OpenAI Plugin Lifecycle
// ============================================================

describe("OpenAI Plugin Lifecycle", () => {
  it("should initialize conversation history state", async () => {
    const context = makePluginContext();
    await openaiPlugin.initialize!(context);

    expect(context.state.messages).toEqual([]);
    expect(context.state.totalTokens).toBe(0);
  });

  it("should add system prompt on initialize if configured", async () => {
    const context = makePluginContext({ systemPrompt: "You are a helper." });
    await openaiPlugin.initialize!(context);

    const messages = context.state.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("You are a helper.");
  });

  it("should track user messages in beforeSend", async () => {
    const context = makePluginContext();
    await openaiPlugin.initialize!(context);

    await openaiPlugin.beforeSend!("Hello", undefined, context);

    const messages = context.state.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello");
  });

  it("should track assistant responses in afterReceive", async () => {
    const context = makePluginContext();
    await openaiPlugin.initialize!(context);

    const response = {
      content: "Hi there!",
      metadata: { responseTimeMs: 100 },
    };

    const result = await openaiPlugin.afterReceive!(response, context);

    const messages = context.state.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Hi there!");
    expect(result.response.content).toBe("Hi there!");
  });

  it("should clear state on disconnect", async () => {
    const context = makePluginContext();
    await openaiPlugin.initialize!(context);
    await openaiPlugin.beforeSend!("Test", undefined, context);

    await openaiPlugin.onDisconnect!(context);

    expect(context.state.messages).toEqual([]);
    expect(context.state.totalTokens).toBe(0);
  });
});

// ============================================================
// ConnectorRegistry
// ============================================================

describe("ConnectorRegistry", () => {
  it("should have HTTP_REST registered by default", () => {
    expect(ConnectorRegistry.isRegistered("HTTP_REST")).toBe(true);
  });

  it("should list registered types", () => {
    const types = ConnectorRegistry.getRegisteredTypes();
    expect(types).toContain("HTTP_REST");
  });

  it("should throw for unknown connector type", async () => {
    await expect(
      ConnectorRegistry.create("UNKNOWN_TYPE" as any, "test", {
        endpoint: "http://localhost",
        authType: "NONE",
        authConfig: {},
        requestTemplate: { messagePath: "message" },
        responseTemplate: { responsePath: "response" },
      })
    ).rejects.toThrow("Unknown connector type: UNKNOWN_TYPE");
  });
});

// ============================================================
// Helpers
// ============================================================

function getNestedValue(obj: any, path: string): unknown {
  const cleanPath = path.startsWith("$.") ? path.slice(2) : path;
  const parts = cleanPath.split(/[.\[\]]/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function makePluginContext(pluginConfig?: Record<string, unknown>) {
  return {
    sessionId: "test-session",
    targetId: "test-target",
    state: {} as Record<string, unknown>,
    connector: new TestConnector("test", {
      endpoint: "http://localhost",
      authType: "NONE",
      authConfig: {},
      requestTemplate: { messagePath: "message" },
      responseTemplate: { responsePath: "response" },
    }),
    pluginConfig,
  };
}
