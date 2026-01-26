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

### GET /health

Check API health status.

**Response**

```json
{
  "status": "ok",
  "timestamp": "2026-01-26T20:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Targets

### GET /targets

List all target chatbot endpoints.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| limit | number | Maximum number of results (default: 100) |
| offset | number | Pagination offset (default: 0) |

**Response**

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
      "createdAt": "2026-01-26T20:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

### POST /targets

Create a new target.

**Request Body**

```json
{
  "name": "My Chatbot",
  "description": "Production chatbot API",
  "connectorType": "HTTP_REST",
  "endpoint": "https://api.example.com/chat",
  "authType": "BEARER_TOKEN",
  "authConfig": {
    "token": "your-api-token"
  },
  "requestTemplate": {
    "messagePath": "message",
    "format": "json"
  },
  "responseTemplate": {
    "contentPath": "response.text"
  }
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "id": "clwxyz123",
    "name": "My Chatbot",
    ...
  }
}
```

### GET /targets/:id

Get a specific target by ID.

### PUT /targets/:id

Update a target.

### DELETE /targets/:id

Delete a target.

---

## Scenarios

### GET /scenarios

List all test scenarios.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| targetId | string | Filter by target ID |
| category | string | Filter by category |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": "clwxyz456",
      "name": "Stress Test",
      "description": "High-volume repetitive prompts",
      "category": "STRESS_TEST",
      "targetId": "clwxyz123",
      "flowConfig": [...],
      "verbosityLevel": "verbose",
      "repetitions": 5,
      "concurrency": 1,
      "createdAt": "2026-01-26T20:00:00.000Z"
    }
  ]
}
```

### POST /scenarios

Create a new scenario.

**Request Body**

```json
{
  "name": "Stress Test",
  "description": "High-volume repetitive prompts",
  "category": "STRESS_TEST",
  "targetId": "clwxyz123",
  "flowConfig": [
    {
      "type": "message",
      "content": "Hello, can you help me?"
    },
    {
      "type": "loop",
      "iterations": 10,
      "steps": [
        {
          "type": "message",
          "content": "Please explain that again in more detail."
        }
      ]
    }
  ],
  "verbosityLevel": "verbose",
  "repetitions": 5,
  "concurrency": 1,
  "delayBetweenMs": 1000,
  "messageTemplates": {}
}
```

---

## Sessions

### GET /sessions

List all test sessions.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| targetId | string | Filter by target ID |
| scenarioId | string | Filter by scenario ID |
| status | string | Filter by status (PENDING, QUEUED, RUNNING, COMPLETED, FAILED) |
| startDate | string | ISO date string (inclusive) |
| endDate | string | ISO date string (inclusive) |
| limit | number | Maximum results (default: 100) |
| offset | number | Pagination offset (default: 0) |

**Response**

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
      "summaryMetrics": {
        "messageCount": 50,
        "totalTokens": 5000,
        "avgResponseTimeMs": 250,
        "errorCount": 0,
        "errorRate": 0
      }
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

### GET /sessions/:id

Get session details.

### GET /sessions/:id/stream

Stream live logs via Server-Sent Events (SSE).

**Response Stream**

```
data: {"type":"status","status":"RUNNING"}

data: {"type":"message","data":{"timestamp":"2026-01-26T20:00:00.000Z","direction":"sent","content":"Hello"}}

data: {"type":"message","data":{"timestamp":"2026-01-26T20:00:01.000Z","direction":"received","content":"Hi there!"}}

data: {"type":"complete","status":"COMPLETED"}
```

---

## Execute

### POST /execute

Fire-and-forget session execution. Queues a session for background processing.

**Request Body**

```json
{
  "targetId": "clwxyz123",
  "scenarioId": "clwxyz456"
}
```

**Response**

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

---

## Metrics

### GET /metrics

Query session metrics with filtering and aggregation.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| sessionId | string | Filter by session ID |
| targetId | string | Filter by target ID |
| scenarioId | string | Filter by scenario ID |
| startDate | string | ISO date string |
| endDate | string | ISO date string |
| status | string | Filter by status |
| limit | number | Maximum results (1-1000) |
| offset | number | Pagination offset |

**Response**

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

### GET /metrics/export

Export session metrics.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | Yes | Session ID to export |
| format | string | No | Export format: "csv" or "json" (default: "csv") |

**Response (CSV)**

```csv
Session ID,Target,Scenario,Status,Started At,Completed At,Message Count,Total Tokens,Avg Response Time (ms),Min Response Time (ms),Max Response Time (ms),P50 Response Time (ms),P95 Response Time (ms),P99 Response Time (ms),Error Count,Error Rate (%),Tokens Per Second
clwxyz789,My Chatbot,Stress Test,COMPLETED,2026-01-26T20:00:00.000Z,2026-01-26T20:05:00.000Z,50,5000,250,100,800,200,600,750,0,0,16.67
```

---

## Scheduled Jobs

### GET /scheduled-jobs

List all scheduled jobs.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| scenarioId | string | Filter by scenario ID |

**Response**

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

### POST /scheduled-jobs

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

### PUT /scheduled-jobs?id=:id

Update a scheduled job.

### DELETE /scheduled-jobs?id=:id

Delete a scheduled job.

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message",
  "details": []
}
```

**HTTP Status Codes**

- `200` - Success
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

- API endpoints: 10 requests per second per IP
- Execute endpoint: 1 request per second per IP (burst: 2)

Rate limit headers:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1706299200
```

---

## Data Types

### ConnectorType

```typescript
enum ConnectorType {
  HTTP_REST = "HTTP_REST",
  WEBSOCKET = "WEBSOCKET",
  GRPC = "GRPC",
  SSE = "SSE"
}
```

### AuthType

```typescript
enum AuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  BEARER_TOKEN = "BEARER_TOKEN",
  BASIC = "BASIC"
}
```

### SessionStatus

```typescript
enum SessionStatus {
  PENDING = "PENDING",
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED"
}
```

### VerbosityLevel

```typescript
type VerbosityLevel = "minimal" | "normal" | "verbose"
```

---

## Pagination

All list endpoints support pagination:

```json
{
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

To fetch the next page:
```
GET /api/sessions?limit=20&offset=20
```
