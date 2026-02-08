<div align="center">

# Krawall

**Prove that your AI chatbot's API bill is an unguarded attack surface.**

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

Krawall is a chatbot stress-testing platform that behaves like an overly engaged, perfectly valid user. No prompt injection. No jailbreaking. No auth bypass. Just very, very costly conversations.

</div>

<div align="center">
  <img src="static/welcome.png" alt="Krawall Welcome Screen" width="800" />
</div>

---

## Why Krawall?

Companies are shipping AI chatbots - sometimes customer-facing - that are thin wrappers around commercial LLM APIs with zero cost controls. Most deployments share the same blind spots:

- **No per-session token limits** - the chatbot will happily generate 10,000+ tokens per response if you ask nicely
- **No meaningful rate limiting** - or if there is, it's trivially high
- **No cost awareness** - the backend forwards everything to the API and someone pays whatever the bill says
- **No conversation depth limits** - sessions grow indefinitely, accumulating context window costs

This is the cloud billing equivalent of leaving your database exposed on the internet without a password. Except it's worse, because the "attacker" looks exactly like a legitimate user.

Krawall exploits this by mimicking natural conversation flows that are perfectly valid but maximally expensive: repetitive prompts, requests for verbose structured output (hi, XML), "helpful clarifications" on every response, and multi-turn context accumulation. Every request is something a real customer might send. Nothing to see here.

**The goal isn't to cause damage - it's to prove the attack vector is real, trivial to exploit, and that companies need to take API cost security as seriously as application security.** Read the full story behind the project in [Let's Burn Some Tokens](https://dixken.de/blog/lets-burn-some-tokens).

---

## Highlights

<table>
<tr>
<td width="33%" valign="top">

### Multi-Protocol
HTTP/REST, WebSocket, gRPC, and Server-Sent Events - test any chatbot endpoint regardless of protocol.

</td>
<td width="33%" valign="top">

### 8 Provider Presets
One-click setup for OpenAI, Anthropic, Google Gemini, Azure OpenAI, Ollama, and custom endpoints.

</td>
<td width="33%" valign="top">

### 12 Scenario Templates
Pre-built tests across 7 categories: Stress, Edge Case, Context, Performance, Logic, Krawall, and Attack Surface.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### Real-Time Metrics
Response time, token usage, error rates, repetition detection, and quality scoring with P50/P95/P99 percentiles.

</td>
<td width="33%" valign="top">

### Fire-and-Forget Execution
Async session processing via BullMQ with concurrency control, rate limiting, and automatic retry.

</td>
<td width="33%" valign="top">

### A/B Comparison
Side-by-side statistical comparison of chatbot responses across different providers or configurations.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### Browser WebSocket Discovery
Automatically discovers WebSocket endpoints by navigating to chat pages with heuristic widget detection, WebSocket capture via CDP, Socket.IO auto-detection, and background token refresh.

</td>
<td width="33%" valign="top">

### Token Refresh
Background BullMQ workers keep browser-discovered credentials fresh with Redis Pub/Sub hot-swap — no reconnect needed.

</td>
<td width="33%" valign="top">

### Live Discovery Logs
Real-time SSE streaming of browser discovery progress with step-by-step timeline and raw response inspection.

</td>
</tr>
</table>

<div align="center">
  <img src="static/command-center.png" alt="Command Center Dashboard" width="800" />
  <p><em>Real-time command center with live sessions, quick execute, and recent activity</em></p>
</div>

---

## Features

### Setup & Configuration

- **Interactive Setup Wizard** - 8-step guided configurator with inline connection testing and live session monitoring
- **Provider Presets** - Pre-configured templates for OpenAI, Anthropic, Gemini, Azure, Ollama, custom HTTP/WS/gRPC
- **Inline Connection Testing** - Verify endpoints before committing to a configuration
- **Centralized Settings** - Manage all application configuration from `/settings`

<div align="center">
  <img src="static/target.png" alt="Provider Presets" width="600" />
  <p><em>One-click provider presets for OpenAI, Anthropic, Gemini, Azure, Ollama, and custom endpoints</em></p>
</div>

### Scenario Management

- **Visual Flow Builder** - Drag-and-drop editor with message, loop, delay, and conditional steps
- **12 Pre-built Templates** - Stress tests, edge cases, context testing, rapid fire, branching logic, attack surface patterns
- **Handlebars Templating** - Dynamic variable substitution with message index, timestamps, last response, and custom variables
- **YAML Import/Export** - Version-control-friendly scenario format with bulk import

<div align="center">
  <img src="static/scenario-builder.png" alt="Visual Scenario Builder" width="800" />
  <p><em>Visual flow builder with message, loop, delay, and conditional steps</em></p>
</div>

### Execution Engine

- **Async Job Queue** - BullMQ-powered fire-and-forget execution with configurable worker concurrency
- **Conversation Context** - Stateful session memory with message history, conversation ID tracking, and context windowing
- **Concurrency Control** - Semaphore-based limiting (1–100 parallel sessions)
- **Rate Limiting** - Token bucket algorithm with automatic 429 detection and exponential backoff
- **Browser WebSocket Discovery**
  - *Heuristic Widget Detection* - Three strategies: heuristic (auto-detects widgets using provider patterns for Intercom, Drift, Zendesk, LiveChat, Tawk, HubSpot, Crisp, Tidio, and more + positional matching), selector (direct CSS selector), and steps (ordered browser actions: click, type, wait, evaluate)
  - *WebSocket Capture via CDP* - Chrome DevTools Protocol captures HTTP upgrade headers and frames for connection replay outside the browser
  - *Socket.IO Auto-Detection* - Detects Socket.IO by URL patterns, Engine.IO handshake frames, and frame signal analysis; installs dedicated SocketIOHandler for proper framing and heartbeat
  - *Token Refresh* - BullMQ scheduler with configurable refresh intervals, Redis Pub/Sub notifications for credential hot-swap without disconnecting
  - *Discovery Caching* - Redis-backed cache with configurable TTL, force-fresh bypass, and full credential snapshots (cookies, headers, localStorage, sessionStorage)
- **Configurable Error Handling** - Per-scenario retry policies, timeouts, and error injection for resilience testing
- **Session Actions** - Restart, cancel, or delete sessions mid-flight

### Monitoring & Analytics

- **Live Dashboard** - Auto-refreshing widgets for active sessions, completion rate, response time, error rate, and token usage
- **Chart Visualizations** - Response time (line/bar), token distribution (doughnut), error rate trends via Chart.js
- **Session Replay** - Step-through playback with timeline, anomaly highlighting, and per-message metrics
- **Quality Scoring** - Automated relevance, coherence, and completeness assessment
- **Data Export** - CSV and JSON export for metrics and aggregated results

### Integrations & Automation

- **Webhook Notifications** - HMAC-SHA256 signed delivery for `session.completed` and `session.failed` events with retry
- **Batch Execution** - Run the same scenario against multiple targets in parallel with aggregated results
- **Cron Scheduling** - Standard cron expressions with timezone support for recurring test runs
- **Plugin System** - Extensible architecture with Multi-Step Auth, OpenAI, Anthropic, and Audit plugins

### Developer Experience

- **API Documentation** - Built-in Swagger/OpenAPI explorer at `/api-docs`
- **Mock Chatbot Server** - OpenAI-compatible mock with 5 personas (verbose, XML, ecommerce, support, repetitive)
- **Command Palette** - `Cmd+K` keyboard shortcuts for power users
- **Worker Auto-Start** - BullMQ workers launch automatically via Next.js `instrumentation.ts` - no separate process
- **File-Based Logging** - High-performance JSONL format for session data without database bloat
- **40+ Task Commands** - Comprehensive Taskfile for dev, test, build, database, and Docker operations

---

## Quick Start

### Prerequisites

- Node.js >= 20 &nbsp;|&nbsp; pnpm >= 8 &nbsp;|&nbsp; Docker Desktop

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL & Redis
pnpm install -g @go-task/task
task docker:up

# 3. Initialize database
task db:generate && task db:push && task db:seed

# 4. Start dev server (includes workers)
task dev:full
```

Or run everything at once:

```bash
task setup
```

### Access

| URL | Description |
|-----|-------------|
| [localhost:3000](http://localhost:3000) | Dashboard |
| [localhost:3000/guide](http://localhost:3000/guide) | Interactive setup wizard |
| [localhost:3000/api-docs](http://localhost:3000/api-docs) | Swagger API explorer |
| [localhost:3000/api/health](http://localhost:3000/api/health) | Health check |
| [localhost:8081](http://localhost:8081) | Redis Commander |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1 (App Router), TypeScript, Tailwind CSS, Chart.js |
| Backend | Next.js API Routes, Prisma ORM, BullMQ, Zod |
| Database | PostgreSQL 16 |
| Cache & Queue | Redis 7, BullMQ |
| Protocols | HTTP/REST (axios), WebSocket (ws), gRPC (grpc-js), SSE (eventsource), Browser WebSocket (Playwright) |
| Testing | Vitest, Testing Library, Mock Chatbot Server |
| DevOps | Docker Compose, GitLab CI/CD, Taskfile, Nginx |

---

## Architecture

Krawall follows a **Next.js App Router** architecture with background workers for async job processing. The frontend renders a rich dashboard UI while API routes handle CRUD operations and fire-and-forget execution. BullMQ workers pick up jobs from Redis and execute test scenarios through the connector abstraction layer.

### Connector System

All chatbot protocols extend a `BaseConnector` abstract class with a registry pattern for dynamic protocol resolution:

| Protocol | Connector | Features |
|----------|-----------|----------|
| HTTP/REST | `HTTPConnector` | Request/response templating, auth injection |
| WebSocket | `WebSocketConnector` | Bidirectional messaging, auto-reconnect |
| gRPC | `GRPCConnector` | Proto loading, TLS support |
| SSE | `SSEConnector` | Streaming response handling |
| Browser WebSocket | `BrowserWebSocketConnector` | Heuristic widget detection, CDP capture, Socket.IO/raw WS, token refresh |

### Provider Presets

| Preset | Provider | Auth |
|--------|----------|------|
| `openai-chat` | OpenAI Chat Completions | Bearer Token |
| `anthropic-messages` | Anthropic Messages API | Custom Header |
| `google-gemini` | Google Gemini | API Key |
| `azure-openai` | Azure OpenAI | API Key |
| `ollama` | Ollama (local) | None |
| `custom-http` | Custom HTTP | Configurable |
| `custom-websocket` | Custom WebSocket | Configurable |
| `custom-grpc` | Custom gRPC | Configurable |

Configurable presets support all authentication methods: **Bearer Token**, **API Key** (custom header name), **Basic Auth**, **Custom Headers**, and **None**.

### Worker Pipeline

1. **Session Execution** - Execute test scenarios with connector lifecycle management
2. **Metrics Aggregation** - Compute P50/P95/P99 percentiles from raw session data
3. **Webhook Delivery** - HMAC-signed event delivery with exponential backoff retry
4. **Token Refresh** - Background credential refresh for browser-discovered WebSocket sessions with Redis Pub/Sub notification

Workers start automatically via `instrumentation.ts` and shut down gracefully on `SIGTERM`/`SIGINT`.

### Browser Discovery Pipeline

Krawall can automatically discover and connect to WebSocket-based chatbots embedded in web pages — no manual endpoint configuration required.

**How it works:**

1. Playwright launches headless Chromium and navigates to the target page
2. CDP listener attaches to capture WebSocket upgrade headers
3. Widget detector locates and activates the chat widget using the configured strategy
4. WebSocket capture intercepts the resulting connection and collects frames
5. Protocol detector analyzes frames to determine raw WS vs Socket.IO
6. Credential extractor harvests cookies, localStorage, and sessionStorage
7. Result is cached in Redis for reuse within the session TTL

**Widget Detection Strategies:**

| Strategy | Use Case | How It Works |
|----------|----------|--------------|
| Heuristic | Unknown widgets (default) | Tries hint-derived selectors, then common provider patterns (Intercom, Drift, Zendesk, etc.), then positional matching |
| Selector | Known implementations | Clicks a user-provided CSS selector directly |
| Steps | Complex interactions | Executes ordered browser actions (click, type, wait, evaluate) |

**Supported Protocols:**

| Protocol | Detection | Features |
|----------|-----------|----------|
| Raw WebSocket | Default | Direct message relay, auto-reconnect |
| Socket.IO | URL patterns, handshake analysis, frame signals | Engine.IO heartbeat, namespace support, event framing |

<details>
<summary><strong>Project Structure</strong></summary>

```
krawall/
├── app/                        # Next.js App Router
│   ├── (dashboard)/            # UI routes (dashboard, guide, targets, scenarios, sessions, etc.)
│   ├── api/                    # 20+ API route handlers
│   └── globals.css
├── components/                 # 47 React components
│   ├── ui/                     # 19 design system primitives
│   ├── guide/                  # Setup wizard (8 steps)
│   ├── sessions/               # LogViewer, SessionReplay
│   ├── scenarios/              # FlowBuilder, YamlImportExport
│   └── ...                     # targets, batches, webhooks, jobs, metrics
├── lib/                        # Core business logic
│   ├── connectors/             # HTTP, WebSocket, gRPC, SSE + registry + presets + plugins
│   ├── jobs/                   # BullMQ queue, workers, scheduler
│   ├── metrics/                # MetricsCollector, QualityScorer
│   ├── webhooks/               # Signer, emitter, delivery
│   ├── context/                # ConversationContext (stateful memory)
│   ├── rate-limit/             # Token bucket algorithm
│   └── utils/                  # Encryption (AES-256-GCM), helpers
├── prisma/                     # Schema, migrations, seed
├── tests/                      # 70+ tests (unit + integration)
├── infra/                      # Docker Compose (dev + prod)
├── docs/                       # API.md, DEPLOYMENT.md, MOCK_CHATBOT.md
└── instrumentation.ts          # Worker auto-start hook
```

</details>

---

## Commands

<details>
<summary><strong>Development</strong></summary>

```bash
task dev              # Start development server
task dev:full         # Start dev + workers (recommended)
task build            # Production build
task type-check       # TypeScript checking
task lint             # ESLint
task format           # Prettier formatting
```

</details>

<details>
<summary><strong>Database</strong></summary>

```bash
task db:generate      # Generate Prisma client
task db:push          # Push schema changes
task db:migrate:dev   # Create migration
task db:seed          # Seed sample data
task db:studio        # Open Prisma Studio
```

</details>

<details>
<summary><strong>Docker</strong></summary>

```bash
task docker:up        # Start PostgreSQL + Redis
task docker:down      # Stop services
task docker:logs      # View logs
task docker:clean     # Remove volumes
```

</details>

<details>
<summary><strong>Testing</strong></summary>

```bash
task test             # Run tests
task test:watch       # Watch mode
task test:coverage    # With coverage report
task worker:status    # Check queue health
```

</details>

---

## Security

- **Credential Encryption** - AES-256-GCM at rest for all stored secrets
- **Input Validation** - Zod schemas on every API endpoint
- **SQL Injection Prevention** - Prisma parameterized queries
- **Webhook Signing** - HMAC-SHA256 payload verification
- **Rate Limiting** - Token bucket per target
- **Security Headers** - Configured via Next.js middleware

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | Complete REST API documentation |
| [Deployment Guide](docs/DEPLOYMENT.md) | Production deployment with Docker & Nginx |
| [Mock Chatbot](docs/MOCK_CHATBOT.md) | Mock server configuration and personas |
| [Scenario Templates](docs/templates.md) | Pre-built template documentation |
| [Plugin Development](docs/PLUGINS.md) | Writing custom plugins for connectors |
| [Configuration](CONFIGURATION.md) | Environment variables and infrastructure options |
| [Installation](INSTALL.md) | Step-by-step setup guide |
| [Changelog](docs/CHANGELOG.md) | Implementation history and milestones |

---

<div align="center">

Built with Next.js, TypeScript, and Tailwind CSS

</div>
