# Iteration 3 — Team Leader Brief

## Context

Three issues need resolution:

1. **Sessions stuck in PENDING/QUEUED**: The BullMQ worker code exists (`createSessionWorker()`, `createMetricsWorker()`) in `lib/jobs/workers/` but **nothing ever instantiates them**. After `POST /api/execute` queues a job, no worker picks it up — sessions stay QUEUED forever. Users see "Waiting for session to start..." indefinitely.

2. **No guide entry point on dashboard**: The Getting Started Guide wizard exists at `/guide` but is only discoverable via the sidebar nav link. New users landing on an empty dashboard see a basic "Getting Started" card (lines 816-861 in `app/(dashboard)/page.tsx`) that links to `/targets/new` and `/scenarios/new` — not the wizard.

3. **README is stale**: Lists 12 milestones but doesn't cover the new guided configurator wizard, provider presets, scenario template browser, inline connection testing, or the settings/API docs pages.

---

## Team Structure

| Agent | Owns | Focus |
|-------|------|-------|
| **worker-eng** | `instrumentation.ts`, `lib/jobs/`, `app/api/queue/`, Taskfile | Worker lifecycle, queue visibility API, diagnostics |
| **dashboard-ui** | `app/(dashboard)/page.tsx`, `app/(dashboard)/layout.tsx` | Guide CTA on dashboard, session status diagnostics |
| **docs-eng** | `README.md` | Full README rewrite with new features |

---

## Milestone W1: Fix Session Execution (Critical)

**Gate**: Sessions transition from QUEUED → RUNNING → COMPLETED when executed.

### W1.1 — Create Worker Startup via Next.js Instrumentation (worker-eng)

**Problem**: `createSessionWorker()` and `createMetricsWorker()` exist but are never called. Next.js has an `instrumentation.ts` hook that runs once on server startup — perfect for worker initialization.

**Create**: `instrumentation.ts` (project root)

```typescript
export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { createSessionWorker } = await import('@/lib/jobs/workers/session-executor');
    const { createMetricsWorker } = await import('@/lib/jobs/workers/metrics-aggregator');

    const sessionWorker = createSessionWorker();
    const metricsWorker = createMetricsWorker();

    console.log('Workers started: session-execution, metrics-aggregation');

    // Graceful shutdown
    const shutdown = async () => {
      await sessionWorker.close();
      await metricsWorker.close();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
```

**Modify**: `next.config.ts` — add `instrumentationHook: true` to experimental:

```typescript
experimental: {
  instrumentationHook: true,
  serverActions: { bodySizeLimit: "2mb" },
},
```

**Why instrumentation.ts**: This is the official Next.js mechanism. It runs once when the server starts, not per-request. Workers persist for the server lifetime. No separate process needed for development.

**Verification**:
1. Start dev server (`pnpm dev`)
2. Check console for "Workers started" message
3. Execute a test via dashboard Quick Execute or guide
4. Confirm session transitions: PENDING → QUEUED → RUNNING → COMPLETED

### W1.2 — Queue Status API (worker-eng)

**Create**: `app/api/queue/status/route.ts`

Expose BullMQ queue internals so the UI can show what's happening with pending sessions:

```json
{
  "success": true,
  "data": {
    "sessionQueue": {
      "waiting": 2,
      "active": 1,
      "completed": 45,
      "failed": 3,
      "workerRunning": true
    },
    "metricsQueue": {
      "waiting": 0,
      "active": 0,
      "completed": 42,
      "failed": 1,
      "workerRunning": true
    }
  }
}
```

Use existing `getSessionQueueStats()` and `getMetricsQueueStats()` from `lib/jobs/queue.ts`. Add a worker health check by checking if a worker is registered for the queue.

### W1.3 — Session Detail: Queue Position & Worker Diagnostics (dashboard-ui)

When a session is in PENDING or QUEUED state, the session detail page and the mini-log-viewer should show useful information instead of just "Waiting for session to start...":

**Modify**: `components/guide/shared/mini-log-viewer.tsx`

When SSE connects and gets `status: "PENDING"` or `status: "QUEUED"`:
- Show "Session queued — position {n} in queue" (fetch from `/api/queue/status`)
- If worker is not running: Show warning "Workers are not running. Session cannot be processed."
- If worker is running: Show "Worker is processing sessions. Your session will start shortly."
- Poll `/api/queue/status` every 3 seconds while waiting

**Modify**: `app/(dashboard)/sessions/[id]/page.tsx` (the full session detail page)

Add a banner at the top when session is QUEUED/PENDING:
- Show queue position
- Show worker status
- "If this persists, check that the dev server started with workers enabled."

### W1.4 — Add Worker Script to Taskfile (worker-eng)

**Modify**: `Taskfile.yml`

Add a `dev:full` task that clearly communicates that workers are included:

```yaml
  dev:full:
    desc: Start dev server with workers (recommended)
    cmds:
      - pnpm dev
    # Workers auto-start via instrumentation.ts

  worker:status:
    desc: Check queue and worker status
    cmds:
      - "curl -s http://localhost:3000/api/queue/status | python3 -m json.tool || echo 'Server not running'"
```

Also update the `setup` task to mention that workers start automatically.

---

## Milestone W2: Dashboard Guide CTA

**Gate**: New users see a prominent "Start Guided Setup" button on the dashboard that takes them to the wizard.

### W2.1 — Replace Getting Started Card with Guide CTA (dashboard-ui)

**Modify**: `app/(dashboard)/page.tsx` (lines 816-861)

Replace the current "Getting Started" card with a richer CTA that links to `/guide`:

```tsx
{!loading && stats.totalTargets === 0 && stats.totalScenarios === 0 && (
  <Card variant="bordered" className="mt-4 border-blue-900/40 bg-gradient-to-r from-blue-950/30 to-purple-950/20">
    <CardContent>
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-blue-900/30 p-3">
            <BookOpen className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-300 mb-1">New here? Start the Guided Setup</h3>
            <p className="text-xs text-gray-400 mb-0">
              Set up your first chatbot target, create a test scenario, and run your first test — all in about 5 minutes.
            </p>
          </div>
        </div>
        <Link href="/guide">
          <Button size="sm">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Start Guide
          </Button>
        </Link>
      </div>
    </CardContent>
  </Card>
)}
```

Also show a smaller persistent guide link when the user HAS targets but hasn't completed the guide (check localStorage `krawall-guide-v2`):

```tsx
{!loading && stats.totalTargets > 0 && !guideCompleted && (
  <div className="flex items-center justify-end">
    <Link href="/guide" className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors">
      <BookOpen className="h-3 w-3" />
      Continue Guided Setup
    </Link>
  </div>
)}
```

### W2.2 — Queue Diagnostics in Dashboard (dashboard-ui)

**Modify**: `app/(dashboard)/page.tsx`

Add queue status to the Live Sessions widget. When sessions are in QUEUED/PENDING, show:
- An info banner: "2 sessions queued — workers active" (or "workers not detected" in red)
- Fetch from `/api/queue/status` alongside dashboard stats

This gives users immediate visibility into WHY their sessions aren't progressing.

---

## Milestone W3: README Update

**Gate**: README accurately reflects all current features including the new wizard, provider presets, and template system.

### W3.1 — Full README Rewrite (docs-eng)

**Modify**: `README.md`

Sections to add/update:

**Features section** — add:
- Interactive Setup Wizard: 8-step guided configurator with inline forms, provider presets, and live testing
- Provider Presets: One-click setup for OpenAI, Anthropic, Google Gemini, Azure OpenAI, Ollama, and custom endpoints
- 12 Scenario Templates: Pre-built test scenarios across categories (Stress Test, Edge Case, Performance, Attack Surface, etc.)
- Inline Connection Testing: Verify endpoints directly in the setup wizard
- Settings & Configuration: Centralized settings management
- API Documentation: Built-in Swagger/OpenAPI explorer at `/api-docs`
- Mock Chatbot Server: Built-in OpenAI-compatible mock for testing without API keys

**Project Structure** — add new directories:
```
├── components/
│   ├── guide/              # Guided setup wizard
│   │   ├── steps/          # 8 wizard steps
│   │   └── shared/         # Reusable guide components
│   └── ui/                 # Design system (19 components)
├── lib/
│   ├── connectors/
│   │   └── presets.ts      # 8 provider presets
│   └── scenarios/
│       └── templates.ts    # 12 scenario templates
```

**Quick Start** — update to mention:
- After setup, visit `/guide` for the interactive guided setup
- Workers start automatically via `instrumentation.ts`

**Implementation Status** — add new milestones:
- Milestone 13: Design System & UI Components (19 reusable components, collapsible sidebar, command palette, toast system, keyboard shortcuts)
- Milestone 14: Guided Setup Wizard (8-step interactive wizard with provider presets, template browser, inline connection testing, live session monitoring)
- Milestone 15: Worker Lifecycle & Diagnostics (auto-start via instrumentation, queue status API, session diagnostics)

**Available Commands** — add:
```bash
task dev:full         # Start dev with workers
task worker:status    # Check queue health
```

**Architecture section** — add Provider Preset and Scenario Template subsections explaining the extensibility model.

---

## Execution Order

### Phase 1: Fix workers (W1.1 + W1.2) — worker-eng, parallel
- Create `instrumentation.ts`
- Update `next.config.ts`
- Create queue status API
- Test: start dev server → execute session → confirm COMPLETED

### Phase 2: UI integration (W1.3 + W2.1 + W2.2) — dashboard-ui, after Phase 1
- Add queue diagnostics to mini-log-viewer
- Add session detail queue banner
- Replace dashboard Getting Started card with guide CTA
- Add queue status to Live Sessions widget

### Phase 3: Taskfile + README (W1.4 + W3.1) — worker-eng + docs-eng, parallel with Phase 2
- Update Taskfile with new tasks
- Full README rewrite

---

## Files Summary

**New files (2):**
- `instrumentation.ts` — Next.js worker startup hook
- `app/api/queue/status/route.ts` — Queue diagnostics API

**Modified files (6):**
- `next.config.ts` — Enable instrumentationHook
- `components/guide/shared/mini-log-viewer.tsx` — Queue position when pending
- `app/(dashboard)/page.tsx` — Guide CTA card + queue diagnostics
- `app/(dashboard)/sessions/[id]/page.tsx` — Queue banner for pending sessions
- `Taskfile.yml` — New tasks: dev:full, worker:status
- `README.md` — Full rewrite with new features

**Read-only dependencies (do NOT modify):**
- `lib/jobs/queue.ts` — Import `getSessionQueueStats()`, `getMetricsQueueStats()`
- `lib/jobs/workers/session-executor.ts` — Import `createSessionWorker()`
- `lib/jobs/workers/metrics-aggregator.ts` — Import `createMetricsWorker()`

---

## Verification

After all milestones:
1. `pnpm dev` starts and console shows "Workers started: session-execution, metrics-aggregation"
2. `POST /api/execute` with valid target+scenario → session transitions PENDING→QUEUED→RUNNING→COMPLETED
3. `GET /api/queue/status` returns worker health and queue counts
4. Empty dashboard shows "Start Guided Setup" CTA linking to `/guide`
5. Dashboard with existing data shows "Continue Guided Setup" link if guide incomplete
6. Session stuck in QUEUED shows queue position and worker status (not just "Waiting...")
7. `task worker:status` returns queue health
8. README includes all new features, updated project structure, and new milestones

Also think about committing after each milestone with clear messages following the format in AGENTS.md. This helps track progress and ensures documentation is up to date.
