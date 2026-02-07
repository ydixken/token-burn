# Token-Burn: Chatbot Testing Platform

A sophisticated platform for stress-testing conversational AI systems through realistic, high-volume conversation flows with repetitive, verbose prompts.

## 🚀 Features

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
- **File-Based Logging**: High-performance JSONL logging for session data
- **Target Connection Testing**: One-click endpoint verification before running full scenarios

## 🛠️ Tech Stack

- **Frontend**: Next.js 16.1.4 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7, BullMQ
- **Testing**: Vitest, Mock Chatbot Server
- **DevOps**: Docker, Docker Compose, Taskfile

## 📦 Project Structure

```
token-burn/
├── app/                        # Next.js 16.1.4 App Router
│   ├── (dashboard)/            # Dashboard routes (route group)
│   │   ├── page.tsx            # / — Live dashboard with widgets
│   │   ├── targets/            # /targets — Target management
│   │   ├── scenarios/          # /scenarios — Scenario CRUD + flow builder
│   │   ├── sessions/           # /sessions — Session list + detail + replay
│   │   ├── batches/            # /batches — Multi-target batch execution
│   │   ├── compare/            # /compare — A/B comparison views
│   │   ├── metrics/            # /metrics — Charts and analytics
│   │   └── settings/webhooks/  # /settings/webhooks — Webhook management
│   ├── api/                    # API Routes
│   │   ├── targets/            # CRUD + connection testing
│   │   ├── scenarios/          # CRUD + YAML import/export
│   │   ├── sessions/           # Sessions + SSE streaming
│   │   ├── execute/            # Fire-and-forget + batch execution
│   │   ├── compare/            # A/B comparison API
│   │   ├── webhooks/           # Webhook CRUD + test + deliveries
│   │   ├── metrics/            # Query + export + quality scores
│   │   └── dashboard/          # Aggregated stats
│   └── globals.css
├── components/                 # React components
│   ├── sessions/               # LogViewer, SessionReplay
│   ├── scenarios/              # FlowBuilder, YamlImportExport
│   ├── targets/                # TestConnectionButton
│   ├── batches/                # BatchExecuteForm
│   ├── webhooks/               # WebhookForm
│   └── jobs/                   # ActiveJobs
├── lib/                        # Core library
│   ├── connectors/             # HTTP, WebSocket, gRPC, SSE
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
└── Taskfile.yml                # Task automation
```

## 🚀 Quick Start

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

4. **Start development server**:
   ```bash
   task dev
   ```

5. **Visit the app**:
   - Dashboard: http://localhost:3000
   - Health Check: http://localhost:3000/api/health
   - Redis Commander: http://localhost:8081

### All-in-One Setup

```bash
task setup
```

## 📝 Available Commands

See all available commands:
```bash
task
```

### Development
```bash
task dev              # Start development server
task build            # Build for production
task type-check       # TypeScript checking
task lint             # Run ESLint
task format           # Format with Prettier
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

## 🏗️ Architecture

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

## 🧪 Testing

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

## ✅ Implementation Status

### Milestone 1: Foundation ✓
- ✅ Next.js 16.1.4 with TypeScript & Tailwind CSS
- ✅ Prisma schema with PostgreSQL
- ✅ Redis & BullMQ configuration
- ✅ BaseConnector abstract class
- ✅ HTTPConnector implementation
- ✅ Docker Compose stack
- ✅ Taskfile for operations
- ✅ API health check endpoint
- ✅ Mock chatbot server
- ✅ Unit tests

### Milestone 2: Core Features ✓
- ✅ Target CRUD API and UI
- ✅ Scenario management system
- ✅ Scenario editor with flow builder
- ✅ Session executor worker
- ✅ File-based logging (JSONL)
- ✅ Fire-and-forget execution endpoint

### Milestone 3: Additional Connectors ✓
- ✅ WebSocket connector (bidirectional, auto-reconnect)
- ✅ gRPC connector (with proto loading, TLS support)
- ✅ SSE connector (streaming support)
- ✅ Connector registry with auto-registration

### Milestone 4: Metrics & Visualization ✓
- ✅ MetricsCollector with Levenshtein distance algorithm
- ✅ Metrics aggregation worker (percentiles: P50, P95, P99)
- ✅ Metrics API with aggregate statistics
- ✅ Chart.js visualizations (Line, Bar, Doughnut)
- ✅ CSV/JSON export functionality
- ✅ Repetition detection

### Milestone 5: Advanced Features ✓
- ✅ SSE endpoint for live log streaming
- ✅ LogViewer component with real-time updates
- ✅ 8 pre-built scenario templates
- ✅ Cron-based job scheduling system
- ✅ ActiveJobs monitoring component
- ✅ Session detail pages with live logs

### Milestone 6: DevOps & Documentation ✓
- ✅ GitLab CI/CD pipeline
- ✅ Production Docker Compose configuration
- ✅ Nginx reverse proxy config
- ✅ Complete API documentation
- ✅ AGENTS.md
- ✅ Deployment guides

### Milestone 7: Build Fixes & Stability ✓
- ✅ Next.js 16 async params migration (all dynamic routes)
- ✅ Prisma type alignment across all route handlers
- ✅ gRPC connector interface compliance
- ✅ Scheduler JSON type casting
- ✅ Unit test reliability (deterministic mock server)
- ✅ 70+ tests passing

### Milestone 8: Session Engine & Context ✓
- ✅ Enhanced flow engine (all step types, Handlebars templating)
- ✅ Connector lifecycle with auto-reconnect (exponential backoff)
- ✅ Concurrency via semaphore-based limiting
- ✅ Per-message and session-level timeouts
- ✅ Context variable extraction from responses
- ✅ ConversationContext class with message history and windowing

### Milestone 9: Target Testing & Dashboard ✓
- ✅ Target connection test endpoint (dry run)
- ✅ Dashboard stats API (aggregated metrics)
- ✅ Live dashboard with auto-refreshing widgets
- ✅ Quick Execute widget
- ✅ Scenario flow builder (drag-and-drop visual editor)
- ✅ Target test button in UI

### Milestone 10: Comparison & Quality ✓
- ✅ Comparison model and A/B testing API
- ✅ Side-by-side comparison UI with metric visualization
- ✅ Response quality scoring (relevance, coherence, completeness)
- ✅ YAML import/export for scenarios
- ✅ Rate limit simulation with token bucket algorithm

### Milestone 11: Webhooks & Notifications ✓
- ✅ Webhook model with HMAC-SHA256 signing
- ✅ BullMQ delivery worker with exponential backoff
- ✅ Webhook CRUD API + test delivery endpoint
- ✅ Event emission (session.completed, session.failed)
- ✅ Webhook management UI with delivery logs

### Milestone 12: Batch Execution & Replay ✓
- ✅ Multi-target batch execution API
- ✅ Batch execution UI with progress tracking
- ✅ Session replay with playback controls and timeline
- ✅ Anomaly highlighting in replay (errors, slow responses, repetitions)
- ✅ API route integration tests (48 tests)

## 🔒 Security

- Credential encryption (AES-256-GCM)
- Input validation (Zod)
- Rate limiting
- Security headers
- SQL injection prevention (Prisma)

## 📄 License

Private project - All rights reserved

## 🤝 Contributing

This project follows autonomous development with comprehensive testing at each stage.

---

Built with ❤️ using Next.js 16.1.4, TypeScript, and Tailwind CSS
