# Custom Endpoints Development Guide

A comprehensive guide to building connector plugins for Krawall.

---

## 1. Overview

Plugins extend Krawall's base connectors with additional capabilities. A connector handles the raw protocol (HTTP, WebSocket, gRPC, SSE), while a plugin layers on behavior like:

- **Conversation history** — maintaining a `messages[]` array across turns
- **Authentication flows** — multi-step auth handshakes before the main API
- **Response normalization** — extracting content from provider-specific response formats
- **Token usage tracking** — accumulating usage metrics across a session
- **Audit logging** — recording every sent/received message for compliance or debugging

Plugins are registered globally via `PluginLoader` and executed in priority order. Multiple plugins can be active on a single connector simultaneously — for example, an auth plugin (priority 10) runs before an OpenAI conversation plugin (priority 50), which runs before an audit plugin (priority 200).

---

## 2. Quick Start

Here is a minimal plugin in ~20 lines:

```typescript
import type { ConnectorPlugin, PluginContext } from "@/lib/connectors/plugins/types";
import type { ConnectorResponse, MessageMetadata } from "@/lib/connectors/base";
import { PluginLoader } from "@/lib/connectors/plugins/loader";

const myPlugin: ConnectorPlugin = {
  id: "my-plugin",
  name: "My Custom Plugin",
  description: "Logs messages before they are sent.",
  version: "1.0.0",
  compatibleConnectors: ["HTTP_REST"],

  async beforeSend(message, _metadata, context) {
    console.log(`[my-plugin] Sending: ${message}`);
    return { message };
  },

  async afterReceive(response, context) {
    console.log(`[my-plugin] Received: ${response.content.slice(0, 100)}`);
    return { response };
  },
};

PluginLoader.register(myPlugin);
export { myPlugin };
```

Place this file in `lib/connectors/plugins/` and import it from your application entry point to trigger auto-registration.

---

## 3. Plugin Interface Reference

Every plugin implements the `ConnectorPlugin` interface defined in `lib/connectors/plugins/types.ts`.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (e.g., `"openai"`, `"my-plugin"`) |
| `name` | `string` | Human-readable name shown in the UI |
| `description` | `string` | What this plugin does |
| `version` | `string` | Semver version string (e.g., `"1.0.0"`) |
| `compatibleConnectors` | `string[]` | Connector types this plugin works with (e.g., `["HTTP_REST"]`) |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `priority` | `number` | `100` | Execution order — lower numbers run first. Auth plugins use `10`, conversation plugins use `50`, passive/audit plugins use `200`. |
| `minConnectorVersion` | `string` | — | Minimum connector version required (semver) |
| `configSchema` | `PluginConfigField[]` | — | Schema for dynamic UI form generation (see Section 6) |

### Lifecycle Hooks

| Hook | Signature | Description |
|------|-----------|-------------|
| `initialize` | `(context: PluginContext) => Promise<void>` | Set up initial state for a session |
| `beforeSend` | `(message: string, metadata: MessageMetadata \| undefined, context: PluginContext) => Promise<{ message: string; metadata?: Record<string, unknown> }>` | Transform or inspect the outgoing message |
| `afterReceive` | `(response: ConnectorResponse, context: PluginContext) => Promise<{ response: ConnectorResponse; metadata?: Record<string, unknown> }>` | Transform or inspect the incoming response |
| `onConnect` | `(config: ConnectorConfig, context: PluginContext) => Promise<ConnectorConfig>` | Modify connector config during connection (e.g., inject auth headers) |
| `onDisconnect` | `(context: PluginContext) => Promise<void>` | Clean up when the session ends |
| `onError` | `(error: Error, hookName: string, context: PluginContext) => void` | Called when any hook throws — for logging/recovery |

All hooks are optional. Implement only what you need.

---

## 4. Lifecycle Hooks Deep Dive

### `initialize(context)`

**When it fires:** Once per session, before any messages are sent.

**Purpose:** Set up initial plugin state in `context.state`.

```typescript
async initialize(context: PluginContext): Promise<void> {
  context.state.messages = [];
  context.state.totalTokens = 0;
  context.state.retryCount = 0;
}
```

**Return:** Nothing (`void`).

---

### `beforeSend(message, metadata, context)`

**When it fires:** Before every message is sent to the target endpoint.

**Purpose:** Transform the outgoing message, add metadata, log the send, or maintain conversation history.

```typescript
async beforeSend(
  message: string,
  metadata: MessageMetadata | undefined,
  context: PluginContext
): Promise<{ message: string; metadata?: Record<string, unknown> }> {
  // Add to conversation history
  const messages = context.state.messages as Array<{ role: string; content: string }>;
  messages.push({ role: "user", content: message });
  context.state.messages = messages;

  // Must return the message (modified or not)
  return { message };
}
```

**Return:** `{ message, metadata? }` — the message string (potentially modified) and optional metadata to pass downstream.

**Important:** To leave the message unchanged, return `{ message }` as-is. You must always return the message.

---

### `afterReceive(response, context)`

**When it fires:** After every response is received from the target endpoint.

**Purpose:** Transform the response, extract/normalize token usage, add to conversation history, or log the receive.

```typescript
async afterReceive(
  response: ConnectorResponse,
  context: PluginContext
): Promise<{ response: ConnectorResponse; metadata?: Record<string, unknown> }> {
  // Track assistant response in history
  const messages = context.state.messages as Array<{ role: string; content: string }>;
  messages.push({ role: "assistant", content: response.content });

  // Normalize token usage from raw response
  const raw = response.metadata.rawResponse as Record<string, any> | undefined;
  if (raw?.usage) {
    response.metadata.tokenUsage = {
      promptTokens: raw.usage.prompt_tokens,
      completionTokens: raw.usage.completion_tokens,
      totalTokens: raw.usage.total_tokens,
    };
  }

  return { response };
}
```

**Return:** `{ response, metadata? }` — the response object (potentially modified) and optional metadata.

---

### `onConnect(config, context)`

**When it fires:** When the connector establishes a connection, before any messages are sent.

**Purpose:** Perform auth handshakes, modify connector configuration (e.g., inject tokens into headers).

```typescript
async onConnect(
  config: ConnectorConfig,
  context: PluginContext
): Promise<ConnectorConfig> {
  // Fetch an auth token
  const res = await fetch("https://api.example.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "...", client_secret: "..." }),
  });
  const data = await res.json();

  // Inject the token into the connector config
  return {
    ...config,
    authType: "CUSTOM_HEADER",
    authConfig: {
      ...config.authConfig,
      headers: { Authorization: `Bearer ${data.token}` },
    },
  };
}
```

**Return:** The (potentially modified) `ConnectorConfig`.

---

### `onDisconnect(context)`

**When it fires:** When the session ends and the connector disconnects.

**Purpose:** Clean up plugin state, close resources, persist data.

```typescript
async onDisconnect(context: PluginContext): Promise<void> {
  context.state.messages = [];
  context.state.totalTokens = 0;
}
```

**Return:** Nothing (`void`).

---

### `onError(error, hookName, context)`

**When it fires:** When any of the plugin's own hooks throw an error.

**Purpose:** Log errors, attempt recovery, or alert monitoring.

```typescript
onError(error: Error, hookName: string, context: PluginContext): void {
  console.error(`[my-plugin] Error in ${hookName} for session ${context.sessionId}:`, error.message);
}
```

**Return:** Nothing (`void`). This is a synchronous callback.

---

## 5. Plugin Context

The `PluginContext` object is passed to every hook and provides shared state across the plugin's lifecycle.

```typescript
interface PluginContext {
  sessionId: string;                   // Current session ID
  targetId: string;                    // Target being tested
  state: Record<string, unknown>;      // Mutable state store
  connector: BaseConnector;            // The underlying connector instance
  pluginConfig?: Record<string, unknown>; // User-provided plugin configuration
}
```

### Using `context.state`

`context.state` is a mutable key-value store scoped to the plugin instance within a session. Use it to maintain state across hook calls.

```typescript
// In initialize()
context.state.requestCount = 0;
context.state.cache = new Map();

// In beforeSend()
context.state.requestCount = (context.state.requestCount as number) + 1;

// In afterReceive()
const cache = context.state.cache as Map<string, string>;
cache.set(cacheKey, response.content);
```

**Key rules:**
- State is per-session, per-plugin. Each session gets its own `context.state`.
- State is lost when `onDisconnect` fires (unless you persist it yourself).
- Use TypeScript type assertions when reading from state, since values are typed as `unknown`.

### Using `context.pluginConfig`

`context.pluginConfig` contains user-provided configuration values that match your `configSchema`. Access it in any hook:

```typescript
const model = context.pluginConfig?.model as string || "gpt-4";
const maxTokens = context.pluginConfig?.max_tokens as number || 1024;
```

---

## 6. Configuration Schema

Plugins can declare a `configSchema` to generate UI forms for user configuration. Each field in the schema becomes a form input.

### `PluginConfigField` Interface

```typescript
interface PluginConfigField {
  key: string;          // Config key (used in pluginConfig)
  label: string;        // Human-readable label
  type: "string" | "number" | "boolean" | "select" | "json";
  required: boolean;
  default?: unknown;    // Default value
  description: string;  // Help text
  options?: { label: string; value: string }[];  // For "select" type only
}
```

### Field Types

| Type | Renders As | Value Type |
|------|-----------|------------|
| `string` | Text input | `string` |
| `number` | Number input | `number` |
| `boolean` | Toggle/checkbox | `boolean` |
| `select` | Dropdown menu | `string` (from `options`) |
| `json` | JSON text area | `string` (valid JSON) |

### Example: Full Config Schema

```typescript
const configSchema: PluginConfigField[] = [
  {
    key: "model",
    label: "Model",
    type: "select",
    required: true,
    default: "gpt-4",
    description: "Model to use for completions",
    options: [
      { label: "GPT-4", value: "gpt-4" },
      { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
      { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
    ],
  },
  {
    key: "temperature",
    label: "Temperature",
    type: "number",
    required: false,
    default: 1,
    description: "Sampling temperature (0-2).",
  },
  {
    key: "systemPrompt",
    label: "System Prompt",
    type: "string",
    required: false,
    description: "System prompt prepended to the conversation.",
  },
  {
    key: "customHeaders",
    label: "Custom Headers",
    type: "json",
    required: false,
    description: "Additional headers as JSON object.",
  },
];
```

### Config Validation

`PluginLoader.validatePluginConfig(pluginId, config)` validates a config object against the schema and returns an array of error messages (empty array = valid):

```typescript
const errors = PluginLoader.validatePluginConfig("my-plugin", {
  model: "gpt-4",
  temperature: "not-a-number", // Error: must be a number
});
// errors: ['Field "temperature" must be a number']
```

---

## 7. Registration

Plugins must be registered with `PluginLoader` before they can be used.

### Auto-Registration Pattern

The standard pattern is to call `PluginLoader.register()` at the module level so registration happens on import:

```typescript
// lib/connectors/plugins/my-plugin.ts
import { PluginLoader } from "./loader";

const myPlugin: ConnectorPlugin = {
  id: "my-plugin",
  // ...
};

// Auto-register on import
PluginLoader.register(myPlugin);

export { myPlugin };
```

Then import the plugin in your application entry point or plugin index:

```typescript
// Import triggers auto-registration
import "./lib/connectors/plugins/my-plugin";
```

### Manual Registration

```typescript
import { PluginLoader } from "@/lib/connectors/plugins/loader";
import { myPlugin } from "./my-plugin";

PluginLoader.register(myPlugin);
```

### PluginLoader API

| Method | Description |
|--------|-------------|
| `register(plugin)` | Register a plugin (warns if ID already registered, then overwrites) |
| `unregister(pluginId)` | Remove a plugin by ID |
| `get(pluginId)` | Get a plugin by ID |
| `getAll()` | Get all registered plugins |
| `getCompatible(connectorType)` | Get plugins compatible with a connector type, sorted by priority |
| `getAllSorted()` | Get all plugins sorted by priority (ascending) |
| `listMetadata()` | Get metadata for all plugins (id, name, description, version, etc.) |
| `getPluginConfig(pluginId)` | Get a plugin's `configSchema` |
| `validatePluginConfig(pluginId, config)` | Validate config against schema, returns error strings |
| `isRegistered(pluginId)` | Check if a plugin is registered |
| `clear()` | Remove all plugins (for testing) |

---

## 8. Testing Your Plugin

Use the mock chatbot server for development and testing.

### 1. Start the Mock Server

```bash
npx tsx tests/mocks/chatbot-server.ts
```

The server runs on `http://localhost:3001` with OpenAI-compatible endpoints. See `docs/MOCK_CHATBOT.md` for full documentation.

### 2. Write a Test

```typescript
import { MockChatbotServer } from "../../tests/mocks/chatbot-server";
import { PluginLoader } from "./loader";
import { myPlugin } from "./my-plugin";

describe("my-plugin", () => {
  let server: MockChatbotServer;

  beforeAll(async () => {
    server = new MockChatbotServer(3001, true); // testMode = true
    await server.start();
    PluginLoader.register(myPlugin);
  });

  afterAll(async () => {
    await server.stop();
    PluginLoader.clear();
  });

  beforeEach(() => {
    server.reset(); // Clear message history and counters
  });

  it("should transform messages in beforeSend", async () => {
    const context = {
      sessionId: "test-session",
      targetId: "test-target",
      state: {},
      connector: {} as any,
      pluginConfig: { model: "gpt-4" },
    };

    await myPlugin.initialize?.(context);
    const result = await myPlugin.beforeSend?.("hello", undefined, context);
    expect(result?.message).toBeDefined();
  });
});
```

### 3. Test with Different Personas

Use personas to test edge cases:

- **`rate-limited`** — test retry logic (429 every 3rd request)
- **`flaky`** — test error handling (random 500s, timeouts, empty responses)
- **`ecommerce`** — test long/structured responses
- **`code`** — test responses that grow over a session
- **`support`** — test JSON response parsing

Set the persona via the `X-Persona` header when sending requests.

---

## 9. Examples Walkthrough

Krawall ships with four built-in plugins. Each demonstrates a different pattern.

### OpenAI Plugin (`openai-plugin.ts`)

**Purpose:** Conversation history management and token usage normalization for OpenAI-compatible APIs.

**Key patterns:**
- **`initialize`**: Creates an empty `messages[]` array and optionally adds a system prompt
- **`beforeSend`**: Pushes the user message onto `context.state.messages`
- **`afterReceive`**: Pushes the assistant response, normalizes `usage.prompt_tokens` / `usage.completion_tokens` to the standard `tokenUsage` format
- **`onDisconnect`**: Clears history and token counter
- **Priority:** `50` — runs after auth but before audit

### Anthropic Plugin (`anthropic-plugin.ts`)

**Purpose:** Same as OpenAI but for Anthropic's Messages API format.

**Key patterns:**
- **`beforeSend`**: Enforces user/assistant role alternation (replaces consecutive user messages instead of stacking)
- **`afterReceive`**: Extracts content from `content[0].text` format, normalizes `usage.input_tokens` / `usage.output_tokens`
- **System prompt**: Passed via metadata (Anthropic uses a dedicated `system` parameter, not in the messages array)
- **Priority:** `50`

### Multi-Step Auth Plugin (`multi-step-auth-plugin.ts`)

**Purpose:** Performs an auth handshake (e.g., POST credentials to get a bearer token) before the main API calls.

**Key patterns:**
- **`onConnect`**: Sends a `fetch()` to the configured `authEndpoint`, extracts the token from the response using a configurable JSON path (`tokenPath`), then injects it into the connector's headers
- **Config-driven**: All auth details (endpoint, method, body, token path, header name, prefix) come from `configSchema`
- **`getValueAtPath` utility**: Supports dot-notation and bracket paths (e.g., `data.access_token`, `$.data[0].token`)
- **Priority:** `10` — runs first so auth headers are available for all subsequent plugins

### Audit Plugin (`audit-plugin.ts`)

**Purpose:** Passively records all messages and responses for compliance/debugging.

**Key patterns:**
- **Passive**: Never modifies messages or responses — returns them unchanged
- **`beforeSend`**: Records send timestamp and message content
- **`afterReceive`**: Records response content, response time (calculated from send timestamp), and token usage
- **In-memory storage**: Uses a module-level `Map<string, AuditLogEntry[]>` keyed by session ID
- **Exported utilities**: `getAuditLog(sessionId?)` and `clearAuditLog(sessionId?)` for reading/clearing logs
- **Priority:** `200` — runs last so it captures the final transformed state
- **Wide compatibility**: `["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"]`

---

## 10. Common Patterns

### Rate-Limit Handling with Retry

```typescript
const retryPlugin: ConnectorPlugin = {
  id: "retry-on-429",
  name: "Retry on Rate Limit",
  description: "Retries requests that receive 429 responses.",
  version: "1.0.0",
  compatibleConnectors: ["HTTP_REST"],
  priority: 90,

  async initialize(context) {
    context.state.maxRetries = 3;
    context.state.retryCount = 0;
  },

  async afterReceive(response, context) {
    const raw = response.metadata.rawResponse as Record<string, any> | undefined;

    // Check for rate limit in raw response
    if (raw?.status === 429 && (context.state.retryCount as number) < (context.state.maxRetries as number)) {
      context.state.retryCount = (context.state.retryCount as number) + 1;
      const retryAfter = raw.headers?.["retry-after"] || 2;
      console.log(`[retry] Rate limited, retrying in ${retryAfter}s (attempt ${context.state.retryCount}/${context.state.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      // Note: actual retry logic requires re-sending via context.connector
    }

    context.state.retryCount = 0;
    return { response };
  },

  onError(error, hookName) {
    console.error(`[retry] Error in ${hookName}:`, error.message);
  },
};
```

### Response Caching

```typescript
const cachePlugin: ConnectorPlugin = {
  id: "response-cache",
  name: "Response Cache",
  description: "Caches responses by message content.",
  version: "1.0.0",
  compatibleConnectors: ["HTTP_REST"],
  priority: 40,

  async initialize(context) {
    context.state.cache = new Map<string, { content: string; timestamp: number }>();
    context.state.ttlMs = 60_000; // 1 minute TTL
  },

  async beforeSend(message, metadata, context) {
    const cache = context.state.cache as Map<string, { content: string; timestamp: number }>;
    const ttl = context.state.ttlMs as number;
    const cached = cache.get(message);

    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`[cache] Cache hit for: ${message.slice(0, 50)}`);
      // Note: returning the cached content would require connector-level support
    }

    return { message };
  },

  async afterReceive(response, context) {
    const cache = context.state.cache as Map<string, { content: string; timestamp: number }>;
    // Store response in cache (keyed by the last sent message)
    // In practice, you'd track the message from beforeSend
    return { response };
  },
};
```

### Request/Response Logging

```typescript
const logPlugin: ConnectorPlugin = {
  id: "request-logger",
  name: "Request Logger",
  description: "Logs all requests and responses with timing.",
  version: "1.0.0",
  compatibleConnectors: ["HTTP_REST"],
  priority: 200,

  async initialize(context) {
    context.state.sendTime = 0;
  },

  async beforeSend(message, metadata, context) {
    context.state.sendTime = Date.now();
    console.log(`[log] >>> Sending to ${context.targetId}: ${message.slice(0, 100)}`);
    return { message };
  },

  async afterReceive(response, context) {
    const elapsed = Date.now() - (context.state.sendTime as number);
    console.log(`[log] <<< Received from ${context.targetId} in ${elapsed}ms: ${response.content.slice(0, 100)}`);
    return { response };
  },
};
```

### Token Budget Enforcement

```typescript
const budgetPlugin: ConnectorPlugin = {
  id: "token-budget",
  name: "Token Budget",
  description: "Enforces a per-session token budget.",
  version: "1.0.0",
  compatibleConnectors: ["HTTP_REST"],
  priority: 80,

  configSchema: [
    {
      key: "maxTokens",
      label: "Max Tokens",
      type: "number",
      required: true,
      default: 10000,
      description: "Maximum total tokens allowed per session.",
    },
  ],

  async initialize(context) {
    context.state.usedTokens = 0;
    context.state.maxTokens = (context.pluginConfig?.maxTokens as number) || 10000;
  },

  async afterReceive(response, context) {
    const usage = response.metadata.tokenUsage;
    if (usage?.totalTokens) {
      context.state.usedTokens = (context.state.usedTokens as number) + usage.totalTokens;
    }

    const max = context.state.maxTokens as number;
    const used = context.state.usedTokens as number;

    if (used >= max) {
      console.warn(`[budget] Token budget exhausted: ${used}/${max}`);
    }

    return { response };
  },
};
```

---

## 11. Troubleshooting

### Plugin Not Loading

- Ensure the file is imported somewhere in the application (import triggers auto-registration).
- Check that `PluginLoader.isRegistered("your-plugin-id")` returns `true`.
- Check the console for warnings about duplicate IDs or incompatible connector types.

### Hooks Not Firing

- Verify `compatibleConnectors` includes the connector type you're using (e.g., `"HTTP_REST"`).
- Check `priority` — a lower-priority (higher number) plugin that errors in `onError` might mask issues.
- Ensure you're returning the correct shape from hooks (`{ message }` from `beforeSend`, `{ response }` from `afterReceive`).

### State Not Persisting Between Messages

- Confirm you're writing to `context.state` (not a local variable).
- `context.state` is scoped per session — a new session gets a fresh state.
- `onDisconnect` typically clears state. Make sure you're not disconnecting between messages.

### Config Validation Errors

- Use `PluginLoader.validatePluginConfig(pluginId, config)` to check before passing config.
- `required: true` fields must be present and non-empty.
- `select` fields must match one of the declared `options[].value` strings.
- `json` fields must be valid JSON strings.

### Auth Plugin Failing

- Check that the `authEndpoint` is reachable from the server.
- Verify the `tokenPath` matches the auth response structure (use dot-notation like `data.access_token`).
- Check the `authMethod` — some endpoints require `GET` instead of `POST`.
- If the token is nested in an array, use bracket notation: `data.tokens[0].value`.

### Mock Server Not Responding

- Verify the mock server is running: `curl http://localhost:3001/health`
- Check the port: default is `3001`, override with `MOCK_PORT` env var.
- In test mode (`testMode: true`), random delays and errors are disabled for determinism.
- Call `server.reset()` between tests to clear accumulated session state.
