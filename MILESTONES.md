# Krawall Implementation Milestones

This document defines the 6 implementation milestones for the Krawall chatbot testing platform. Each milestone MUST be completed sequentially and committed to git upon completion.

---

## Milestone 1: Foundation ✅ COMPLETED

**Status**: ✅ Completed and Committed (commit: 3c69255)

**Goals**: Project scaffolding, database, basic connector, Docker setup

**Deliverables**:
1. ✅ Initialize Next.js 16.1.6 with TypeScript + Tailwind CSS
2. ✅ Configure Prisma with PostgreSQL schema
3. ✅ Set up Redis and BullMQ
4. ✅ Implement BaseConnector abstract class
5. ✅ Create HTTPConnector (REST API support)
6. ✅ Write Docker Compose stack (app, postgres, redis)
7. ✅ Create Taskfile for common operations
8. ✅ Implement API health check endpoint
9. ✅ Create mock chatbot server for testing
10. ✅ Write unit tests for connectors

**Critical Files Created**:
- [package.json](package.json) - Dependencies and scripts
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema
- [lib/connectors/base.ts](lib/connectors/base.ts) - Connector interface
- [lib/connectors/http.ts](lib/connectors/http.ts) - HTTP implementation
- [infra/docker-compose.yml](infra/docker-compose.yml) - Docker stack
- [Taskfile.yml](Taskfile.yml) - Task automation
- [.env.example](.env.example) - Environment template

**Verification**:
- `task docker:up` starts all services ✅
- `task db:migrate` applies schema ✅
- Health check responds at `/api/health` ✅
- Unit tests pass (8/10) ✅
- Git commit created ✅

---

## Milestone 2: Core Features 🔄 IN PROGRESS

**Goals**: Target management, scenarios, session execution, logging

**Tasks**:
1. Build target CRUD API routes
2. Create target management UI pages
3. Implement scenario editor with flow builder
4. Build templating engine with Zod validation
5. Write session executor worker
6. Implement SessionLogger for file logging
7. Create `/api/execute` endpoint (fire-and-forget)
8. Build session list UI

**Deliverables**:
- [src/app/api/targets/route.ts](src/app/api/targets/route.ts) - Target API
- [src/app/(dashboard)/targets/page.tsx](src/app/(dashboard)/targets/page.tsx) - Target UI
- [src/app/api/scenarios/route.ts](src/app/api/scenarios/route.ts) - Scenario API
- [src/app/(dashboard)/scenarios/page.tsx](src/app/(dashboard)/scenarios/page.tsx) - Scenario UI
- [src/lib/templating/engine.ts](src/lib/templating/engine.ts) - Template engine
- [src/lib/jobs/workers/session-executor.ts](src/lib/jobs/workers/session-executor.ts) - Worker (update)
- [src/lib/storage/session-logger.ts](src/lib/storage/session-logger.ts) - Logger
- [src/app/api/execute/route.ts](src/app/api/execute/route.ts) - Execution API

**Verification Criteria**:
- Create target via UI, verify in database
- Create scenario with 3+ message steps
- Execute session, verify status transitions: PENDING → QUEUED → RUNNING → COMPLETED
- Check logs written to `logs/sessions/{id}/`
- All TypeScript compiles without errors
- Tests pass for new functionality

**Git Commit Required**: Upon completion, commit with message:
```
feat: complete milestone 2 - core features

[Details of implementation]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Milestone 3: Additional Connectors 📋 PENDING

**Goals**: WebSocket, gRPC, SSE support

**Tasks**:
1. Implement WebSocketConnector
2. Implement gRPCConnector
3. Implement SSEConnector
4. Build ConnectorRegistry with auto-registration
5. Create UI connector selector
6. Add protocol-specific configuration forms
7. Write integration tests for each connector

**Deliverables**:
- [lib/connectors/websocket.ts](lib/connectors/websocket.ts)
- [lib/connectors/grpc.ts](lib/connectors/grpc.ts)
- [lib/connectors/sse.ts](lib/connectors/sse.ts)
- [lib/connectors/registry.ts](lib/connectors/registry.ts) - Update
- [components/targets/ConnectorSelector.tsx](components/targets/ConnectorSelector.tsx)
- [tests/integration/connectors/](tests/integration/connectors/) - Tests

**Technical Requirements**:
- Each connector MUST extend BaseConnector
- Each connector MUST be registered in ConnectorRegistry
- Each connector MUST handle reconnection logic
- Integration tests MUST use mock servers
- Test coverage MUST be >= 80%

**Verification Criteria**:
- Create targets for each protocol type (HTTP, WebSocket, gRPC, SSE)
- Execute test sessions successfully on all protocols
- All connectors handle authentication properly
- Health checks work for all connector types
- No memory leaks in WebSocket connections

**Git Commit Required**: Yes

---

## Milestone 4: Metrics & Visualization 📋 PENDING

**Goals**: Metrics collection, aggregation, charts, export

**Tasks**:
1. Implement MetricsCollector for per-message metrics
2. Create metrics aggregation worker
3. Build MetricsDashboard component
4. Add Chart.js visualizations (response time, tokens, errors)
5. Implement repetition detection algorithm
6. Build CSV/PDF export functionality
7. Create metrics API endpoints

**Deliverables**:
- [lib/metrics/collector.ts](lib/metrics/collector.ts)
- [lib/jobs/workers/metrics-aggregator.ts](lib/jobs/workers/metrics-aggregator.ts)
- [components/metrics/MetricsDashboard.tsx](components/metrics/MetricsDashboard.tsx)
- [components/metrics/ResponseTimeChart.tsx](components/metrics/ResponseTimeChart.tsx)
- [components/metrics/TokenUsageChart.tsx](components/metrics/TokenUsageChart.tsx)
- [app/api/metrics/route.ts](app/api/metrics/route.ts)
- [lib/metrics/exporter.ts](lib/metrics/exporter.ts)

**Technical Requirements**:
- Metrics MUST be stored per message in SessionMetric table
- Aggregation MUST run as background job
- Charts MUST be interactive (zoom, pan, hover)
- Export MUST support CSV and PDF formats
- Repetition detection MUST use cosine similarity or similar algorithm

**Verification Criteria**:
- Metrics stored per message in database
- Charts render with real data from completed sessions
- Export generates valid CSV with all metrics
- Repetition scores calculated accurately (0-1 scale)
- Dashboard loads in < 2 seconds with 1000+ sessions

**Git Commit Required**: Yes

---

## Milestone 5: Advanced Features 📋 PENDING

**Goals**: Live streaming, scenario library, scheduling, concurrency

**Tasks**:
1. Build SSE endpoint for live log streaming
2. Create LogViewer component with real-time updates
3. Add pre-built scenario templates (5+ templates)
4. Implement scheduled job system with cron
5. Add concurrency configuration to scenarios
6. Build job monitoring UI
7. Implement error injection for resilience testing

**Deliverables**:
- [app/api/sessions/[id]/stream/route.ts](app/api/sessions/[id]/stream/route.ts)
- [components/sessions/LogViewer.tsx](components/sessions/LogViewer.tsx)
- [lib/scenarios/templates.ts](lib/scenarios/templates.ts) - Pre-built scenarios
- [lib/jobs/scheduler.ts](lib/jobs/scheduler.ts)
- [components/jobs/ActiveJobs.tsx](components/jobs/ActiveJobs.tsx)
- [lib/testing/error-injector.ts](lib/testing/error-injector.ts)

**Pre-built Scenario Templates**:
1. **Stress Test**: Repetitive queries (already in seed data)
2. **XML Bomb**: Expensive format requests (already in seed data)
3. **Context Overflow**: Cumulative context (already in seed data)
4. **Edge Cases**: Mixed formats (already in seed data)
5. **Concurrency Test**: Parallel message flooding
6. **Timeout Test**: Delayed responses
7. **Error Recovery**: Resilience testing

**Technical Requirements**:
- SSE MUST reconnect automatically on disconnect
- Live logs MUST stream with < 100ms latency
- Cron expressions MUST support standard syntax
- Concurrency MUST be configurable (1-100 parallel sessions)
- Error injection MUST support: timeout, 500 errors, rate limits

**Verification Criteria**:
- Live logs stream to UI during execution
- Template library has 7+ useful scenarios
- Scheduled jobs execute on time (within 5 second tolerance)
- Multiple sessions run in parallel without interference
- Error injection scenarios complete successfully

**Git Commit Required**: Yes

---

## Milestone 6: Polish & DevOps 📋 PENDING

**Goals**: CI/CD, production config, documentation, AGENTS.md

**Tasks**:
1. Write `.gitlab-ci.yml` with full pipeline (lint, test, build, deploy)
2. Create production Docker Compose configuration
3. Add Nginx reverse proxy configuration
4. Implement rate limiting and security headers
5. Write comprehensive [README.md](README.md)
6. Document API in [docs/API.md](docs/API.md)
7. Verify [AGENTS.md](AGENTS.md) is complete
8. Write deployment guides

**Deliverables**:
- [.gitlab-ci.yml](.gitlab-ci.yml) - CI/CD pipeline
- [infra/docker-compose.prod.yml](infra/docker-compose.prod.yml)
- [docker/nginx.conf](docker/nginx.conf)
- [README.md](README.md) - Update with final features
- [docs/API.md](docs/API.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [AGENTS.md](AGENTS.md) - Verify completeness

**GitLab CI/CD Pipeline Stages**:
1. **lint**: ESLint, TypeScript check, Prettier
2. **test**: Unit + integration tests with coverage
3. **build**: Docker images (app + worker)
4. **deploy-staging**: Automatic deployment to staging
5. **deploy-production**: Manual deployment to production

**Technical Requirements**:
- Pipeline MUST complete in < 10 minutes
- Test coverage MUST be >= 80%
- Docker images MUST be optimized (< 500MB for app)
- Nginx MUST handle SSL termination
- Rate limiting MUST be configurable per environment

**Verification Criteria**:
- CI pipeline passes all stages
- Production deployment successful
- API documentation complete with all endpoints
- AGENTS.md covers all RFC 2119 requirements
- Deployment guide tested on fresh server

**Git Commit Required**: Yes

---

## Milestone Progress Tracking

| Milestone | Status | Commit | Date Completed |
|-----------|--------|--------|----------------|
| 1. Foundation | ✅ Completed | 3c69255 | 2026-01-26 |
| 2. Core Features | 🔄 In Progress | - | - |
| 3. Additional Connectors | 📋 Pending | - | - |
| 4. Metrics & Visualization | 📋 Pending | - | - |
| 5. Advanced Features | 📋 Pending | - | - |
| 6. Polish & DevOps | 📋 Pending | - | - |

---

## Success Criteria (All Milestones)

The project is complete when:

- ✅ All 6 milestones delivered
- ✅ All 4 connector types working (HTTP, WebSocket, gRPC, SSE)
- ✅ Fire-and-forget execution functional
- ✅ Live log streaming operational
- ✅ Metrics dashboard rendering charts
- ✅ Docker stack runs successfully
- ✅ CI/CD pipeline passing
- ✅ E2E test scenario successful
- ✅ Documentation complete (README, API, AGENTS.md)
- ✅ Can test a real chatbot end-to-end
- ✅ All milestones committed to git

---

## Notes for Context Management

**If context needs to be compacted:**
- This file (MILESTONES.md) contains the complete implementation plan
- Read this file to understand what needs to be built
- Check Milestone Progress Tracking table for current status
- Each milestone has detailed verification criteria
- Git commit is REQUIRED after each milestone completion

**Critical Files to Retain**:
- MILESTONES.md (this file) - Complete plan
- AGENTS.md - Behavior guidelines
- CLAUDE.md - Agent instructions
- README.md - Current state documentation
- prisma/schema.prisma - Data models

---

**Last Updated**: 2026-01-26
**Current Milestone**: 2 (Core Features)
**Next Milestone**: Complete target management and scenario system
