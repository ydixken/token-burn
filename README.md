# Krawall: Chatbot Testing Platform

A sophisticated platform for stress-testing conversational AI systems through realistic, high-volume conversation flows with repetitive, verbose prompts.

## Features

- **Interactive Setup Wizard**: 8-step guided configurator with inline forms, provider presets, and live connection testing at `/guide`
- **Provider Presets**: One-click setup for OpenAI, Anthropic, Google Gemini, Azure OpenAI, Ollama, custom HTTP/WebSocket/gRPC endpoints
- **12 Scenario Templates**: Pre-built test scenarios across categories — Stress Test, Edge Case, Context, Performance, Logic, Krawall, and Attack Surface
- **Multi-Protocol Support**: HTTP/REST, WebSockets, gRPC, Server-Sent Events
- **Flexible Templating**: JSON-based request/response mapping with Zod validation
- **Visual Scenario Builder**: Drag-and-drop flow editor with message, loop, delay, and conditional steps
- **Fire-and-Forget Execution**: Async session processing via BullMQ with template variable substitution
- **Conversation Context**: Stateful session memory with message history, conversation ID tracking, and context windowing
- **Real-Time Metrics**: Response time, token usage, error rates, repetition detection, quality scoring
- **A/B Comparison Testing**: Side-by-side comparison of chatbot responses with statistical analysis
- **Multi-Target Batch Execution**: Run the same scenario against multiple targets in parallel
- **Webhook Notifications**: HMAC-signed webhook delivery for session events with retry logic
- **Rate Limit Simulation**: Token bucket algorithm with automatic 429 backoff handling
- **Session Replay**: Step-through playback with anomaly highlighting and per-message metrics
- **YAML Import/Export**: Version-control-friendly scenario format with bulk import
- **Live Dashboard**: Real-time stats, quick execution, auto-refreshing widgets
- **Settings & Configuration**: Centralized settings management at `/settings`
- **API Documentation**: Built-in Swagger/OpenAPI explorer at `/api-docs`
- **Mock Chatbot Server**: Built-in OpenAI-compatible mock for testing without API keys
- **Inline Connection Testing**: Verify endpoints directly in the setup wizard or target management
- **Worker Auto-Start**: BullMQ workers start automatically via Next.js `instrumentation.ts` hook
- **File-Based Logging**: High-performance JSONL logging for session data

## Tech Stack

- **Frontend**: Next.js 16.1.6 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7, BullMQ
- **Testing**: Vitest, Mock Chatbot Server
- **DevOps**: Docker, Docker Compose, Taskfile

## Project Structure

```
krawall/
├── app/                        # Next.js 16.1.6 App Router
│   ├── (dashboard)/            # Dashboard routes (route group)
│   │   ├── page.tsx            # / — Live dashboard with widgets
│   │   ├── guide/              # /guide — Interactive setup wizard
│   │   ├── targets/            # /targets — Target management
│   │   ├── scenarios/          # /scenarios — Scenario CRUD + flow builder
│   │   ├── sessions/           # /sessions — Session list + detail + replay
│   │   ├── batches/            # /batches — Multi-target batch execution
│   │   ├── compare/            # /compare — A/B comparison views
│   │   ├── metrics/            # /metrics — Charts and analytics
│   │   ├── settings/           # /settings — Configuration + webhooks
│   │   └── api-docs/           # /api-docs — Swagger/OpenAPI explorer
│   ├── api/                    # API Routes
│   │   ├── targets/            # CRUD + connection testing
│   │   ├── scenarios/          # CRUD + YAML import/export
│   │   ├── sessions/           # Sessions + SSE streaming
│   │   ├── execute/            # Fire-and-forget + batch execution
│   │   ├── compare/            # A/B comparison API
│   │   ├── webhooks/           # Webhook CRUD + test + deliveries
│   │   ├── metrics/            # Query + export + quality scores
│   │   ├── queue/              # Queue status + worker health
│   │   ├── guide/              # Wizard target creation
│   │   └── dashboard/          # Aggregated stats
│   └── globals.css
├── components/                 # React components
│   ├── guide/                  # Guided setup wizard
│   │   ├── steps/              # 8 wizard steps
│   │   └── shared/             # Reusable guide components
│   ├── ui/                     # Design system (19 components)
│   ├── sessions/               # LogViewer, SessionReplay
│   ├── scenarios/              # FlowBuilder, YamlImportExport
│   ├── targets/                # TestConnectionButton
│   ├── batches/                # BatchExecuteForm
│   ├── webhooks/               # WebhookForm
│   └── jobs/                   # ActiveJobs
├── lib/                        # Core library
│   ├── connectors/             # HTTP, WebSocket, gRPC, SSE
│   │   └── presets.ts          # 8 provider presets
│   ├── scenarios/
│   │   └── templates.ts        # 12 scenario templates
│   ├── context/                # Conversation context / memory
│   ├── jobs/                   # BullMQ workers + scheduler
│   ├── metrics/                # MetricsCollector + QualityScorer
│   ├── webhooks/               # Signer + delivery worker + emitter
│   ├── rate-limit/             # Token bucket rate limiter
│   ├── logging/                # JSONL session logger
│   └── utils/                  # Encryption, helpers
├── prisma/                     # Database schema + migrations
├── tests/                      # Test suites (70+ tests)
│   ├── unit/                   # Connector, webhook, quality tests
│   ├── integration/            # API route + E2E tests
│   └── mocks/                  # Mock chatbot server
├── infra/                      # Docker Compose (dev + prod)
├── docs/                       # API reference + deployment guide
├── instrumentation.ts          # Worker auto-start (Next.js hook)
└── Taskfile.yml                # Task automation
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker Desktop (for PostgreSQL & Redis)

### Installation

1. **Clone and install dependencies**:
   ```bash
   pnpm install
   ```

2. **Start infrastructure services**:
   ```bash
   pnpm install -g @go-task/task
   task docker:up
   ```

3. **Setup database**:
   ```bash
   task db:generate
   task db:push
   task db:seed
   ```

4. **Start development server with workers**:
   ```bash
   task dev:full
   ```
   Workers start automatically via `instrumentation.ts` — no separate worker process needed.

5. **Visit the app**:
   - Dashboard: http://localhost:3000
   - **Guided Setup**: http://localhost:3000/guide — interactive wizard for first-time configuration
   - API Docs: http://localhost:3000/api-docs
   - Health Check: http://localhost:3000/api/health
   - Redis Commander: http://localhost:8081

### All-in-One Setup

```bash
task setup
```

## Available Commands

See all available commands:
```bash
task
```

### Development
```bash
task dev              # Start development server
task dev:full         # Start dev with workers (recommended)
task build            # Build for production
task type-check       # TypeScript checking
task lint             # Run ESLint
task format           # Format with Prettier
```

### Workers & Queue
```bash
task worker:status    # Check queue and worker health
```

### Database
```bash
task db:generate      # Generate Prisma client
task db:push          # Push schema changes
task db:migrate:dev   # Create migration
task db:seed          # Seed database
task db:studio        # Open Prisma Studio
```

### Docker
```bash
task docker:up        # Start services
task docker:down      # Stop services
task docker:logs      # View logs
task docker:clean     # Remove volumes
```

### Testing
```bash
task test             # Run tests
task test:watch       # Watch mode
task test:coverage    # With coverage
```

## Architecture

### Connector System

All chatbot protocols extend the `BaseConnector` abstract class:

```typescript
import { BaseConnector, ConnectorConfig } from "@/lib/connectors/base";

class MyConnector extends BaseConnector {
  async connect(): Promise<void> { /* ... */ }
  async sendMessage(message: string): Promise<ConnectorResponse> { /* ... */ }
  // ... other methods
}
```

### Provider Preset System

Extensible provider presets in `lib/connectors/presets.ts` allow one-click target configuration for popular LLM providers:

| Preset | Provider | Protocol | Auth |
|--------|----------|----------|------|
| `openai-chat` | OpenAI Chat Completions | HTTP/REST | Bearer Token |
| `anthropic-messages` | Anthropic Messages API | HTTP/REST | Custom Header |
| `google-gemini` | Google Gemini | HTTP/REST | API Key |
| `azure-openai` | Azure OpenAI | HTTP/REST | API Key |
| `ollama` | Ollama (local) | HTTP/REST | None |
| `custom-http` | Custom HTTP | HTTP/REST | Configurable |
| `custom-websocket` | Custom WebSocket | WebSocket | Configurable |
| `custom-grpc` | Custom gRPC | gRPC | Configurable |

Each preset includes endpoint defaults, auth field definitions, request/response templates, and inline documentation.

### Scenario Template System

12 pre-built templates in `lib/scenarios/templates.ts` across 7 categories:

| Category | Templates | Purpose |
|----------|-----------|---------|
| Stress Test | Basic, XML Format | High-volume repetitive prompts |
| Edge Case | Empty Input, Unicode | Boundary condition testing |
| Context | Conversation Context | Multi-turn memory testing |
| Performance | Rapid Fire | Throughput benchmarking |
| Logic | Branching Conversation | Conditional flow testing |
| Krawall | Long-Form Output | Token consumption analysis |
| Attack Surface | E-Commerce Drain, Support Flood, Context Stuffer, Polite Requester | Security and abuse pattern testing |

### Worker Lifecycle

BullMQ workers are managed automatically through Next.js instrumentation:

1. **Auto-start**: `instrumentation.ts` launches workers when the Next.js server starts (Node.js runtime only)
2. **Workers**: `session-execution` (run test scenarios), `metrics-aggregation` (compute P50/P95/P99 percentiles)
3. **Graceful shutdown**: Workers close cleanly on `SIGTERM`/`SIGINT`
4. **Health monitoring**: Queue status available via `GET /api/queue/status` or `task worker:status`

### Database Schema

Key models:
- **Target**: Chatbot endpoint configuration (auth, templates, rate limits)
- **Scenario**: Test scenario definition (flow config, execution settings)
- **Session**: Test execution instance (status, metrics, log path)
- **SessionMetric**: Per-message metrics
- **ScheduledJob**: Cron scheduling
- **Comparison**: A/B test results between two sessions
- **Webhook**: Event notification configuration
- **WebhookDelivery**: Delivery log with retry tracking

### Job Queue

BullMQ workers for background processing:
- `session-execution`: Execute test scenarios with connector lifecycle management
- `metrics-aggregation`: Aggregate and analyze metrics (P50, P95, P99)
- `webhook-delivery`: Signed webhook delivery with exponential backoff retry

## Testing

### Run Unit Tests

```bash
pnpm test
```

### Test with Mock Chatbot

The included mock chatbot server simulates various behaviors:
- Verbose responses
- XML format outputs
- Repetitive answers
- Error scenarios (5% random errors)
- Variable response times (100-2000ms)

## Implementation Status

### Phase 1: Foundation ✓
- Next.js 16.1.6 with TypeScript & Tailwind CSS
- Prisma schema with PostgreSQL
- Redis & BullMQ configuration
- BaseConnector abstract class + HTTPConnector
- Docker Compose stack, Taskfile, API health check
- Mock chatbot server + unit tests

### Phase 2: Core Features ✓
- Target CRUD API and UI
- Scenario management system + flow builder
- Session executor worker
- Fire-and-forget execution + file-based logging (JSONL)

### Phase 3: Additional Connectors ✓
- WebSocket connector (bidirectional, auto-reconnect)
- gRPC connector (proto loading, TLS support)
- SSE connector (streaming support)
- Connector registry with auto-registration

### Phase 4: Metrics & Visualization ✓
- MetricsCollector with Levenshtein distance algorithm
- Metrics aggregation worker (P50, P95, P99)
- Chart.js visualizations (Line, Bar, Doughnut) + CSV/JSON export

### Phase 5: Advanced Features ✓
- SSE endpoint for live log streaming + LogViewer
- 8 pre-built scenario templates + cron-based scheduling
- ActiveJobs monitoring + session detail pages

### Phase 6: DevOps & Documentation ✓
- GitLab CI/CD pipeline + production Docker Compose
- Nginx reverse proxy config
- Complete API documentation + AGENTS.md

### Phase 7: Build Fixes & Stability ✓
- Next.js 16 async params migration
- Prisma type alignment, gRPC interface compliance
- 70+ tests passing with deterministic mocks

### Phase 8: Session Engine & Context ✓
- Enhanced flow engine (all step types, Handlebars templating)
- Connector lifecycle with auto-reconnect (exponential backoff)
- Concurrency via semaphore-based limiting
- ConversationContext class with message history and windowing

### Phase 9: Target Testing & Dashboard ✓
- Target connection test endpoint (dry run)
- Dashboard stats API + live dashboard with auto-refreshing widgets
- Quick Execute widget + scenario flow builder (drag-and-drop)

### Phase 10: Comparison & Quality ✓
- A/B testing API + side-by-side comparison UI
- Response quality scoring (relevance, coherence, completeness)
- YAML import/export + rate limit simulation (token bucket)

### Phase 11: Webhooks & Notifications ✓
- Webhook model with HMAC-SHA256 signing
- BullMQ delivery worker with exponential backoff
- Event emission (session.completed, session.failed)

### Phase 12: Batch Execution & Replay ✓
- Multi-target batch execution API + progress tracking UI
- Session replay with playback controls, timeline, anomaly highlighting
- 48 API route integration tests

### Sprint 1: Design System & UI Components ✓
- 19 reusable UI components (Button, Card, Badge, Input, Modal, Tabs, Dropdown, Breadcrumb, DataTable, etc.)
- Collapsible sidebar navigation
- Command palette (Cmd+K) with keyboard shortcuts
- Toast notification system

### Sprint 2: Chat Backend Templating & Plugin System ✓
- Backend templating engine with plugin architecture
- Chat-based interaction patterns

### Sprint 3: Major Feature & Polish Sprint ✓
- Comprehensive feature polish and UX improvements
- Performance optimizations across the platform

### Sprint 4: Guided Setup Wizard ✓
- 8-step interactive wizard at `/guide`
- Provider presets for OpenAI, Anthropic, Gemini, Azure, Ollama + custom endpoints
- 12 scenario templates across 7 categories
- Inline connection testing with live results
- Live session monitoring during wizard execution

### Sprint 5: Worker Lifecycle & Diagnostics ✓
- Auto-start workers via `instrumentation.ts` (Next.js hook)
- Queue status API (`GET /api/queue/status`)
- Session diagnostics and worker health monitoring

## Security

- Credential encryption (AES-256-GCM)
- Input validation (Zod)
- Rate limiting
- Security headers
- SQL injection prevention (Prisma)

## License

Private project - All rights reserved

## Contributing

This project follows autonomous development with comprehensive testing at each stage.

---

Built with Next.js 16.1.6, TypeScript, and Tailwind CSS
