# Token-Burn: Chatbot Testing Platform

A sophisticated platform for stress-testing conversational AI systems through realistic, high-volume conversation flows with repetitive, verbose prompts.

## 🚀 Features

- **Multi-Protocol Support**: HTTP/REST, WebSockets, gRPC, Server-Sent Events
- **Flexible Templating**: JSON-based request/response mapping with Zod validation
- **Scenario Library**: Pre-built test scenarios for stress testing
- **Fire-and-Forget Execution**: Async session processing via BullMQ
- **Real-Time Metrics**: Response time, token usage, error rates, repetition detection
- **File-Based Logging**: High-performance JSONL logging for session data
- **Live Streaming**: Real-time log viewing via Server-Sent Events

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
├── app/                    # Next.js 16.1.4 App Router
│   ├── (dashboard)/       # Dashboard routes
│   ├── api/               # API endpoints
│   └── globals.css        # Global styles
├── components/            # React components
├── lib/                   # Core library
│   ├── connectors/        # Protocol implementations
│   ├── jobs/             # BullMQ workers
│   ├── db/               # Prisma client
│   ├── cache/            # Redis client
│   └── utils/            # Utilities
├── prisma/               # Database schema
├── tests/                # Test suites
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── mocks/            # Mock servers
├── infra/                # Infrastructure
│   └── docker-compose.yml
└── Taskfile.yml          # Task automation
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
- **Target**: Chatbot endpoint configuration
- **Scenario**: Test scenario definition
- **Session**: Test execution instance
- **SessionMetric**: Per-message metrics
- **ScheduledJob**: Cron scheduling

### Job Queue

BullMQ workers for background processing:
- `session-execution`: Execute test scenarios
- `metrics-aggregation`: Aggregate and analyze metrics

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
