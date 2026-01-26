# AGENTS.md - Token-Burn Development Guidelines

This document defines mandatory behavior for automated agents and human contributors working in the Token-Burn codebase.

---

## 1. Repository / Product Overview

**Token-Burn** is a sophisticated chatbot testing platform designed for stress-testing conversational AI systems through realistic, high-volume conversation flows. It serves QA engineers, DevOps teams, and AI developers who need to validate chatbot performance, reliability, and token consumption under various load conditions.

### Core Responsibilities

- Execute high-volume test scenarios against chatbot endpoints
- Support multiple communication protocols (HTTP/REST, WebSocket, gRPC, SSE)
- Collect comprehensive metrics (response times, token usage, error rates)
- Provide real-time monitoring and visualization
- Enable scheduled and automated testing workflows

### Key Non-Functional Goals

- **Security**: Encrypt credentials at rest, validate all inputs, prevent injection attacks
- **Performance**: Handle high message volumes with minimal overhead via file-based logging
- **Reliability**: Graceful error handling, automatic reconnection, data integrity
- **Maintainability**: Clear separation of concerns, comprehensive documentation, testable architecture
- **Scalability**: Horizontal worker scaling, efficient queue management, connection pooling

---

## 2. RFC 2119 Language

This document uses RFC 2119 keywords to indicate requirement levels:

- **MUST** / **REQUIRED** / **SHALL**: Absolute requirement
- **MUST NOT** / **SHALL NOT**: Absolute prohibition
- **SHOULD** / **RECOMMENDED**: Strong recommendation (may be ignored with valid justification)
- **SHOULD NOT** / **NOT RECOMMENDED**: Strong discouragement
- **MAY** / **OPTIONAL**: Truly optional, left to implementer discretion

All agents and contributors MUST adhere to MUST/REQUIRED/SHALL statements without exception.

---

## 3. Documentation & External References

### Authoritative Sources

Agents MUST consult official documentation before making assumptions:

1. **Next.js 16.1.4**: https://nextjs.org/docs
   - App Router conventions
   - API Routes structure
   - Server-Sent Events handling

2. **Prisma ORM**: https://www.prisma.io/docs
   - Schema syntax
   - Migration workflows
   - Client generation

3. **BullMQ**: https://docs.bullmq.io
   - Queue configuration
   - Worker concurrency
   - Job patterns

4. **Protocol Specifications**:
   - WebSocket (RFC 6455)
   - gRPC (https://grpc.io/docs/)
   - Server-Sent Events (W3C spec)

### Verification Requirements

- Agents MUST verify protocol specifications before implementing connectors
- Agents SHOULD test against mock endpoints before claiming functionality works
- Agents MUST NOT guess authentication schemes; MUST reference target API documentation
- Agents SHOULD validate Prisma schema changes with `pris ma validate` before committing

---

## 4. Project Structure & Architecture

### Required Directory Layout

```
token-burn/
├── app/                    # Next.js App Router (MUST use for all routes)
│   ├── (dashboard)/        # Route group (parentheses for organization only)
│   ├── api/                # API routes (MUST follow RESTful conventions)
│   └── globals.css
├── components/             # React components (MUST be client-side unless marked)
│   ├── ui/                 # Reusable UI primitives
│   ├── targets/            # Feature-specific components
│   └── ...
├── lib/                    # Core library code
│   ├── connectors/         # Protocol implementations (MUST extend BaseConnector)
│   ├── jobs/               # BullMQ workers
│   ├── db/                 # Prisma client
│   ├── cache/              # Redis client
│   ├── scenarios/          # Scenario templates
│   └── utils/              # Utilities
├── prisma/
│   └── schema.prisma       # Single source of truth for data models
├── tests/
│   ├── unit/
│   ├── integration/
│   └── mocks/
├── infra/                  # Docker Compose configurations
└── docs/                   # Additional documentation
```

### Architectural Boundaries

- **Connectors** MUST be protocol-agnostic; business logic MUST NOT leak into connector layer
- **API routes** MUST validate inputs with Zod schemas before processing
- **Workers** MUST be idempotent; retries MUST NOT cause duplicate side effects
- **Components** SHOULD be under 300 lines; larger components SHOULD be decomposed
- **Database access** MUST go through Prisma; raw SQL is NOT RECOMMENDED

### Generated Code

- `prisma/generated/` is generated code; agents MUST NOT edit directly
- `.next/` is build output; agents MUST NOT commit
- Agents MUST run `pnpm prisma generate` after schema changes

---

## 5. Integrations & External Systems

### Connector System

All protocol implementations MUST:

1. Extend `BaseConnector` abstract class
2. Implement all required methods:
   - `connect(): Promise<void>`
   - `disconnect(): Promise<void>`
   - `sendMessage(message: string): Promise<ConnectorResponse>`
   - `healthCheck(): Promise<HealthStatus>`
   - `supportsStreaming(): boolean`
3. Register with `ConnectorRegistry.register(type, ConnectorClass)`
4. Handle authentication via `authConfig` property
5. Apply request/response templates via base class methods

### Adding New Connectors

When adding a new connector, agents MUST:

1. Create file in `lib/connectors/[protocol].ts`
2. Extend `BaseConnector` with protocol-specific implementation
3. Add auto-registration call at end of file
4. Update `lib/connectors/index.ts` to import the new connector
5. Add `ConnectorType` enum value to Prisma schema if needed
6. Write integration tests in `tests/integration/connectors/[protocol].test.ts`
7. Document connector-specific configuration in API docs

Agents MUST NOT:
- Bypass the connector abstraction layer
- Mix business logic with protocol implementation
- Share state between connector instances

---

## 6. Security, Privacy & Safety

### Credential Management

- Agents MUST encrypt all credentials using AES-256-GCM before storing in database
- Agents MUST use the `ENCRYPTION_KEY` environment variable for encryption
- Agents MUST NOT log credentials in plaintext (in console, files, or error messages)
- Agents MUST NOT expose credentials in API responses
- Agents SHOULD use environment variables for all secrets

### Input Validation

- Agents MUST validate all API inputs with Zod schemas
- Agents MUST sanitize user-provided content before display (XSS prevention)
- Agents MUST use Prisma parameterized queries (SQL injection prevention)
- Agents MUST validate cron expressions before scheduling jobs
- Agents SHOULD reject oversized payloads (implement size limits)

### Data Safety

- Agents MUST NOT run destructive database operations without migrations
- Agents MUST back up data before major schema changes in production
- Agents MUST implement graceful degradation when external services fail
- Agents SHOULD use database transactions for multi-step operations

### Secret Management

Files that MUST NOT be committed:
- `.env` (contains secrets)
- `.env.local`
- `credentials.json`
- Any file containing API keys, tokens, or passwords

---

## 7. Coding Style & Conventions

### TypeScript

- Agents MUST enable TypeScript strict mode
- Agents MUST type all function parameters and return values
- Agents MUST NOT use `any` except in Prisma JSON fields or validated external data
- Agents SHOULD use discriminated unions for polymorphic data
- Agents SHOULD prefer `interface` over `type` for object shapes

### Naming Conventions

- Files: `kebab-case.ts` (e.g., `session-logger.ts`)
- Components: `PascalCase.tsx` (e.g., `LogViewer.tsx`)
- Functions: `camelCase` (e.g., `executeSession`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- Database models: `PascalCase` (e.g., `Session`, `ScheduledJob`)

### Component Guidelines

- Client components MUST have `"use client"` directive at top
- Server components MUST NOT use hooks or browser APIs
- Components MUST receive props via typed interfaces
- Components SHOULD be pure (same props → same output)
- Event handlers SHOULD use arrow functions to maintain `this` context

### API Routes

- Routes MUST return `NextResponse.json()`
- Routes MUST handle errors with try-catch
- Routes MUST validate inputs with Zod
- Routes SHOULD return consistent response shape: `{ success: boolean, data?: any, error?: string }`
- Routes MUST set appropriate HTTP status codes

### Logging

- Agents MUST use structured logging for production
- Agents MUST include correlation IDs for tracing
- Agents MUST NOT log sensitive data (passwords, tokens, PII)
- Log levels: error (failures), warn (degraded), info (significant events), debug (troubleshooting)

### File Complexity

- Files SHOULD be under 500 lines
- Functions SHOULD be under 50 lines
- Agents MUST extract logic into separate files when limits are exceeded

---

## 8. Dependency & Package Management

### Package Manager

- Agents MUST use `pnpm` exclusively (not npm or yarn)
- Agents MUST commit `pnpm-lock.yaml`
- Agents MUST run `pnpm install --frozen-lockfile` in CI

### Adding Dependencies

Before adding a dependency, agents MUST:

1. Verify it's actively maintained (commits within last 6 months)
2. Check for known security vulnerabilities (`pnpm audit`)
3. Evaluate bundle size impact
4. Confirm license compatibility
5. Document reason in commit message

Agents MUST NOT:
- Add dependencies with critical vulnerabilities
- Add unmaintained packages (>1 year since last update)
- Add packages that duplicate existing functionality

### Approved Core Dependencies

- **Framework**: Next.js 16.1.4, React 19.2.4
- **Database**: Prisma ORM, PostgreSQL client
- **Queue**: BullMQ, Redis client (ioredis)
- **Validation**: Zod
- **Testing**: Vitest, Testing Library
- **UI**: Tailwind CSS, Chart.js
- **Utilities**: date-fns, lodash-es

---

## 9. Workflow, Milestones & Planning

### Milestone-Based Development

This project follows a 6-milestone structure. Agents MUST:

- Complete all tasks within a milestone before moving to the next
- Update README.md milestone checklist upon completion
- Write comprehensive tests for each milestone
- Commit and push after each milestone completion

### Git Workflow

#### Commit Requirements

- Agents MUST write descriptive commit messages following Conventional Commits
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Example: `feat(connectors): add WebSocket connector with auto-reconnect`
- Agents MUST include Co-Author line: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

#### Branch Strategy

- `main` branch is protected
- Agents SHOULD create feature branches for major work
- Agents MUST NOT force-push to shared branches
- Agents MUST rebase before merging to keep history clean

#### What to Commit

Agents MUST commit:
- Source code changes
- Configuration files
- Documentation updates
- Migration files
- Test files

Agents MUST NOT commit:
- `.env` files
- `node_modules/`
- `.next/` build output
- Log files (`logs/`)
- `prisma/generated/`

---

## 10. Docker Container Management

Agents HAVE FULL AUTONOMY to manage Docker containers for testing and development.

### Allowed Operations

Agents MAY:
- Start containers: `docker compose up -d`
- Stop containers: `docker compose down`
- Restart containers: `docker compose restart [service]`
- Rebuild images: `docker compose build`
- View logs: `docker compose logs -f [service]`
- Check status: `docker compose ps`

### Services

- **postgres** (port 5432): PostgreSQL 16 database
- **redis** (port 6379): Redis 7 cache/queue
- **redis-commander** (port 8081): Redis UI

### Container Management Guidelines

Agents SHOULD:
- Restart containers after configuration changes
- Check logs when services fail to start
- Clean volumes with `docker compose down -v` only when explicitly needed
- Rebuild images after dependency changes

---

## 11. Agent Expectations

### Expertise Level

Agents are expected to operate at a **staff-level software engineering** standard:

- Deep understanding of Next.js App Router patterns
- Proficiency with TypeScript advanced types
- Experience with distributed systems and message queues
- Knowledge of database schema design and migrations
- Familiarity with Docker and containerization

### Proactive Responsibilities

Agents SHOULD:

1. **Refactor duplicated code** into reusable utilities
2. **Identify architectural concerns** and report them
3. **Optimize performance** when bottlenecks are detected
4. **Improve error messages** to aid debugging
5. **Add missing tests** for critical paths
6. **Update documentation** when behavior changes

### Design Principles

Agents MUST:

- **Favor simplicity** over premature optimization
- **Write self-documenting code** with clear names
- **Design for testability** (dependency injection, pure functions)
- **Handle errors gracefully** (don't crash the process)
- **Log actionable information** (what went wrong, how to fix)

### Communication

When agents encounter:
- **Ambiguous requirements**: Ask for clarification rather than guessing
- **Multiple valid approaches**: Present options with trade-offs
- **Breaking changes**: Document migration path for users
- **Security concerns**: Flag immediately and propose mitigations

---

## 12. Out-of-Scope Actions

Agents MUST NOT take the following actions without explicit user approval:

### Database Operations

- MUST NOT drop tables in production
- MUST NOT run migrations marked as `--skip-seed`
- MUST NOT modify `schema.prisma` without creating a migration
- MUST NOT truncate tables with user data

### Deployment Operations

- MUST NOT push directly to `main` branch (use pull requests)
- MUST NOT deploy to production without approval
- MUST NOT modify production environment variables
- MUST NOT restart production services without coordination

### Destructive Operations

- MUST NOT delete log files needed for debugging
- MUST NOT remove Docker volumes without confirmation
- MUST NOT force-push to shared branches
- MUST NOT bypass CI/CD pipeline

### Security Operations

- MUST NOT disable authentication or authorization
- MUST NOT expose internal APIs publicly
- MUST NOT commit secrets or credentials
- MUST NOT weaken encryption or validation

### Dependency Operations

- MUST NOT upgrade major versions without testing
- MUST NOT add dependencies with known CVEs
- MUST NOT remove dependencies still in use
- MUST NOT change package manager (always use pnpm)

---

## 13. Testing Requirements

### Test Coverage

- Agents MUST write tests for new connectors (integration tests)
- Agents SHOULD achieve >80% coverage for critical paths
- Agents MUST test error scenarios, not just happy paths
- Agents SHOULD use the mock chatbot server for integration tests

### Test Organization

- Unit tests: `tests/unit/[module].test.ts`
- Integration tests: `tests/integration/[feature].test.ts`
- Mocks: `tests/mocks/[service].ts`

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

---

## 14. Performance Considerations

### Optimization Guidelines

- Agents SHOULD use file-based logging for high-volume message data
- Agents SHOULD batch database operations when possible
- Agents SHOULD implement pagination for large result sets
- Agents SHOULD use Redis caching for frequently accessed data
- Agents SHOULD close database connections properly

### Monitoring

- Agents SHOULD add health check endpoints for all services
- Agents SHOULD track worker queue sizes
- Agents SHOULD log performance metrics (response times, throughput)

---

## 15. Accessibility & Usability

- UI components SHOULD follow WCAG 2.1 Level AA guidelines
- Forms MUST have proper labels and error messages
- Loading states MUST be indicated clearly
- Error messages MUST be actionable (tell user how to fix)

---

## Summary

This document establishes the rules and expectations for all work on Token-Burn. By following these guidelines, agents ensure:

- **Consistent quality** across all contributions
- **Secure handling** of sensitive data
- **Maintainable architecture** that scales
- **Reliable functionality** backed by tests
- **Clear communication** with users and contributors

Agents MUST treat MUST/SHALL/REQUIRED statements as mandatory. Deviations require explicit justification and approval.
