# Token-Burn Agent Behavior Guidelines

This document defines **how automated agents and human contributors MUST behave** when working in this codebase. This is the single source of truth for agent behavior.

---

## RFC 2119 Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

**Compliance with this document is REQUIRED for all automated agents and contributors.**

---

## Repository Overview

### Purpose
Token-Burn is a sophisticated chatbot testing platform designed to stress-test conversational AI systems through realistic, high-volume conversation flows with repetitive, verbose prompts.

### Target Users
- QA Engineers testing chatbot implementations
- ML Engineers evaluating model performance
- Product Teams validating chatbot behavior
- DevOps Teams monitoring chatbot infrastructure

### Core Goals
1. **Reliability**: Platform MUST execute tests consistently and accurately
2. **Security**: Credentials and sensitive data MUST be protected at all times
3. **Extensibility**: System MUST support adding new protocols and connectors
4. **Performance**: Tests MUST run efficiently without degrading target systems
5. **Maintainability**: Code MUST be clear, well-documented, and testable

---

## Critical: Git Commit and Push Requirements

**MANDATORY COMMIT AND PUSH POLICY**

Agents and contributors MUST commit changes to git AND push to the remote repository after completing each milestone. This is a **CRITICAL REQUIREMENT** that MUST NOT be skipped.

### Commit and Push Rules

1. **Milestone Completion Commits**
   - MUST commit immediately after completing each milestone
   - Commit message MUST follow format: `feat: complete milestone N - <milestone name>`
   - MUST include all relevant files in the commit
   - MUST NOT skip commits between milestones
   - MUST push to remote repository after committing

2. **Commit Message Format**
   ```
   <type>: <subject>

   <optional body>

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

3. **Commit Types**
   - `feat:` - New feature or milestone completion
   - `fix:` - Bug fixes
   - `docs:` - Documentation updates
   - `test:` - Test additions or modifications
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

4. **Verification and Push**
   - MUST verify commit succeeded with `git log --oneline -1`
   - MUST ensure all files are tracked
   - MUST check git status is clean after commit
   - MUST push to remote with `git push`
   - MUST verify push succeeded

### Example Commit and Push Flow

```bash
# After completing Milestone 1
git add .
git commit -m "$(cat <<'EOF'
feat: complete milestone 1 - foundation

- Initialize Next.js 16.1.4 with TypeScript and Tailwind CSS
- Configure Prisma with PostgreSQL schema
- Set up Redis and BullMQ
- Implement BaseConnector and HTTPConnector
- Create Docker Compose stack
- Add Taskfile for operations
- Implement health check endpoint
- Create mock chatbot server
- Add unit tests (8/10 passing)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
git log --oneline -1  # Verify commit
git push              # Push to remote
```

---

## Docker Container Management

**AGENTS HAVE FULL AUTONOMY TO MANAGE DOCKER CONTAINERS AS NEEDED.**

Docker is running and agents MUST use it for testing and development. Agents have full permissions to start, stop, restart, and rebuild containers without asking for user approval.

### Container Management Commands

Agents MUST use these commands to manage the Docker environment:

1. **Start containers**: `task docker:up` or `docker-compose up -d`
2. **Stop containers**: `task docker:down` or `docker-compose down`
3. **Restart containers**: `task docker:restart` or `docker-compose restart`
4. **Rebuild containers**: `task docker:build` or `docker-compose build`
5. **View logs**: `docker-compose logs -f [service]` or `task docker:logs`
6. **Check status**: `docker-compose ps`
7. **Reset volumes**: `docker-compose down -v` (use with caution)

### When to Manage Containers

Agents MUST start containers:

- Before running integration tests that require PostgreSQL or Redis
- Before testing the complete end-to-end flow
- After making infrastructure changes (Dockerfile, docker-compose.yml)
- When database migrations need to be applied

Agents SHOULD restart containers:

- When services are not responding properly
- After significant code changes to workers or background jobs
- When debugging connection issues

Agents SHOULD rebuild containers:

- After modifying Dockerfile or docker-compose.yml
- When dependencies are updated in package.json
- When environment variables are changed

### Service Information

The Docker Compose stack includes:

- **PostgreSQL**: Port 5432 - Database for persistent data
- **Redis**: Port 6379 - Cache and job queue
- **Redis Commander**: Port 8081 - Redis UI for debugging

### Testing Requirements

Agents MUST ensure containers are running before:

- Running integration tests (`tests/integration/`)
- Executing E2E tests
- Running database migrations (`task db:migrate`)
- Testing the session executor worker
- Testing the /api/execute endpoint

Agents SHOULD verify container health:

```bash
docker-compose ps  # Check all containers are "Up"
task health:check  # Test application health endpoint
```

### Container Data Management

- Containers persist data in Docker volumes
- Database data survives container restarts
- To reset database completely: `docker-compose down -v && task docker:up && task db:migrate`
- Logs directory (`logs/sessions/`) is mounted as a bind volume

---

## Implementation Milestones

**CRITICAL: READ MILESTONES.md FOR COMPLETE IMPLEMENTATION PLAN**

The file [MILESTONES.md](MILESTONES.md) is the authoritative source for:

1. **All 6 Milestones**: Detailed tasks, deliverables, and verification criteria
2. **Progress Tracking**: Current status of each milestone
3. **Technical Requirements**: Specifications for each feature
4. **Success Criteria**: How to verify milestone completion
5. **Git Commit Requirements**: Reminders for each milestone

### When to Consult MILESTONES.md

Agents MUST read MILESTONES.md when:
- Starting work on a new milestone
- Unsure what needs to be built next
- Context has been compacted/summarized
- Verifying milestone completion criteria
- Planning work sequence

### Milestone Status Tracking

Current progress is maintained in MILESTONES.md:
- ✅ Milestone 1: Foundation - **COMPLETED** (commit: 3c69255)
- 🔄 Milestone 2: Core Features - **IN PROGRESS**
- 📋 Milestone 3-6: Pending

Always check the progress tracking table in MILESTONES.md for current status.

### Critical Files for Context Recovery

If context needs to be compacted, these files MUST be retained:
- **MILESTONES.md** - Complete implementation plan
- **AGENTS.md** - This file (behavior guidelines)
- **CLAUDE.md** - Agent instructions
- **README.md** - Current state documentation
- **prisma/schema.prisma** - Data models

---

## Documentation & External References

### Required Documentation Consultation

Agents MUST consult official documentation before implementing features:

1. **Next.js 16.1.4**
   - MUST verify App Router patterns against official docs
   - MUST check API route specifications
   - MUST validate middleware usage
   - Source: https://nextjs.org/docs

2. **Prisma ORM**
   - MUST verify schema syntax
   - MUST check migration commands
   - MUST validate client generation
   - Source: https://www.prisma.io/docs

3. **BullMQ**
   - MUST verify queue configuration
   - MUST check worker patterns
   - MUST validate job options
   - Source: https://docs.bullmq.io

4. **Protocol Specifications**
   - HTTP/REST: MUST follow HTTP/1.1 and HTTP/2 specs
   - WebSocket: MUST follow RFC 6455
   - gRPC: MUST follow gRPC protocol specification
   - SSE: MUST follow W3C Server-Sent Events spec

### Rules for Assumptions vs Verification

- Agents MUST NOT assume API behavior without testing
- Agents MUST verify dependency compatibility before installation
- Agents MUST test connector implementations against mock servers
- Agents MUST validate database schema changes with migrations

---

## Project Structure & Architecture

### Directory Layout (ENFORCED)

```
token-burn/
├── app/                      # Next.js App Router (MUST use for routes)
│   ├── (dashboard)/          # Route groups MUST use parentheses
│   ├── api/                  # API routes MUST go here
│   └── globals.css           # Global styles only
├── components/               # React components only
│   ├── ui/                   # shadcn/ui components
│   └── [feature]/            # Feature-specific components
├── lib/                      # Core library code
│   ├── connectors/           # Protocol implementations ONLY
│   ├── jobs/                 # Queue workers ONLY
│   ├── db/                   # Database client ONLY
│   ├── storage/              # File operations ONLY
│   └── utils/                # Shared utilities
├── prisma/                   # Database schema and migrations
├── tests/                    # All tests (unit, integration, e2e)
├── infra/                    # Infrastructure configs
└── docs/                     # Additional documentation
```

### Architectural Boundaries (ENFORCED)

1. **Separation of Concerns**
   - Connectors MUST NOT import from UI components
   - UI components MUST NOT import from job workers
   - Database logic MUST stay in `lib/db/`
   - File I/O MUST stay in `lib/storage/`

2. **Generated Code**
   - Prisma client is generated code - MUST NOT edit manually
   - Type definitions from Prisma MUST be used as source of truth
   - `.next/` directory MUST be treated as build artifact

---

## Integration Rules

### Connector Development

**MANDATORY REQUIREMENTS for all connector implementations:**

1. **Inheritance**
   - New connectors MUST extend `BaseConnector` abstract class
   - MUST implement ALL abstract methods
   - MUST NOT override protected helper methods unless necessary

2. **Registration**
   - Connectors MUST be registered in `ConnectorRegistry`
   - Registration MUST happen at module initialization
   - MUST include connector type enum

3. **Testing**
   - Each connector MUST have integration tests
   - Tests MUST use mock servers, not live endpoints
   - Tests MUST cover: connect, disconnect, sendMessage, healthCheck
   - Test coverage MUST be >= 80%

4. **Error Handling**
   - Connectors MUST throw `ConnectorError` for all errors
   - MUST include original error in `ConnectorError`
   - MUST NOT swallow errors silently

5. **Documentation**
   - Each connector MUST document protocol-specific quirks
   - MUST include example configuration
   - MUST document authentication methods supported

### Example: Adding a New Connector

```typescript
// lib/connectors/websocket.ts
import { BaseConnector, ConnectorConfig } from "./base";

export class WebSocketConnector extends BaseConnector {
  // Implementation...
}

// lib/connectors/registry.ts
import { WebSocketConnector } from "./websocket";

connectorRegistry.register("WEBSOCKET", WebSocketConnector);

// tests/integration/connectors/websocket.test.ts
describe("WebSocketConnector", () => {
  // Tests...
});
```

---

## Security Requirements

### Credential Handling (CRITICAL)

1. **Encryption at Rest**
   - Credentials MUST be encrypted using AES-256-GCM
   - Encryption key MUST be stored in environment variables
   - MUST use `lib/utils/crypto.ts` for all encryption/decryption
   - MUST NOT store plaintext credentials in database

2. **Logging and Exposure**
   - Credentials MUST NOT appear in logs
   - Auth headers MUST NOT be logged (even in development)
   - API responses MUST NOT include sensitive data
   - Error messages MUST NOT leak credential information

3. **Transmission**
   - Credentials MUST be transmitted over HTTPS only
   - WebSocket connections MUST use WSS (secure)
   - MUST validate SSL/TLS certificates

### Input Validation (REQUIRED)

1. **All User Inputs**
   - MUST validate with Zod schemas before processing
   - MUST sanitize strings for SQL injection (Prisma handles this)
   - MUST sanitize for XSS (React handles this)
   - MUST validate URL formats before making requests

2. **API Endpoints**
   - MUST validate request body against schema
   - MUST return 400 for invalid inputs
   - MUST include validation error details
   - MUST NOT process invalid data

### Example: Input Validation

```typescript
import { z } from "zod";

const TargetCreateSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string().url(),
  authType: z.enum(["NONE", "BEARER_TOKEN", "API_KEY"]),
  authConfig: z.record(z.string()),
});

// In API route
export async function POST(request: Request) {
  const body = await request.json();

  // MUST validate
  const validated = TargetCreateSchema.parse(body);

  // Now safe to use
  const target = await prisma.target.create({ data: validated });
  return NextResponse.json(target);
}
```

---

## Coding Conventions

### TypeScript (ENFORCED)

1. **Strict Mode**
   - TypeScript strict mode MUST be enabled
   - MUST NOT use `any` type (use `unknown` instead)
   - MUST define interfaces for all data structures
   - MUST use type inference where possible

2. **Naming Conventions**
   - Interfaces MUST use PascalCase
   - Functions MUST use camelCase
   - Constants MUST use SCREAMING_SNAKE_CASE
   - Files MUST use kebab-case

3. **Code Organization**
   - One component per file (except small helper components)
   - Component files MUST be <= 300 lines
   - Complex functions MUST be extracted and tested separately
   - MUST export types alongside implementations

### React & Next.js (ENFORCED)

1. **Component Structure**
   - Server Components by default
   - Use 'use client' directive ONLY when necessary
   - MUST define prop types explicitly
   - MUST use TypeScript, not PropTypes

2. **API Routes**
   - MUST use Next.js 16.1.4 App Router patterns
   - MUST type request/response
   - MUST handle errors with try-catch
   - MUST return appropriate status codes

### Database (ENFORCED)

1. **Migrations**
   - MUST create migration for all schema changes
   - MUST test migrations in development first
   - MUST NOT edit migrations after they're run in production
   - Migration names MUST be descriptive

2. **Queries**
   - MUST use Prisma client (never raw SQL)
   - MUST handle unique constraint violations
   - MUST use transactions for multi-step operations
   - MUST include error handling

---

## Dependency Management

### Package Installation Rules

1. **Before Adding Dependencies**
   - MUST check if functionality exists in current dependencies
   - MUST verify package is actively maintained (updated in last 6 months)
   - MUST check npm weekly downloads (prefer > 100k)
   - MUST audit package for security vulnerabilities

2. **Installation Process**
   ```bash
   # MUST use pnpm exclusively
   pnpm add <package>

   # For dev dependencies
   pnpm add -D <package>

   # MUST verify installation
   pnpm list <package>
   ```

3. **Version Pinning**
   - Major dependencies SHOULD use exact versions
   - Minor dependencies MAY use caret (^)
   - MUST document why major dependencies are pinned

4. **Dependency Audits**
   - MUST run `pnpm audit` before adding new packages
   - MUST NOT add packages with critical vulnerabilities
   - MUST document accepted vulnerabilities with justification

### Approved Major Dependencies

- `next@16.1.4` - Web framework
- `react@^19.0.0` - UI library
- `@prisma/client@^6.2.0` - Database ORM
- `bullmq@^5.34.0` - Job queue
- `ioredis@^5.4.2` - Redis client
- `zod@^3.24.1` - Validation
- `axios@^1.7.9` - HTTP client

New major dependencies MUST be approved and documented.

---

## Workflow & Planning

### Milestone-Based Development

1. **Milestone Structure**
   - Work MUST be organized into clear milestones
   - Each milestone MUST have defined deliverables
   - Milestones MUST be completed sequentially
   - **MUST commit after completing each milestone**

2. **Milestone Completion Criteria**
   - All deliverables implemented
   - Tests written and passing
   - Documentation updated
   - **Git commit created**
   - No critical bugs

3. **Documentation Updates**
   - Architecture changes MUST update docs/ARCHITECTURE.md
   - API changes MUST update docs/API.md
   - New features MUST update README.md
   - Breaking changes MUST update CHANGELOG.md

### Testing Requirements

1. **Test Coverage**
   - Critical paths MUST have >= 90% coverage
   - Connectors MUST have integration tests
   - API routes SHOULD have integration tests
   - UI components MAY have unit tests

2. **Test Organization**
   ```
   tests/
   ├── unit/              # Fast, isolated tests
   ├── integration/       # Tests with external dependencies
   ├── e2e/              # End-to-end user flows
   └── mocks/            # Mock servers and data
   ```

---

## Agent Expectations

### Expertise Level

Agents working in this codebase are expected to operate at a **staff-level software engineer** capacity:

1. **Autonomous Decision Making**
   - Make architectural decisions within established patterns
   - Choose appropriate libraries and tools
   - Resolve ambiguities using best practices
   - Identify and fix technical debt

2. **Code Quality**
   - Write production-ready code
   - Follow SOLID principles
   - Refactor duplicated code proactively
   - Optimize for readability and maintainability

3. **Problem Solving**
   - Debug issues systematically
   - Research solutions before asking
   - Consider edge cases and error scenarios
   - Think about scalability and performance

### Refactoring Responsibilities

Agents SHOULD refactor code when:
- Duplication is detected (DRY principle)
- Functions exceed 50 lines
- Cyclomatic complexity is high
- Code smells are present

Agents MUST:
- Write tests before refactoring
- Ensure tests pass after refactoring
- Document breaking changes
- **Commit refactorings separately from feature work**

### Reporting and Communication

When encountering issues:
1. Document the problem clearly
2. Research potential solutions
3. Implement the best solution
4. Update documentation
5. Report decision in commit message

For architectural concerns:
- Document the concern
- Propose alternatives
- Recommend approach with justification
- Implement after approval

---

## Explicit Out-of-Scope Actions

### MUST NOT Actions

Agents MUST NOT perform these actions without explicit approval:

1. **Database Operations**
   - MUST NOT modify Prisma schema without creating migration
   - MUST NOT run destructive migrations in production
   - MUST NOT delete data without backup verification

2. **Version Control**
   - MUST NOT push directly to main branch
   - MUST NOT force push to shared branches
   - MUST NOT rewrite public history
   - MUST NOT skip commit after milestone completion

3. **Deployment**
   - MUST NOT deploy to production without approval
   - MUST NOT modify production environment variables
   - MUST NOT restart production services

4. **Security**
   - MUST NOT commit secrets to git
   - MUST NOT disable security features
   - MUST NOT expose internal APIs publicly

5. **Dependencies**
   - MUST NOT add packages with known vulnerabilities
   - MUST NOT upgrade major versions without testing
   - MUST NOT remove dependencies without impact analysis

### Handoff Points Requiring Human Confirmation

These require human approval before proceeding:
- Major architectural changes
- Breaking API changes
- Database schema changes affecting existing data
- Third-party service integrations
- Production deployments
- Security-related modifications

---

## Development Workflow

### Standard Development Process

1. **Start Work**
   ```bash
   task docker:up      # Start infrastructure
   task db:generate    # Generate Prisma client
   task dev            # Start development server
   ```

2. **Make Changes**
   - Write code following conventions
   - Add/update tests
   - Verify with `task lint` and `task type-check`

3. **Test Changes**
   ```bash
   task test           # Run tests
   task build          # Verify build succeeds
   ```

4. **Commit Changes** (CRITICAL)
   ```bash
   git add .
   git commit -m "feat: <description>

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```

5. **Verify Commit**
   ```bash
   git log --oneline -1
   git status
   ```

### When to Commit

**MUST commit after:**
- Completing each milestone
- Implementing major features
- Fixing critical bugs
- Refactoring significant code

**SHOULD commit after:**
- Adding new components
- Updating documentation
- Completing test suites

**MAY commit after:**
- Small fixes
- Minor style changes

---

## Summary

This document establishes the rules and expectations for all work in the Token-Burn codebase. Compliance is **REQUIRED**, not optional.

Key requirements:
1. ✅ **Commit after every milestone** (CRITICAL)
2. ✅ Extend BaseConnector for new protocols
3. ✅ Register all connectors in ConnectorRegistry
4. ✅ Encrypt credentials at rest
5. ✅ Validate all inputs with Zod
6. ✅ Write tests for all critical paths
7. ✅ Use TypeScript strict mode
8. ✅ Follow established architecture
9. ✅ Document all changes
10. ✅ Consult official documentation

---

**Version**: 1.0.0
**Last Updated**: 2026-01-26
**Maintained By**: Token-Burn Development Team
