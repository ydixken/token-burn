# Configuration Guide

Token-Burn is configured through environment variables. Copy `.env.example` to `.env` and adjust values as needed.

## Environment Variables

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |

**Format**: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

```bash
# Development
DATABASE_URL="postgresql://tokenburn:tokenburn@localhost:5432/tokenburn"

# Production (use strong credentials)
DATABASE_URL="postgresql://tokenburn:S3cureP@ss@db.example.com:5432/tokenburn?sslmode=require"
```

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | — | Redis connection string |

```bash
# Development
REDIS_URL="redis://localhost:6379"

# Production (with auth)
REDIS_URL="redis://:password@redis.example.com:6379"
```

### Encryption

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Yes | — | 64-character hex string for AES-256-GCM encryption |

Used to encrypt sensitive data at rest (target auth credentials, webhook secrets).

```bash
# Generate a key
openssl rand -hex 32

# Example (DO NOT use this in production)
ENCRYPTION_KEY="b957271acea89002c7359d65456316b002c7f12927a6e7c5c6f680fc288e794f"
```

**Security**: Never commit the real encryption key to version control.

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public-facing URL |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |

### Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKER_CONCURRENCY` | No | `5` | Number of concurrent BullMQ jobs per worker |

Increase for higher throughput. Each concurrent job consumes connections to the target chatbot, so set this based on your rate limits and system resources.

## Infrastructure Configuration

### Docker Compose (Development)

Located at `infra/docker-compose.yml`. Default service configuration:

| Service | Image | Port | Credentials |
|---------|-------|------|-------------|
| PostgreSQL | postgres:16-alpine | 5432 | tokenburn / tokenburn |
| Redis | redis:7-alpine | 6379 | No password |
| Redis Commander | rediscommander/redis-commander | 8081 | — |

To change database credentials, update both `docker-compose.yml` and `DATABASE_URL` in `.env`.

### Docker Compose (Production)

Located at `infra/docker-compose.prod.yml`. Uses environment variables for sensitive values:

| Variable | Description |
|----------|-------------|
| `REGISTRY_URL` | Docker registry URL for pulling images |
| `TAG` | Image tag (e.g., `latest`, `v1.0.0`) |
| `POSTGRES_PASSWORD` | Production database password |
| `REDIS_PASSWORD` | Production Redis password |

### Nginx

Located at `docker/nginx.conf`. Configurable:
- Rate limiting: 10 req/s general, 1 req/s for `/api/execute`
- SSL/TLS: Place certificates at paths configured in `docker-compose.prod.yml`
- Proxy timeouts: Default 60s for API, 3600s for SSE streams

## Target Configuration

Targets define chatbot endpoints to test. Configured via the UI or API.

### Connector Types

| Type | Protocol | Use Case |
|------|----------|----------|
| `HTTP_REST` | HTTP/HTTPS | REST APIs (OpenAI, Anthropic, custom) |
| `WEBSOCKET` | WS/WSS | Bidirectional real-time (Rasa, Botpress) |
| `SSE` | HTTP + EventSource | Streaming APIs |
| `GRPC` | gRPC/HTTP2 | Protocol buffer services |

### Authentication Types

| Type | Config Fields | Description |
|------|---------------|-------------|
| `NONE` | — | No authentication |
| `BEARER` | `{ token }` | Authorization: Bearer header |
| `API_KEY` | `{ key, headerName }` | Custom header with API key |
| `BASIC` | `{ username, password }` | HTTP Basic authentication |
| `CUSTOM_HEADER` | `{ headers }` | Arbitrary headers |
| `OAUTH2` | `{ clientId, clientSecret, tokenUrl }` | OAuth2 client credentials |

### Request/Response Templates

Templates use JSON Path expressions to map request/response bodies:

```json
// Request template (how to send messages)
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "{{message}}"}]
}

// Response template (how to extract responses)
{
  "contentPath": "$.choices[0].message.content",
  "tokenUsagePath": "$.usage"
}
```

## Scenario Configuration

### Flow Step Types

| Type | Config | Description |
|------|--------|-------------|
| `message` | `{ content }` | Send a message to the target |
| `delay` | `{ durationMs }` | Wait N milliseconds |
| `loop` | `{ iterations, steps }` | Repeat steps N times |
| `conditional` | `{ condition, thenSteps, elseSteps }` | Branch based on response |

### Template Variables

Available in message content via Handlebars syntax:

| Variable | Description |
|----------|-------------|
| `{{messageIndex}}` | Current message index (0-based) |
| `{{timestamp}}` | Current ISO timestamp |
| `{{repetitionIndex}}` | Current repetition number |
| `{{lastResponse}}` | Previous chatbot response |
| Custom variables | Defined in `messageTemplates` field |

### Execution Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `repetitions` | 1 | Number of times to run the full flow |
| `concurrency` | 1 | Parallel message streams (1-100) |
| `delayBetweenMs` | 0 | Delay between messages in ms |
| `verbosityLevel` | `normal` | `normal`, `verbose`, or `extreme` |

## Rate Limiting

Configure per-target rate limits to avoid being throttled:

| Field | Description |
|-------|-------------|
| `rateLimitRpm` | Max requests per minute |
| `rateLimitTpm` | Max tokens per minute |

The execution engine uses a token bucket algorithm to throttle requests. When a 429 response is received, it automatically backs off using the `Retry-After` header.

## Webhook Configuration

Webhooks send HTTP POST notifications when events occur.

### Events

| Event | Trigger |
|-------|---------|
| `session.completed` | Session finishes successfully |
| `session.failed` | Session fails with an error |
| `session.cancelled` | Session is cancelled |
| `metric.threshold` | Metric exceeds configured threshold |

### Payload Signing

Webhook payloads are signed with HMAC-SHA256. Verify using the `X-TokenBurn-Signature` header:

```
X-TokenBurn-Signature: t=<timestamp>,v1=<hex-digest>
```

### Retry Policy

Failed deliveries are retried with exponential backoff:
- Max attempts: 5
- Base delay: 1 second
- Multiplier: 2x (1s, 2s, 4s, 8s, 16s)
- Timeout per attempt: 10 seconds

## CI/CD Configuration

GitLab CI pipeline (`.gitlab-ci.yml`):

| Stage | Trigger | Description |
|-------|---------|-------------|
| lint | Every push | ESLint + Prettier |
| test | Every push | Vitest with PG+Redis services |
| build | Every push | Docker image build |
| deploy:staging | Auto on main | Deploy to staging |
| deploy:production | Manual approval | Deploy to production |
