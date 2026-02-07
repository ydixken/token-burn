# Token-Burn API Documentation

Complete reference for all API endpoints in the Token-Burn platform.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API does not require authentication. This will be added in a future release.

---

## Health Check

### GET /api/health

Check the health of all services (API, database, Redis).

**Response (200 — all healthy)**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T00:00:00.000Z",
  "services": {
    "api": {
      "status": "healthy",
      "responseTimeMs": 2
    },
    "database": {
      "status": "healthy",
      "responseTimeMs": 5,
      "error": null
    },
    "redis": {
      "status": "healthy",
      "responseTimeMs": 3,
      "error": null
    }
  }
}
```

**Status Codes**

| Code | Meaning |
|------|---------|
| 200 | All services healthy, or degraded (Redis unhealthy) |
| 503 | Database unhealthy |

The top-level `status` field is one of: `"healthy"`, `"degraded"`, `"unhealthy"`.

---

## Targets

Targets represent chatbot endpoints to stress-test.

### GET /api/targets

List all targets. Sensitive fields (`authConfig`, templates) are excluded from the list response.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| isActive | string | Filter by active status: `"true"` or `"false"` |
| connectorType | string | Filter by connector type (e.g. `HTTP_REST`) |

**Response (200)**

```json
{
  "success": true,
  "data": [
    {
      "id": "clwxyz123",
      "name": "My Chatbot",
      "description": "Production chatbot API",
      "connectorType": "HTTP_REST",
      "endpoint": "https://api.example.com/chat",
      "authType": "BEARER_TOKEN",
      "isActive": true,
      "createdAt": "2026-01-26T20:00:00.000Z",
      "updatedAt": "2026-01-26T20:00:00.000Z"
    }
  ],
  "count": 1
}
```

### POST /api/targets

Create a new target. Auth credentials are encrypted at rest (AES-256-GCM).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Target name (1-100 chars) |
| description | string | No | Target description |
| connectorType | ConnectorType | Yes | Protocol type |
| endpoint | string (URL) | Yes | Target endpoint URL |
| authType | AuthType | Yes | Authentication method |
| authConfig | object | Yes | Auth credentials (encrypted before storage) |
| requestTemplate | RequestTemplate | Yes | How to wrap messages |
| responseTemplate | ResponseTemplate | Yes | How to extract responses |
| protocolConfig | object | No | Protocol-specific settings |
| isActive | boolean | No | Active status (default: `true`) |

**RequestTemplate**

```json
{
  "messagePath": "$.messages[0].content",
  "structure": {
    "model": "gpt-4",
    "messages": [{ "role": "user", "content": "" }]
  },
  "variables": {}
}
```

**ResponseTemplate**

```json
{
  "contentPath": "$.choices[0].message.content",
  "tokenUsagePath": "$.usage",
  "errorPath": "$.error.message",
  "transform": "none"
}
```

The `transform` field accepts: `"none"`, `"markdown"`, `"html"`.

**Response (201)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz123",
    "name": "My Chatbot",
    "description": "Production chatbot API",
    "connectorType": "HTTP_REST",
    "endpoint": "https://api.example.com/chat",
    "authType": "BEARER_TOKEN",
    "isActive": true,
    "createdAt": "2026-01-26T20:00:00.000Z"
  },
  "message": "Target created successfully"
}
```

### GET /api/targets/:id

Get a target by ID. Returns full details including templates, decrypted (masked) auth config, and relationship counts.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz123",
    "name": "My Chatbot",
    "description": "Production chatbot API",
    "connectorType": "HTTP_REST",
    "endpoint": "https://api.example.com/chat",
    "authType": "BEARER_TOKEN",
    "authConfig": {
      "token": "your...en-1"
    },
    "requestTemplate": { "..." : "..." },
    "responseTemplate": { "..." : "..." },
    "protocolConfig": {},
    "isActive": true,
    "sessionCount": 5,
    "scenarioCount": 2,
    "createdAt": "2026-01-26T20:00:00.000Z",
    "updatedAt": "2026-01-26T20:00:00.000Z"
  }
}
```

Sensitive auth values are masked (e.g. `"your...en-1"`).

### PUT /api/targets/:id

Update a target. All fields are optional.

**Request Body** — Same fields as POST, all optional.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz123",
    "name": "Updated Name",
    "description": "Updated description",
    "connectorType": "HTTP_REST",
    "endpoint": "https://api.example.com/chat",
    "authType": "BEARER_TOKEN",
    "isActive": true,
    "updatedAt": "2026-02-07T00:00:00.000Z"
  },
  "message": "Target updated successfully"
}
```

### DELETE /api/targets/:id

Delete a target. Fails if the target has existing sessions.

**Response (200)**

```json
{
  "success": true,
  "message": "Target deleted successfully"
}
```

**Response (400) — Has sessions**

```json
{
  "success": false,
  "error": "Cannot delete target with existing sessions",
  "message": "This target has 5 session(s). Delete sessions first or archive the target instead."
}
```

### POST /api/targets/:id/test

> **Coming Soon** — Connection test / dry-run endpoint. Will verify that the target endpoint is reachable and authentication is valid without starting a full session.

---

## Scenarios

Scenarios define test flows with message sequences, loops, conditionals, and delays.

### GET /api/scenarios

List all scenarios.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| category | string | Filter by category |
| isActive | string | Filter by active status: `"true"` or `"false"` |

**Response (200)**

```json
{
  "success": true,
  "data": [
    {
      "id": "clwxyz456",
      "name": "Stress Test",
      "description": "High-volume repetitive prompts",
      "category": "stress",
      "repetitions": 5,
      "concurrency": 1,
      "verbosityLevel": "verbose",
      "isActive": true,
      "createdAt": "2026-01-26T20:00:00.000Z",
      "updatedAt": "2026-01-26T20:00:00.000Z",
      "_count": {
        "sessions": 3
      }
    }
  ],
  "count": 1
}
```

### POST /api/scenarios

Create a new scenario.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Scenario name (1-100 chars) |
| description | string | No | Description |
| category | string | No | Category label |
| flowConfig | FlowStep[] | Yes | Array of flow steps |
| repetitions | integer | No | 1-1000 (default: 1) |
| concurrency | integer | No | 1-100 (default: 1) |
| delayBetweenMs | integer | No | 0-60000 ms (default: 0) |
| verbosityLevel | string | No | Default: `"normal"` |
| messageTemplates | object | No | Template variables |
| isActive | boolean | No | Default: `true` |

**FlowStep**

```json
{
  "id": "step1",
  "type": "message",
  "config": {
    "message": "Hello, can you help me?"
  },
  "next": "step2"
}
```

Flow step types: `"message"`, `"delay"`, `"conditional"`, `"loop"`.

**Response (201)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz456",
    "name": "Stress Test",
    "description": "High-volume repetitive prompts",
    "category": "stress",
    "repetitions": 5,
    "concurrency": 1,
    "verbosityLevel": "verbose",
    "createdAt": "2026-01-26T20:00:00.000Z"
  },
  "message": "Scenario created successfully"
}
```

### GET /api/scenarios/:id

Get a scenario by ID with target info and session count.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz456",
    "name": "Stress Test",
    "description": "High-volume repetitive prompts",
    "category": "stress",
    "flowConfig": [...],
    "repetitions": 5,
    "concurrency": 1,
    "delayBetweenMs": 1000,
    "verbosityLevel": "verbose",
    "messageTemplates": {},
    "isActive": true,
    "target": {
      "id": "clwxyz123",
      "name": "My Chatbot"
    },
    "sessionCount": 3,
    "createdAt": "2026-01-26T20:00:00.000Z",
    "updatedAt": "2026-01-26T20:00:00.000Z"
  }
}
```

### PUT /api/scenarios/:id

Update a scenario. All fields are optional.

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz456",
    "name": "Updated Scenario",
    "description": "Updated description",
    "category": "stress",
    "repetitions": 10,
    "concurrency": 2,
    "verbosityLevel": "verbose",
    "updatedAt": "2026-02-07T00:00:00.000Z"
  },
  "message": "Scenario updated successfully"
}
```

### DELETE /api/scenarios/:id

Delete a scenario. Fails if the scenario has existing sessions.

**Response (200)**

```json
{
  "success": true,
  "message": "Scenario deleted successfully"
}
```

**Response (400) — Has sessions**

```json
{
  "success": false,
  "error": "Cannot delete scenario with existing sessions",
  "message": "This scenario has 3 session(s). Delete sessions first or archive the scenario instead."
}
```

---

## Sessions

Sessions represent individual test execution runs.

### GET /api/sessions

List all sessions with optional filtering and pagination.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| targetId | string | Filter by target ID |
| scenarioId | string | Filter by scenario ID |
| status | string | Filter by status (PENDING, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) |
| limit | number | Maximum results (default: 50) |
| offset | number | Pagination offset (default: 0) |

**Response (200)**

```json
{
  "success": true,
  "data": [
    {
      "id": "clwxyz789",
      "targetId": "clwxyz123",
      "scenarioId": "clwxyz456",
      "status": "COMPLETED",
      "startedAt": "2026-01-26T20:00:00.000Z",
      "completedAt": "2026-01-26T20:05:00.000Z",
      "executionConfig": { "..." : "..." },
      "summaryMetrics": { "..." : "..." },
      "target": {
        "name": "My Chatbot",
        "connectorType": "HTTP_REST"
      },
      "scenario": {
        "name": "Stress Test"
      }
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### GET /api/sessions/:id/stream

Stream live session logs via Server-Sent Events (SSE).

**Response Stream**

```
data: {"type":"status","status":"RUNNING"}

data: {"type":"message","data":{"timestamp":"2026-01-26T20:00:00.000Z","direction":"sent","content":"Hello"}}

data: {"type":"message","data":{"timestamp":"2026-01-26T20:00:01.000Z","direction":"received","content":"Hi there!"}}

data: {"type":"complete","status":"COMPLETED"}
```

---

## Execute

### POST /api/execute

Fire-and-forget session execution. Creates a session record, queues a BullMQ job, and returns immediately with the session ID.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| targetId | string (CUID) | Yes | Target to execute against |
| scenarioId | string (CUID) | No | Scenario to run (provides flow config) |
| executionConfig | object | No | Execution overrides |

Either `scenarioId` or `executionConfig.customMessages` must be provided.

**executionConfig**

| Field | Type | Description |
|-------|------|-------------|
| repetitions | integer | 1-1000 |
| concurrency | integer | 1-10 |
| delayBetweenMs | integer | 0-60000 ms |
| messageTemplates | object | Template variable substitutions |
| verbosityLevel | string | `"normal"`, `"verbose"`, or `"extreme"` |
| customMessages | string[] | Ad-hoc messages (instead of scenario flow) |

**Response (202)**

```json
{
  "success": true,
  "data": {
    "sessionId": "clwxyz789",
    "status": "QUEUED",
    "message": "Session queued for execution"
  }
}
```

**Response (400) — Missing messages**

```json
{
  "success": false,
  "error": "Either scenarioId or executionConfig.customMessages is required"
}
```

**Response (404) — Target not found**

```json
{
  "success": false,
  "error": "Target not found"
}
```

---

## Metrics

### GET /api/metrics

Query session metrics with filtering and aggregation.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | Filter by session ID |
| targetId | string | Filter by target ID |
| scenarioId | string | Filter by scenario ID |
| startDate | string | ISO date string |
| endDate | string | ISO date string |
| status | string | Filter by session status |
| limit | number | Maximum results (1-1000) |
| offset | number | Pagination offset |

**Response (200)**

```json
{
  "success": true,
  "data": {
    "sessions": [...],
    "aggregate": {
      "totalSessions": 10,
      "totalMessages": 500,
      "totalTokens": 50000,
      "avgResponseTimeMs": 245.5,
      "totalErrors": 5,
      "errorRate": 1.0
    },
    "pagination": {
      "total": 10,
      "limit": 100,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

### GET /api/metrics/export

Export session metrics as CSV or JSON.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | Yes | Session ID to export |
| format | string | No | `"csv"` (default) or `"json"` |

---

## Dashboard

### GET /api/dashboard/stats

> **Coming Soon** — Dashboard statistics endpoint. Will return aggregated metrics for the homepage widgets: total sessions, active targets, recent activity, token usage trends.

---

## Scheduled Jobs

### GET /api/scheduled-jobs

List all scheduled jobs.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| scenarioId | string | Filter by scenario ID |

**Response (200)**

```json
{
  "success": true,
  "data": [
    {
      "id": "clwxyz999",
      "scenarioId": "clwxyz456",
      "cronExpression": "0 */6 * * *",
      "timezone": "UTC",
      "isEnabled": true,
      "lastRunAt": "2026-01-26T18:00:00.000Z",
      "nextRunAt": "2026-01-27T00:00:00.000Z",
      "scenario": {
        "name": "Stress Test"
      }
    }
  ]
}
```

### POST /api/scheduled-jobs

Create a scheduled job.

**Request Body**

```json
{
  "scenarioId": "clwxyz456",
  "cronExpression": "0 */6 * * *",
  "timezone": "UTC",
  "isEnabled": true
}
```

### PUT /api/scheduled-jobs?id=:id

Update a scheduled job.

### DELETE /api/scheduled-jobs?id=:id

Delete a scheduled job.

---

## Webhooks

> **Coming Soon** — Webhook notification system for receiving real-time event callbacks when sessions complete, fail, or hit metric thresholds.
>
> Planned events: `session.completed`, `session.failed`, `session.cancelled`, `metric.threshold`
>
> Payloads will be signed with HMAC-SHA256 via the `X-TokenBurn-Signature` header.

---

## Error Responses

All endpoints follow a consistent error response format:

**Validation Error (400)**

```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["name"],
      "message": "Required"
    }
  ]
}
```

**Not Found (404)**

```json
{
  "success": false,
  "error": "Target not found"
}
```

**Server Error (500)**

```json
{
  "success": false,
  "error": "Failed to fetch targets",
  "message": "Connection refused"
}
```

**HTTP Status Codes**

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (queued for background processing) |
| 400 | Bad Request (validation error, constraint violation) |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (health check failure) |

---

## Data Types

### ConnectorType

```typescript
enum ConnectorType {
  HTTP_REST = "HTTP_REST"
  WEBSOCKET = "WEBSOCKET"
  GRPC = "GRPC"
  SSE = "SSE"
}
```

### AuthType

```typescript
enum AuthType {
  NONE = "NONE"
  BEARER_TOKEN = "BEARER_TOKEN"
  API_KEY = "API_KEY"
  BASIC_AUTH = "BASIC_AUTH"
  CUSTOM_HEADER = "CUSTOM_HEADER"
  OAUTH2 = "OAUTH2"
}
```

### SessionStatus

```typescript
enum SessionStatus {
  PENDING = "PENDING"
  QUEUED = "QUEUED"
  RUNNING = "RUNNING"
  COMPLETED = "COMPLETED"
  FAILED = "FAILED"
  CANCELLED = "CANCELLED"
}
```

### VerbosityLevel

```typescript
type VerbosityLevel = "normal" | "verbose" | "extreme"
```

---

## Pagination

List endpoints support pagination via `limit` and `offset` query parameters:

```json
{
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

To fetch the next page:

```
GET /api/sessions?limit=50&offset=50
```
