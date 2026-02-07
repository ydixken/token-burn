# Template & Preset Reference

This document covers Krawall's template system: how request and response templates work, available provider presets, and how to develop connector plugins.

---

## Table of Contents

- [Overview](#overview)
- [JSON Path Syntax](#json-path-syntax)
- [Request Templates](#request-templates)
- [Response Templates](#response-templates)
- [Template Validation](#template-validation)
- [Provider Presets](#provider-presets)
- [Plugin Development Guide](#plugin-development-guide)

---

## Overview

Templates are the mechanism Krawall uses to communicate with any chatbot or LLM API. Every target needs two templates:

1. **Request Template** — Defines how to build the outgoing API request by injecting the test message into the correct location in the JSON payload.
2. **Response Template** — Defines how to extract the chatbot's reply (and optionally token usage) from the API response.

Templates use a JSON path syntax to reference nested fields.

---

## JSON Path Syntax

Krawall supports a simplified JSON path syntax for both request and response templates.

### Format

Paths follow the pattern: `field.nestedField.arrayIndex.deeperField`

| Syntax | Meaning | Example |
|--------|---------|---------|
| `field` | Top-level key | `response` |
| `field.nested` | Nested object | `message.content` |
| `field.0` | Array index | `messages.0` |
| `field.0.nested` | Array element field | `choices.0.message.content` |
| `$.field` | Explicit root prefix | `$.choices.0.message.content` |

### Rules

- The leading `$.` prefix is optional and is stripped before evaluation.
- Array indices are numeric (e.g., `0`, `1`).
- Bracket notation (`messages[0].content`) is also supported and equivalent to dot notation (`messages.0.content`).
- Paths are case-sensitive.

### Examples

| Path | Target |
|------|--------|
| `message` | `{ "message": "..." }` |
| `messages.0.content` | `{ "messages": [{ "content": "..." }] }` |
| `choices.0.message.content` | `{ "choices": [{ "message": { "content": "..." } }] }` |
| `content.0.text` | `{ "content": [{ "text": "..." }] }` |
| `candidates.0.content.parts.0.text` | Gemini-style nested response |

---

## Request Templates

A request template tells Krawall how to construct the JSON payload for each API call.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messagePath` | string | Yes | JSON path where the test message is inserted |
| `structure` | object | No | Base JSON structure to use as the payload template |
| `variables` | object | No | Key-value pairs substituted into the structure |

### How It Works

1. The `structure` is deep-cloned for each request.
2. The test message string is set at `messagePath` within the cloned structure.
3. If `variables` are defined, any matching placeholders (`${key}` or literal key matches) in the structure are replaced with their values.

### Example: OpenAI

```json
{
  "messagePath": "messages.0.content",
  "structure": {
    "model": "gpt-4",
    "messages": [{ "role": "user", "content": "" }],
    "max_tokens": 1024
  },
  "variables": { "model": "gpt-4" }
}
```

Sending `"Hello"` produces:

```json
{
  "model": "gpt-4",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 1024
}
```

### Example: Simple Chat API

```json
{
  "messagePath": "message",
  "structure": { "message": "" }
}
```

Sending `"Hello"` produces:

```json
{ "message": "Hello" }
```

---

## Response Templates

A response template tells Krawall how to extract the chatbot reply from the API response.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentPath` | string | Yes | JSON path to the response text |
| `tokenUsagePath` | string | No | JSON path to token usage data |
| `errorPath` | string | No | JSON path to error messages |
| `transform` | string | No | Content transformation: `"none"`, `"markdown"`, `"html"` |

### Content Extraction

The value at `contentPath` is extracted and converted to a string. If the value is `null` or `undefined`, an error is thrown.

### Token Usage Extraction

If `tokenUsagePath` is set, the object at that path is extracted as token usage data. Different providers use different field names:

| Provider | Path | Fields |
|----------|------|--------|
| OpenAI | `usage` | `prompt_tokens`, `completion_tokens`, `total_tokens` |
| Anthropic | `usage` | `input_tokens`, `output_tokens` |
| Gemini | `usageMetadata` | `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount` |

### Transforms

| Value | Behavior |
|-------|----------|
| `"none"` | Return content as-is (default) |
| `"markdown"` | Strip common Markdown syntax (headings, bold, italic, code) |
| `"html"` | Strip HTML tags |

### Example: OpenAI

```json
{
  "contentPath": "choices.0.message.content",
  "tokenUsagePath": "usage",
  "errorPath": "error.message"
}
```

Given the response:

```json
{
  "choices": [{ "message": { "content": "Hello!" } }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

Extracts: content = `"Hello!"`, usage = `{ prompt_tokens: 10, ... }`.

---

## Template Validation

Use the `POST /api/templates/validate` endpoint to test templates before saving a target.

### What It Validates

- **Request template**: Verifies the `messagePath` can be set and read back within the `structure`.
- **Response template**: Verifies the `contentPath`, `tokenUsagePath`, and `errorPath` can extract values from a `sampleResponse`.

### Usage

```bash
curl -X POST http://localhost:3000/api/templates/validate \
  -H "Content-Type: application/json" \
  -d '{
    "requestTemplate": {
      "messagePath": "messages.0.content",
      "structure": { "messages": [{ "role": "user", "content": "" }] }
    },
    "responseTemplate": {
      "contentPath": "choices.0.message.content"
    },
    "sampleResponse": {
      "choices": [{ "message": { "content": "Test reply" } }]
    }
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "valid": true,
    "results": [
      {
        "field": "requestTemplate.messagePath",
        "valid": true,
        "message": "Path \"messages.0.content\" is valid and writable"
      },
      {
        "field": "responseTemplate.contentPath",
        "valid": true,
        "message": "Found content at \"choices.0.message.content\": Test reply"
      }
    ]
  }
}
```

When a path is invalid, the result includes `suggestion` — an array of available paths discovered in the structure (up to 2 levels deep).

See [API.md](API.md#template-validation) for the full endpoint reference.

---

## Provider Presets

Presets are pre-configured template bundles for popular LLM providers. They are available via `GET /api/presets` and can be used in the Target Setup Wizard to quickly create targets.

### Available Presets

| ID | Name | Connector | Auth | Description |
|----|------|-----------|------|-------------|
| `openai-chat` | OpenAI Chat Completions | HTTP_REST | Bearer Token | GPT-4, GPT-3.5-turbo via /v1/chat/completions |
| `anthropic-messages` | Anthropic Messages | HTTP_REST | Custom Header | Claude models via /v1/messages |
| `google-gemini` | Google Gemini | HTTP_REST | API Key | Gemini models via generativelanguage API |
| `azure-openai` | Azure OpenAI | HTTP_REST | API Key | OpenAI models on Azure infrastructure |
| `ollama` | Ollama | HTTP_REST | None | Locally-hosted models (llama3, mistral, etc.) |
| `custom-http` | Custom HTTP | HTTP_REST | Bearer Token | Blank template for any REST API |
| `custom-websocket` | Custom WebSocket | WEBSOCKET | None | Blank template for WebSocket APIs |
| `custom-grpc` | Custom gRPC | GRPC | None | Blank template for gRPC services |

### Preset Structure

Each preset includes:

- **id** / **name** / **description** — Identification and display.
- **connectorType** — Protocol (HTTP_REST, WEBSOCKET, GRPC, SSE).
- **defaultEndpoint** — Pre-filled endpoint URL.
- **authType** / **authFields** — Authentication method and field definitions for the setup form.
- **requestTemplate** / **responseTemplate** — Pre-configured templates.
- **documentation** — Markdown-formatted setup guide.
- **exampleResponse** — Sample API response for template validation.

### Using a Preset

1. Fetch presets: `GET /api/presets`
2. Select a preset by ID.
3. The preset's `requestTemplate`, `responseTemplate`, `authType`, and `defaultEndpoint` pre-fill the target creation form.
4. The user provides credentials (via `authFields`) and optionally customizes templates.
5. Use `POST /api/templates/validate` with the preset's `exampleResponse` to verify the templates work.
6. Create the target: `POST /api/targets`.

---

## Plugin Development Guide

Krawall's connector system is extensible through plugins. A connector plugin implements a protocol-specific communication layer by extending the `BaseConnector` abstract class.

### Architecture

```
lib/connectors/
  base.ts           # BaseConnector abstract class + interfaces
  http.ts           # HTTPConnector implementation
  registry.ts       # ConnectorRegistry (plugin registration)
  presets.ts         # Provider preset definitions
```

### Creating a Connector Plugin

#### 1. Extend BaseConnector

```typescript
import { BaseConnector, ConnectorConfig, ConnectorResponse, HealthStatus, MessageMetadata } from "./base";

export class MyProtocolConnector extends BaseConnector {
  private connected = false;

  async connect(): Promise<void> {
    // Establish connection to target endpoint
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Close connection
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendMessage(message: string, metadata?: MessageMetadata): Promise<ConnectorResponse> {
    const startTime = Date.now();

    // 1. Build the request payload using the template
    const payload = this.applyRequestTemplate(message);

    // 2. Send to the target endpoint
    // ... your protocol-specific logic ...

    // 3. Extract the response using the template
    const content = this.extractResponse(rawResponse);
    const tokenUsage = this.extractTokenUsage(rawResponse);

    return {
      content,
      metadata: {
        responseTimeMs: Date.now() - startTime,
        tokenUsage,
        rawResponse,
      },
    };
  }

  supportsStreaming(): boolean {
    return false; // Override if your protocol supports streaming
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Verify connectivity
      return { healthy: true, latencyMs: Date.now() - start, timestamp: new Date() };
    } catch (error) {
      return { healthy: false, error: (error as Error).message, timestamp: new Date() };
    }
  }
}
```

#### 2. Register with ConnectorRegistry

```typescript
import { ConnectorRegistry } from "./registry";
import { MyProtocolConnector } from "./my-protocol";

ConnectorRegistry.register("MY_PROTOCOL", MyProtocolConnector);
```

#### 3. Add a Preset (Optional)

Add an entry to the `PROVIDER_PRESETS` array in `lib/connectors/presets.ts`:

```typescript
{
  id: "my-service",
  name: "My Service",
  description: "Description of the service",
  icon: "my-icon",
  connectorType: "MY_PROTOCOL",
  defaultEndpoint: "https://api.myservice.com",
  authType: "BEARER_TOKEN",
  authFields: [
    { key: "token", label: "API Key", type: "password", placeholder: "...", required: true }
  ],
  requestTemplate: { messagePath: "...", structure: { ... } },
  responseTemplate: { contentPath: "...", tokenUsagePath: "..." },
  documentation: "## My Service\n\n...",
  exampleResponse: { ... }
}
```

### BaseConnector Helpers

These protected methods are available in all connector subclasses:

| Method | Description |
|--------|-------------|
| `applyRequestTemplate(message)` | Wraps a message string into the configured request payload |
| `extractResponse(rawResponse)` | Extracts the content string from a raw API response |
| `extractTokenUsage(rawResponse)` | Extracts token usage data (or undefined) |
| `buildAuthHeaders()` | Builds auth headers based on `authType` and `authConfig` |

### Key Interfaces

| Interface | Description |
|-----------|-------------|
| `ConnectorConfig` | Full connector configuration (endpoint, auth, templates, etc.) |
| `ConnectorResponse` | Response object with `content` and `metadata` |
| `ResponseMetadata` | Includes `responseTimeMs`, `tokenUsage`, `rawResponse`, `headers` |
| `HealthStatus` | Health check result with `healthy`, `latencyMs`, `error`, `timestamp` |
| `MessageMetadata` | Per-message metadata: `sessionId`, `messageIndex`, `timestamp` |

See `lib/connectors/base.ts` for the full type definitions.
