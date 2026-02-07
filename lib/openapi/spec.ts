/**
 * OpenAPI 3.0 Specification for Krawall API
 */

export function getOpenAPISpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Krawall API",
      description:
        "REST API for Krawall — a chatbot stress-testing platform for testing conversational AI systems through realistic, high-volume conversation flows.",
      version: "1.0.0",
      contact: {
        name: "Krawall Team",
      },
    },
    servers: [
      {
        url: "{protocol}://{host}",
        variables: {
          protocol: { default: "http", enum: ["http", "https"] },
          host: { default: "localhost:3000" },
        },
      },
    ],
    tags: [
      { name: "Health", description: "System health checks" },
      { name: "Targets", description: "Chatbot endpoint management" },
      { name: "Scenarios", description: "Test scenario management" },
      { name: "Sessions", description: "Test execution sessions" },
      { name: "Execution", description: "Fire-and-forget session execution" },
      { name: "Metrics", description: "Performance metrics and analytics" },
      { name: "Webhooks", description: "Webhook notification management" },
      { name: "Dashboard", description: "Dashboard aggregated statistics" },
      { name: "Settings", description: "Application settings" },
      { name: "Presets", description: "Provider presets" },
      { name: "Plugins", description: "Connector plugin management" },
      { name: "Compare", description: "A/B comparison testing" },
    ],
    paths: {
      // ─── Health ───
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Returns service health status including database and Redis connectivity.",
          responses: {
            "200": {
              description: "Service is healthy",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                  example: {
                    status: "ok",
                    timestamp: "2024-01-15T10:30:00.000Z",
                    services: { database: "connected", redis: "connected" },
                  },
                },
              },
            },
          },
        },
      },

      // ─── Targets ───
      "/api/targets": {
        get: {
          tags: ["Targets"],
          summary: "List all targets",
          description: "Returns all chatbot endpoint targets with optional filtering.",
          parameters: [
            {
              name: "isActive",
              in: "query",
              schema: { type: "string", enum: ["true", "false"] },
              description: "Filter by active status",
            },
            {
              name: "connectorType",
              in: "query",
              schema: { type: "string", enum: ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"] },
              description: "Filter by connector type",
            },
          ],
          responses: {
            "200": {
              description: "List of targets",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { type: "array", items: { $ref: "#/components/schemas/TargetSummary" } },
                          count: { type: "integer" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        post: {
          tags: ["Targets"],
          summary: "Create a new target",
          description: "Create a new chatbot endpoint target. Auth credentials are encrypted at rest.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateTargetRequest" },
                example: {
                  name: "My OpenAI Bot",
                  description: "GPT-4 chatbot endpoint",
                  connectorType: "HTTP_REST",
                  endpoint: "https://api.openai.com/v1/chat/completions",
                  authType: "BEARER_TOKEN",
                  authConfig: { token: "sk-..." },
                  requestTemplate: {
                    messagePath: "messages[-1].content",
                    structure: { model: "gpt-4", messages: [{ role: "user", content: "{{message}}" }] },
                  },
                  responseTemplate: {
                    contentPath: "choices[0].message.content",
                    tokenUsagePath: "usage",
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Target created",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: { data: { $ref: "#/components/schemas/TargetSummary" } },
                      },
                    ],
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/targets/{id}": {
        get: {
          tags: ["Targets"],
          summary: "Get target by ID",
          description: "Returns full target details with masked credentials and relationship counts.",
          parameters: [{ $ref: "#/components/parameters/TargetId" }],
          responses: {
            "200": {
              description: "Target details",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: { data: { $ref: "#/components/schemas/TargetDetail" } },
                      },
                    ],
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        put: {
          tags: ["Targets"],
          summary: "Update a target",
          description: "Update target fields. Only provided fields are updated.",
          parameters: [{ $ref: "#/components/parameters/TargetId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateTargetRequest" },
              },
            },
          },
          responses: {
            "200": { description: "Target updated" },
            "400": { $ref: "#/components/responses/ValidationError" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        delete: {
          tags: ["Targets"],
          summary: "Delete a target",
          description: "Delete a target. Fails if target has existing sessions.",
          parameters: [{ $ref: "#/components/parameters/TargetId" }],
          responses: {
            "200": { description: "Target deleted" },
            "400": {
              description: "Cannot delete — target has sessions",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/targets/{id}/test": {
        post: {
          tags: ["Targets"],
          summary: "Test target connection",
          description: "Performs a health check against the target endpoint and returns connectivity status.",
          parameters: [{ $ref: "#/components/parameters/TargetId" }],
          responses: {
            "200": {
              description: "Test result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          healthy: { type: "boolean" },
                          latencyMs: { type: "number" },
                          statusCode: { type: "integer" },
                          error: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      // ─── Scenarios ───
      "/api/scenarios": {
        get: {
          tags: ["Scenarios"],
          summary: "List all scenarios",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" }, description: "Filter by category" },
            {
              name: "isActive",
              in: "query",
              schema: { type: "string", enum: ["true", "false"] },
              description: "Filter by active status",
            },
          ],
          responses: {
            "200": {
              description: "List of scenarios",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { type: "array", items: { $ref: "#/components/schemas/ScenarioSummary" } },
                          count: { type: "integer" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        post: {
          tags: ["Scenarios"],
          summary: "Create a new scenario",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateScenarioRequest" },
              },
            },
          },
          responses: {
            "201": { description: "Scenario created" },
            "400": { $ref: "#/components/responses/ValidationError" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/scenarios/{id}": {
        get: {
          tags: ["Scenarios"],
          summary: "Get scenario by ID",
          parameters: [{ $ref: "#/components/parameters/ScenarioId" }],
          responses: {
            "200": { description: "Scenario details" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        put: {
          tags: ["Scenarios"],
          summary: "Update a scenario",
          parameters: [{ $ref: "#/components/parameters/ScenarioId" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateScenarioRequest" } } },
          },
          responses: {
            "200": { description: "Scenario updated" },
            "400": { $ref: "#/components/responses/ValidationError" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        delete: {
          tags: ["Scenarios"],
          summary: "Delete a scenario",
          parameters: [{ $ref: "#/components/parameters/ScenarioId" }],
          responses: {
            "200": { description: "Scenario deleted" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/scenarios/{id}/export": {
        get: {
          tags: ["Scenarios"],
          summary: "Export scenario as YAML",
          parameters: [{ $ref: "#/components/parameters/ScenarioId" }],
          responses: {
            "200": {
              description: "YAML export",
              content: { "text/yaml": { schema: { type: "string" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      "/api/scenarios/import": {
        post: {
          tags: ["Scenarios"],
          summary: "Import scenarios from YAML",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["yaml"],
                  properties: { yaml: { type: "string", description: "YAML content to import" } },
                },
              },
            },
          },
          responses: {
            "201": { description: "Scenarios imported" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },

      // ─── Sessions ───
      "/api/sessions": {
        get: {
          tags: ["Sessions"],
          summary: "List sessions",
          description: "Returns paginated sessions with optional filtering by status, target, or scenario.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] } },
            { name: "targetId", in: "query", schema: { type: "string" } },
            { name: "scenarioId", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": {
              description: "Paginated session list",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { type: "array", items: { $ref: "#/components/schemas/SessionSummary" } },
                          pagination: { $ref: "#/components/schemas/Pagination" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/sessions/{id}": {
        get: {
          tags: ["Sessions"],
          summary: "Get session by ID",
          parameters: [{ $ref: "#/components/parameters/SessionId" }],
          responses: {
            "200": { description: "Session details with target and scenario" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/sessions/{id}/stream": {
        get: {
          tags: ["Sessions"],
          summary: "Stream session logs via SSE",
          description: "Server-Sent Events stream for real-time session log viewing.",
          parameters: [{ $ref: "#/components/parameters/SessionId" }],
          responses: {
            "200": {
              description: "SSE event stream",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ─── Execution ───
      "/api/execute": {
        post: {
          tags: ["Execution"],
          summary: "Execute a test session",
          description: "Fire-and-forget session execution. Creates a session, queues a BullMQ job, and returns immediately.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExecuteRequest" },
                example: {
                  targetId: "clx1234567890",
                  scenarioId: "clx0987654321",
                  executionConfig: { repetitions: 3, concurrency: 2 },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Session queued",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              sessionId: { type: "string" },
                              status: { type: "string", enum: ["QUEUED"] },
                              message: { type: "string" },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "404": { $ref: "#/components/responses/NotFound" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/execute/batch": {
        post: {
          tags: ["Execution"],
          summary: "Execute batch across multiple targets",
          description: "Run the same scenario against multiple targets in parallel.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["targetIds", "scenarioId"],
                  properties: {
                    targetIds: { type: "array", items: { type: "string" } },
                    scenarioId: { type: "string" },
                    executionConfig: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "202": { description: "Batch queued" },
            "400": { $ref: "#/components/responses/ValidationError" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/execute/batch/{batchId}": {
        get: {
          tags: ["Execution"],
          summary: "Get batch status",
          parameters: [
            { name: "batchId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Batch status with session results" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ─── Metrics ───
      "/api/metrics": {
        get: {
          tags: ["Metrics"],
          summary: "Get aggregated metrics",
          parameters: [
            { name: "sessionId", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": { description: "Aggregated metrics with percentiles (P50, P95, P99)" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      "/api/metrics/export": {
        get: {
          tags: ["Metrics"],
          summary: "Export metrics as CSV or JSON",
          parameters: [
            { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"], default: "json" } },
            { name: "sessionId", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Exported metrics data" },
          },
        },
      },

      "/api/metrics/quality": {
        get: {
          tags: ["Metrics"],
          summary: "Get quality scores",
          description: "Returns quality scoring (relevance, coherence, completeness, safety, latency) for sessions.",
          parameters: [
            { name: "sessionId", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Quality scores" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      // ─── Dashboard ───
      "/api/dashboard/stats": {
        get: {
          tags: ["Dashboard"],
          summary: "Get dashboard statistics",
          description: "Returns aggregated counts, metrics, recent sessions, and live session data.",
          responses: {
            "200": {
              description: "Dashboard statistics",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardStats" },
                },
              },
            },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
      },

      // ─── Webhooks ───
      "/api/webhooks": {
        get: {
          tags: ["Webhooks"],
          summary: "List all webhooks",
          responses: {
            "200": { description: "List of webhooks" },
            "500": { $ref: "#/components/responses/InternalError" },
          },
        },
        post: {
          tags: ["Webhooks"],
          summary: "Create a webhook",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateWebhookRequest" },
              },
            },
          },
          responses: {
            "201": { description: "Webhook created" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },

      "/api/webhooks/{id}": {
        get: {
          tags: ["Webhooks"],
          summary: "Get webhook by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Webhook details" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        put: {
          tags: ["Webhooks"],
          summary: "Update a webhook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateWebhookRequest" } } } },
          responses: {
            "200": { description: "Webhook updated" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Webhooks"],
          summary: "Delete a webhook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Webhook deleted" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      "/api/webhooks/{id}/test": {
        post: {
          tags: ["Webhooks"],
          summary: "Send test webhook delivery",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Test delivery result" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      "/api/webhooks/{id}/deliveries": {
        get: {
          tags: ["Webhooks"],
          summary: "List webhook deliveries",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "List of deliveries" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ─── Compare ───
      "/api/compare": {
        get: {
          tags: ["Compare"],
          summary: "List comparisons",
          responses: {
            "200": { description: "List of A/B comparisons" },
          },
        },
        post: {
          tags: ["Compare"],
          summary: "Create a comparison",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "sessionAId", "sessionBId"],
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    sessionAId: { type: "string" },
                    sessionBId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Comparison created" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },

      "/api/compare/{id}": {
        get: {
          tags: ["Compare"],
          summary: "Get comparison by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Comparison details with results" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ─── Presets ───
      "/api/presets": {
        get: {
          tags: ["Presets"],
          summary: "List provider presets",
          description: "Returns all available provider presets (OpenAI, Anthropic, Gemini, etc.)",
          responses: {
            "200": { description: "List of presets" },
          },
        },
      },

      // ─── Templates ───
      "/api/templates/validate": {
        post: {
          tags: ["Presets"],
          summary: "Validate request/response templates",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requestTemplate: { type: "object" },
                    responseTemplate: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Validation result with suggestions" },
          },
        },
      },

      // ─── Settings ───
      "/api/settings": {
        get: {
          tags: ["Settings"],
          summary: "Get all settings",
          description: "Returns all application settings grouped by category.",
          responses: {
            "200": {
              description: "Settings grouped by category",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            additionalProperties: {
                              type: "array",
                              items: { $ref: "#/components/schemas/Setting" },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ["Settings"],
          summary: "Update a setting",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["key", "value"],
                  properties: {
                    key: { type: "string" },
                    value: {},
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Setting updated" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },

      "/api/settings/reset": {
        post: {
          tags: ["Settings"],
          summary: "Reset all settings to defaults",
          responses: {
            "200": { description: "Settings reset" },
          },
        },
      },

      // ─── Plugins ───
      "/api/plugins": {
        get: {
          tags: ["Plugins"],
          summary: "List registered plugins",
          description: "Returns all registered connector plugins with metadata.",
          responses: {
            "200": { description: "List of plugins" },
          },
        },
      },

      "/api/plugins/{id}": {
        get: {
          tags: ["Plugins"],
          summary: "Get plugin details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Plugin details including configSchema" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      "/api/plugins/{id}/config-schema": {
        get: {
          tags: ["Plugins"],
          summary: "Get plugin config schema",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Config schema for UI form generation" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      "/api/plugins/{id}/validate-config": {
        post: {
          tags: ["Plugins"],
          summary: "Validate plugin configuration",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Plugin configuration to validate" },
              },
            },
          },
          responses: {
            "200": { description: "Validation result" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },

      // ─── Scheduled Jobs ───
      "/api/scheduled-jobs": {
        get: {
          tags: ["Execution"],
          summary: "List scheduled jobs",
          responses: {
            "200": { description: "List of scheduled jobs" },
          },
        },
        post: {
          tags: ["Execution"],
          summary: "Create a scheduled job",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "scenarioId", "cronExpression"],
                  properties: {
                    name: { type: "string" },
                    scenarioId: { type: "string" },
                    cronExpression: { type: "string" },
                    timezone: { type: "string", default: "UTC" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Job scheduled" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },

      // ─── OpenAPI Spec ───
      "/api/openapi": {
        get: {
          tags: ["Health"],
          summary: "Get OpenAPI specification",
          description: "Returns this OpenAPI 3.0 specification as JSON.",
          responses: {
            "200": {
              description: "OpenAPI spec",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    },

    components: {
      parameters: {
        TargetId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Target CUID",
        },
        ScenarioId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Scenario CUID",
        },
        SessionId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Session CUID",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
            message: { type: "string" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "degraded", "error"] },
            timestamp: { type: "string", format: "date-time" },
            services: {
              type: "object",
              properties: {
                database: { type: "string" },
                redis: { type: "string" },
              },
            },
          },
        },
        TargetSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            connectorType: { type: "string", enum: ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"] },
            endpoint: { type: "string" },
            authType: { type: "string", enum: ["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER", "OAUTH2"] },
            isActive: { type: "boolean" },
            lastTestAt: { type: "string", format: "date-time", nullable: true },
            lastTestSuccess: { type: "boolean", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TargetDetail: {
          allOf: [
            { $ref: "#/components/schemas/TargetSummary" },
            {
              type: "object",
              properties: {
                authConfig: { type: "object", description: "Masked credentials" },
                requestTemplate: { type: "object" },
                responseTemplate: { type: "object" },
                protocolConfig: { type: "object", nullable: true },
                presetId: { type: "string", nullable: true },
                lastTestError: { type: "string", nullable: true },
                sessionCount: { type: "integer" },
                scenarioCount: { type: "integer" },
              },
            },
          ],
        },
        CreateTargetRequest: {
          type: "object",
          required: ["name", "connectorType", "endpoint", "authType", "authConfig", "requestTemplate", "responseTemplate"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string" },
            connectorType: { type: "string", enum: ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"] },
            endpoint: { type: "string", format: "uri" },
            authType: { type: "string", enum: ["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER", "OAUTH2"] },
            authConfig: { type: "object" },
            requestTemplate: {
              type: "object",
              required: ["messagePath"],
              properties: {
                messagePath: { type: "string" },
                structure: { type: "object" },
                variables: { type: "object" },
              },
            },
            responseTemplate: {
              type: "object",
              required: ["contentPath"],
              properties: {
                contentPath: { type: "string" },
                tokenUsagePath: { type: "string" },
                errorPath: { type: "string" },
                transform: { type: "string", enum: ["none", "markdown", "html"] },
              },
            },
            protocolConfig: { type: "object" },
            isActive: { type: "boolean" },
          },
        },
        UpdateTargetRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            connectorType: { type: "string", enum: ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"] },
            endpoint: { type: "string", format: "uri" },
            authType: { type: "string", enum: ["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER", "OAUTH2"] },
            authConfig: { type: "object" },
            requestTemplate: { type: "object" },
            responseTemplate: { type: "object" },
            protocolConfig: { type: "object" },
            isActive: { type: "boolean" },
          },
        },
        ScenarioSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            category: { type: "string" },
            repetitions: { type: "integer" },
            concurrency: { type: "integer" },
            verbosityLevel: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateScenarioRequest: {
          type: "object",
          required: ["name", "flowConfig"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string" },
            category: { type: "string" },
            flowConfig: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "type", "config"],
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["message", "delay", "conditional", "loop"] },
                  config: { type: "object" },
                  next: { type: "string" },
                },
              },
            },
            repetitions: { type: "integer", minimum: 1, maximum: 1000, default: 1 },
            concurrency: { type: "integer", minimum: 1, maximum: 100, default: 1 },
            delayBetweenMs: { type: "integer", minimum: 0, maximum: 60000, default: 0 },
            verbosityLevel: { type: "string", default: "normal" },
            messageTemplates: { type: "object" },
            isActive: { type: "boolean", default: true },
          },
        },
        SessionSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: { type: "string", enum: ["PENDING", "QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] },
            targetId: { type: "string" },
            scenarioId: { type: "string", nullable: true },
            startedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: { type: "string", format: "date-time", nullable: true },
            summaryMetrics: { type: "object", nullable: true },
            target: {
              type: "object",
              properties: { name: { type: "string" }, connectorType: { type: "string" } },
            },
            scenario: {
              type: "object",
              nullable: true,
              properties: { name: { type: "string" } },
            },
          },
        },
        ExecuteRequest: {
          type: "object",
          required: ["targetId"],
          properties: {
            targetId: { type: "string" },
            scenarioId: { type: "string" },
            executionConfig: {
              type: "object",
              properties: {
                repetitions: { type: "integer", minimum: 1, maximum: 1000 },
                concurrency: { type: "integer", minimum: 1, maximum: 10 },
                delayBetweenMs: { type: "integer", minimum: 0, maximum: 60000 },
                messageTemplates: { type: "object" },
                verbosityLevel: { type: "string", enum: ["normal", "verbose", "extreme"] },
                customMessages: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        DashboardStats: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              properties: {
                counts: {
                  type: "object",
                  properties: {
                    targets: { type: "integer" },
                    scenarios: { type: "integer" },
                    activeSessions: { type: "integer" },
                    totalSessions: { type: "integer" },
                  },
                },
                metrics: {
                  type: "object",
                  properties: {
                    avgResponseTimeMs: { type: "number" },
                    totalTokensConsumed: { type: "integer" },
                    errorRate: { type: "number" },
                    sessionsLast24h: { type: "integer" },
                  },
                },
                recentSessions: { type: "array", items: { type: "object" } },
                liveSessionCount: { type: "integer" },
                liveSessions: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        CreateWebhookRequest: {
          type: "object",
          required: ["name", "url", "events", "secret"],
          properties: {
            name: { type: "string" },
            url: { type: "string", format: "uri" },
            events: { type: "array", items: { type: "string", enum: ["session.completed", "session.failed", "session.cancelled", "metric.threshold"] } },
            secret: { type: "string" },
            isActive: { type: "boolean", default: true },
          },
        },
        Setting: {
          type: "object",
          properties: {
            id: { type: "string" },
            key: { type: "string" },
            value: {},
            category: { type: "string" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            total: { type: "integer" },
            limit: { type: "integer" },
            offset: { type: "integer" },
            hasMore: { type: "boolean" },
          },
        },
      },
      responses: {
        ValidationError: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  error: { type: "string", example: "Validation error" },
                  details: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: { success: false, error: "Not found" },
            },
          },
        },
        InternalError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: { success: false, error: "Internal server error" },
            },
          },
        },
      },
    },
  };
}
