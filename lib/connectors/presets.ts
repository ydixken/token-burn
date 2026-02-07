/**
 * Provider Presets
 *
 * Pre-configured templates for common LLM/chatbot providers.
 * Each preset includes endpoint, auth, request/response templates,
 * and documentation to help users set up targets quickly.
 */

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  connectorType: "HTTP_REST" | "WEBSOCKET" | "GRPC" | "SSE";
  defaultEndpoint: string;
  authType: "NONE" | "BEARER_TOKEN" | "API_KEY" | "BASIC_AUTH" | "CUSTOM_HEADER" | "OAUTH2";
  authFields: AuthField[];
  requestTemplate: {
    messagePath: string;
    structure: Record<string, unknown>;
    variables?: Record<string, unknown>;
  };
  responseTemplate: {
    contentPath: string;
    tokenUsagePath?: string;
    errorPath?: string;
  };
  documentation: string;
  exampleResponse: Record<string, unknown>;
}

export interface AuthField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // 1. OpenAI Chat Completions
  {
    id: "openai-chat",
    name: "OpenAI Chat Completions",
    description: "GPT-4, GPT-3.5-turbo, and other OpenAI chat models via the /v1/chat/completions endpoint.",
    icon: "openai",
    connectorType: "HTTP_REST",
    defaultEndpoint: "https://api.openai.com",
    authType: "BEARER_TOKEN",
    authFields: [
      {
        key: "token",
        label: "API Key",
        type: "password",
        placeholder: "sk-...",
        required: true,
      },
    ],
    requestTemplate: {
      messagePath: "messages.0.content",
      structure: {
        model: "gpt-4",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1024,
      },
      variables: { model: "gpt-4" },
    },
    responseTemplate: {
      contentPath: "choices.0.message.content",
      tokenUsagePath: "usage",
      errorPath: "error.message",
    },
    documentation: `## OpenAI Chat Completions

### Authentication
Requires an API key from [platform.openai.com](https://platform.openai.com/api-keys).
Pass it as a Bearer token in the Authorization header.

### Request Format
\`\`\`json
{
  "model": "gpt-4",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 1024
}
\`\`\`

### Models
- \`gpt-4\`, \`gpt-4-turbo\`, \`gpt-4o\`
- \`gpt-3.5-turbo\`

### Rate Limits
Check your organization's rate limits at the OpenAI dashboard.`,
    exampleResponse: {
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: 1677858242,
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello! How can I help you today?" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
    },
  },

  // 2. Anthropic Messages
  {
    id: "anthropic-messages",
    name: "Anthropic Messages",
    description: "Claude models via the Anthropic Messages API (v1/messages).",
    icon: "anthropic",
    connectorType: "HTTP_REST",
    defaultEndpoint: "https://api.anthropic.com",
    authType: "CUSTOM_HEADER",
    authFields: [
      {
        key: "x-api-key",
        label: "API Key",
        type: "password",
        placeholder: "sk-ant-...",
        required: true,
      },
      {
        key: "anthropic-version",
        label: "API Version",
        type: "text",
        placeholder: "2023-06-01",
        required: true,
      },
    ],
    requestTemplate: {
      messagePath: "messages.0.content",
      structure: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [{ role: "user", content: "" }],
      },
      variables: { model: "claude-sonnet-4-5-20250929" },
    },
    responseTemplate: {
      contentPath: "content.0.text",
      tokenUsagePath: "usage",
      errorPath: "error.message",
    },
    documentation: `## Anthropic Messages API

### Authentication
Requires an API key from [console.anthropic.com](https://console.anthropic.com/).
Pass it via the \`x-api-key\` header. Also requires \`anthropic-version\` header.

### Request Format
\`\`\`json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 1024,
  "messages": [{ "role": "user", "content": "Hello" }]
}
\`\`\`

### Models
- \`claude-sonnet-4-5-20250929\`, \`claude-haiku-4-5-20251001\`

### Headers
- \`x-api-key\`: Your API key
- \`anthropic-version\`: API version (e.g., \`2023-06-01\`)
- \`content-type\`: \`application/json\``,
    exampleResponse: {
      id: "msg_abc123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello! How can I assist you today?" }],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 15 },
    },
  },

  // 3. Google Gemini
  {
    id: "google-gemini",
    name: "Google Gemini",
    description: "Google Gemini models via the generativelanguage API with API key authentication.",
    icon: "google",
    connectorType: "HTTP_REST",
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    authType: "API_KEY",
    authFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "AI...",
        required: true,
      },
      {
        key: "headerName",
        label: "Query Parameter Name",
        type: "text",
        placeholder: "key",
        required: true,
      },
    ],
    requestTemplate: {
      messagePath: "contents.0.parts.0.text",
      structure: {
        contents: [{ parts: [{ text: "" }] }],
      },
    },
    responseTemplate: {
      contentPath: "candidates.0.content.parts.0.text",
      tokenUsagePath: "usageMetadata",
      errorPath: "error.message",
    },
    documentation: `## Google Gemini API

### Authentication
Requires an API key from [Google AI Studio](https://aistudio.google.com/apikey).
The key is passed as a \`key\` query parameter on the URL.

### Endpoint
\`POST /v1/models/{model}:generateContent?key=YOUR_KEY\`

Set the endpoint to include the model name, e.g.:
\`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent\`

### Request Format
\`\`\`json
{
  "contents": [{ "parts": [{ "text": "Hello" }] }]
}
\`\`\`

### Models
- \`gemini-pro\`, \`gemini-1.5-pro\`, \`gemini-1.5-flash\``,
    exampleResponse: {
      candidates: [
        {
          content: {
            parts: [{ text: "Hello! How can I help you today?" }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 10,
        totalTokenCount: 15,
      },
    },
  },

  // 4. Azure OpenAI
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    description: "OpenAI models deployed on Azure with Azure-specific endpoint and api-version query parameter.",
    icon: "azure",
    connectorType: "HTTP_REST",
    defaultEndpoint: "https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions",
    authType: "API_KEY",
    authFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "Your Azure OpenAI key",
        required: true,
      },
      {
        key: "headerName",
        label: "Header Name",
        type: "text",
        placeholder: "api-key",
        required: true,
      },
    ],
    requestTemplate: {
      messagePath: "messages.0.content",
      structure: {
        messages: [{ role: "user", content: "" }],
        max_tokens: 1024,
      },
    },
    responseTemplate: {
      contentPath: "choices.0.message.content",
      tokenUsagePath: "usage",
      errorPath: "error.message",
    },
    documentation: `## Azure OpenAI

### Authentication
Requires an API key from the Azure portal. Pass it via the \`api-key\` header.

### Endpoint Format
\`https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-02-01\`

Replace:
- \`{resource-name}\`: Your Azure OpenAI resource name
- \`{deployment-id}\`: Your model deployment name

### Request Format
Same as OpenAI Chat Completions:
\`\`\`json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 1024
}
\`\`\`

### Query Parameters
- \`api-version\`: Required (e.g., \`2024-02-01\`)`,
    exampleResponse: {
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: 1677858242,
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello! How can I help you?" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    },
  },

  // 5. Ollama
  {
    id: "ollama",
    name: "Ollama",
    description: "Locally-hosted models via Ollama's HTTP API. No authentication required.",
    icon: "ollama",
    connectorType: "HTTP_REST",
    defaultEndpoint: "http://localhost:11434",
    authType: "NONE",
    authFields: [],
    requestTemplate: {
      messagePath: "messages.0.content",
      structure: {
        model: "llama3",
        messages: [{ role: "user", content: "" }],
        stream: false,
      },
      variables: { model: "llama3" },
    },
    responseTemplate: {
      contentPath: "message.content",
      errorPath: "error",
    },
    documentation: `## Ollama

### Authentication
No authentication required — Ollama runs locally.

### Endpoint
Default: \`http://localhost:11434/api/chat\`

### Request Format
\`\`\`json
{
  "model": "llama3",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": false
}
\`\`\`

### Models
Install models with \`ollama pull <model>\`:
- \`llama3\`, \`llama3:70b\`
- \`mistral\`, \`mixtral\`
- \`codellama\`

### Notes
- Set \`stream: false\` for single-response mode
- Default port is 11434`,
    exampleResponse: {
      model: "llama3",
      created_at: "2024-01-01T00:00:00Z",
      message: { role: "assistant", content: "Hello! How can I help you today?" },
      done: true,
      total_duration: 1234567890,
      eval_count: 15,
      eval_duration: 987654321,
    },
  },

  // 6. Custom HTTP
  {
    id: "custom-http",
    name: "Custom HTTP",
    description: "Blank HTTP/REST template for any API endpoint. Configure request and response templates manually.",
    icon: "http",
    connectorType: "HTTP_REST",
    defaultEndpoint: "https://",
    authType: "BEARER_TOKEN",
    authFields: [
      {
        key: "token",
        label: "Auth Token",
        type: "password",
        placeholder: "Your API token",
        required: false,
      },
    ],
    requestTemplate: {
      messagePath: "message",
      structure: {
        message: "",
      },
    },
    responseTemplate: {
      contentPath: "response",
      errorPath: "error",
    },
    documentation: `## Custom HTTP Endpoint

### Setup
1. Set the endpoint URL
2. Configure authentication (Bearer token, API key, or custom headers)
3. Define the request template with the JSON path to insert messages
4. Define the response template with the JSON path to extract responses

### Request Template
The \`messagePath\` tells Krawall where to insert the test message.
The \`structure\` is the base JSON payload sent to your API.

### Response Template
The \`contentPath\` tells Krawall where to find the response text.
The \`tokenUsagePath\` (optional) extracts token usage metrics.
The \`errorPath\` (optional) extracts error messages from failed requests.`,
    exampleResponse: {
      response: "Example response text",
      metadata: {
        tokens: 10,
      },
    },
  },

  // 7. Custom WebSocket
  {
    id: "custom-websocket",
    name: "Custom WebSocket",
    description: "Blank WebSocket template for real-time chat APIs. Configure message format manually.",
    icon: "websocket",
    connectorType: "WEBSOCKET",
    defaultEndpoint: "wss://",
    authType: "NONE",
    authFields: [
      {
        key: "token",
        label: "Auth Token (optional)",
        type: "password",
        placeholder: "Connection token",
        required: false,
      },
    ],
    requestTemplate: {
      messagePath: "message",
      structure: {
        type: "message",
        message: "",
      },
    },
    responseTemplate: {
      contentPath: "data.content",
      errorPath: "error.message",
    },
    documentation: `## Custom WebSocket Endpoint

### Setup
1. Set the WebSocket URI (wss:// or ws://)
2. Configure authentication if needed (token in query params or initial message)
3. Define the message JSON format for sending messages
4. Define the response format for extracting replies

### Connection
The connector will establish a persistent WebSocket connection.
Messages are sent as JSON frames.

### Notes
- Use \`wss://\` for secure connections
- Auth tokens can be passed via query parameters or in the initial handshake`,
    exampleResponse: {
      type: "response",
      data: {
        content: "Example WebSocket response",
        timestamp: "2024-01-01T00:00:00Z",
      },
    },
  },

  // 8. Custom gRPC
  {
    id: "custom-grpc",
    name: "Custom gRPC",
    description: "Blank gRPC template for protobuf-based chat services. Requires a .proto file path.",
    icon: "grpc",
    connectorType: "GRPC",
    defaultEndpoint: "localhost:50051",
    authType: "NONE",
    authFields: [
      {
        key: "token",
        label: "Auth Token (optional)",
        type: "password",
        placeholder: "gRPC metadata token",
        required: false,
      },
    ],
    requestTemplate: {
      messagePath: "message",
      structure: {
        message: "",
        metadata: {},
      },
    },
    responseTemplate: {
      contentPath: "content",
      errorPath: "error",
    },
    documentation: `## Custom gRPC Endpoint

### Setup
1. Set the gRPC server address (host:port)
2. Provide the path to your \`.proto\` file in protocol config
3. Specify the service and method names
4. Configure the message and response field mappings

### Protocol Config
\`\`\`json
{
  "protoPath": "/path/to/service.proto",
  "serviceName": "ChatService",
  "methodName": "SendMessage",
  "useTLS": false
}
\`\`\`

### Notes
- TLS can be enabled via \`useTLS\` in protocol config
- Auth metadata can be passed via custom headers`,
    exampleResponse: {
      content: "Example gRPC response",
      metadata: {
        requestId: "req-123",
      },
    },
  },
];

/**
 * Get all provider presets
 */
export function getAllPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
