# Krawall: Major Feature & Polish Sprint — Team Leader Brief

## Context

Krawall is a fully working chatbot stress-testing platform (12 milestones complete, 70+ tests passing). The core engine works, but the GUI looks like a prototype, several routes are broken, and key features are missing. This sprint transforms Krawall from a working prototype into a polished, presentable product that looks like it went through years of iteration.

**The app works. Your job is to make it exceptional.**

---

## Team Structure

Spawn **7 engineers** plus yourself. Assign strict file ownership to prevent merge conflicts.

| Agent | Owns | Focus |
|-------|------|-------|
| **team-lead** (you) | Git, coordination, verification | Commits after each milestone, runs verification gates |
| **ui-lead** | `app/globals.css`, `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `tailwind.config.ts`, `components/ui/**` (new) | Design system, layout, sidebar, responsive framework |
| **ui-pages** | `app/(dashboard)/**/page.tsx`, `components/sessions/**`, `components/targets/**`, `components/scenarios/**`, `components/jobs/**`, `components/batches/**`, `components/webhooks/**`, `components/compare/**` | Page redesigns, dashboard tiles, forms |
| **backend-api** | `app/api/**` | Route fixes, new endpoints, Swagger/OpenAPI |
| **backend-infra** | `lib/**` (except `lib/connectors/plugins/`), `prisma/**` | Settings system, mock chatbot, connector fixes |
| **plugin-eng** | `lib/connectors/plugins/**`, `lib/connectors/base.ts`, `lib/connectors/registry.ts`, `lib/connectors/presets.ts` | Plugin framework, examples, connector improvements |
| **content-eng** | `docs/**`, `CUSTOM_ENDPOINTS_DEVELOPMENT.md`, scenario templates in `lib/scenarios/**` | Documentation, in-app guide content, scenario examples |
| **test-eng** | `tests/**`, `tests/mocks/**` | Integration tests, route verification, cross-team testing |

**CRITICAL RULE**: After EVERY backend task, **test-eng** MUST hit the endpoint with curl/fetch and verify the response. After EVERY frontend task, **test-eng** MUST load the page and check for console errors. This is non-negotiable.

---

## Files to Read First

Every agent MUST read before starting:

1. `AGENTS.md` — development rules (RFC 2119)
2. `CLAUDE.md` — agent instructions
3. `prisma/schema.prisma` — data model
4. `app/(dashboard)/layout.tsx` — current sidebar/layout
5. `app/globals.css` — current styles
6. `tailwind.config.ts` — theme config

Additionally:

- **plugin-eng**: `lib/connectors/base.ts`, `lib/connectors/plugins/types.ts`, `lib/connectors/plugins/loader.ts`, `lib/connectors/plugins/openai-plugin.ts`, `lib/connectors/plugins/multi-step-auth-plugin.ts`
- **backend-api**: All files in `app/api/` — read every route handler
- **test-eng**: `tests/mocks/chatbot-server.ts`, all existing tests in `tests/`

---

## Milestone 1: Critical Bug Fixes

**Gate**: All routes return correct responses, no false positives.

### 1.1 — Fix Test Connection Bug (backend-api)

**File**: `app/api/targets/[id]/test/route.ts`

**The bug**: Line 138 hardcodes `success: true` regardless of whether the connection actually worked. For `https://chat.invalidddddomain.com`, the healthCheck correctly sets `healthy: false` and captures the ENOTFOUND error, but the API response still says `success: true`.

**Fix**:

- Change line 138: `success: true` → `success: healthResult?.healthy ?? false`
- If `testError` is set, `success` must be `false`
- Ensure `data.error` is populated with a human-readable message
- Also fix `healthCheck()` in `lib/connectors/http.ts`: `validateStatus: () => true` accepts ANY status. Change to only accept 2xx as healthy: `healthy: response.status >= 200 && response.status < 300`

**test-eng verifies**:

- `POST /api/targets/{id}/test` with valid mock server → `success: true`
- `POST /api/targets/{id}/test` with `https://chat.invalidddddomain.com` → `success: false, data.error` contains DNS error
- `POST /api/targets/{id}/test` with `https://httpstat.us/500` → `success: false`

### 1.2 — Fix Missing Target Detail Page (ui-pages)

**Problem**: `/targets/{id}` returns 404. The targets list "View" button links here but no page exists.

**Create**: `app/(dashboard)/targets/[id]/page.tsx`

Content:

- Target name, description, status badge
- Connection details (endpoint, connector type, auth type)
- Request/response template display (read-only JSON view)
- Last test result (success/failure, timestamp, latency)
- "Test Connection" button
- "Edit" and "Delete" action buttons
- Link to sessions filtered by this target
- Link to scenarios using this target

**backend-api verifies**: `GET /api/targets/{id}` returns full target data with masked credentials

### 1.3 — Audit All Frontend Routes (test-eng)

Navigate to EVERY page in the app and verify:

- `/` — loads without errors
- `/targets` — loads, all action buttons work
- `/targets/new` — wizard loads and completes
- `/targets/{id}` — NEW page from 1.2 loads
- `/targets/{id}/edit` — loads with pre-filled data
- `/scenarios` — loads, YAML import/export works
- `/scenarios/new` — flow builder loads
- `/scenarios/{id}/edit` — loads with existing scenario
- `/sessions` — loads, filters work
- `/sessions/{id}` — loads with LogViewer
- `/batches` — loads
- `/batches/{id}` — loads
- `/compare` — loads
- `/metrics` — charts render
- `/settings/webhooks` — loads

Report: which pages work, which are broken, which have console errors. Create a checklist for team-lead.

### 1.4 — Audit All API Routes (test-eng)

Hit every API endpoint with curl and verify responses:

- All GET endpoints return `{ success: true, data: ... }` or `{ success: false, error: ... }`
- All POST endpoints accept valid payloads
- All error cases return appropriate HTTP status codes
- No 500 errors on valid requests

Create a test script that exercises every route.

---

## Milestone 2: Design System & Layout Overhaul

**Goal**: Transform the crude prototype into a sleek, engineer-focused product. Think Vercel dashboard meets Datadog meets Linear — dark, dense, information-rich, with subtle animations and thoughtful spacing.

**Gate**: The app looks like a commercial product, not a weekend project.

### 2.1 — Design System Foundation (ui-lead)

**Create**: `components/ui/` directory with reusable primitives. These are the building blocks for all pages.

**Files to create**:

- `components/ui/sidebar.tsx` — Collapsible sidebar component
- `components/ui/button.tsx` — Button variants (primary, secondary, ghost, danger, icon)
- `components/ui/card.tsx` — Card variants (default, bordered, interactive, stat)
- `components/ui/badge.tsx` — Status badges, tags, labels
- `components/ui/input.tsx` — Text input, textarea, select
- `components/ui/modal.tsx` — Modal/dialog component
- `components/ui/tabs.tsx` — Tab component
- `components/ui/tooltip.tsx` — Hover tooltip
- `components/ui/dropdown.tsx` — Dropdown menu
- `components/ui/breadcrumb.tsx` — Breadcrumb navigation
- `components/ui/empty-state.tsx` — Empty state with icon and CTA
- `components/ui/data-table.tsx` — Sortable, filterable table
- `components/ui/json-viewer.tsx` — Syntax-highlighted JSON display
- `components/ui/status-indicator.tsx` — Animated dot indicators (live, idle, error)
- `components/ui/metric-card.tsx` — Compact metric display with trend arrow
- `components/ui/code-block.tsx` — Code display with copy button

**Design tokens** (update `tailwind.config.ts` and `app/globals.css`):

Color palette — dark, high-contrast, engineer-focused:

- Background layers: `gray-950` (deepest), `gray-900` (cards), `gray-800` (elevated), `gray-750` (hover)
- Borders: `gray-800` (default), `gray-700` (emphasized)
- Text: `gray-50` (primary), `gray-400` (secondary), `gray-500` (muted)
- Accent: `blue-500` (primary action), `blue-400` (links)
- Status: `emerald-500` (success), `red-500` (error), `amber-500` (warning), `blue-500` (info/running)
- Subtle gradients for card backgrounds (not flat, but not gaudy)

Typography:

- Headings: `font-semibold`, not bold — cleaner
- Mono font for: IDs, endpoints, JSON paths, code, timestamps
- Small text: `text-xs` for metadata, `text-sm` for body

Spacing:

- Tighter than current — reduce padding from `p-6` to `p-4` on most cards
- Dense information display — engineers want data density, not whitespace
- Consistent `gap-3` between card elements, `gap-4` between sections

Animations:

- Subtle fade-in on page load (200ms, not 300ms — snappier)
- Micro-interactions on hover (border glow, slight scale)
- Smooth skeleton loading states (not blank → content jump)
- Live pulse on active indicators (subtle, not distracting)

### 2.2 — Sidebar Redesign (ui-lead)

**File**: `app/(dashboard)/layout.tsx`

Replace the current text-link sidebar with an icon-based navigation bar (like claude.ai, Linear, or Vercel):

**Collapsed state** (default, 56px wide):

- Icon-only navigation with tooltip on hover
- Krawall logo mark at top (small, monochrome)
- Icons for each section (use Lucide React icons — already common in Next.js projects):
  - `LayoutDashboard` → Dashboard
  - `Crosshair` → Targets
  - `FileText` → Scenarios
  - `Play` → Sessions
  - `Layers` → Batches
  - `GitCompare` → Compare
  - `BarChart3` → Metrics
  - `Settings` → Settings
  - `BookOpen` → Guide (NEW)
  - `Code2` → API Docs (NEW)
- Active state: icon highlighted with blue accent, subtle left border indicator
- Bottom section: collapse/expand toggle, external links (GitHub, docs)

**Expanded state** (240px, toggled by user):

- Icons + labels
- Section groupings with subtle dividers:
  - **Testing**: Dashboard, Targets, Scenarios
  - **Execution**: Sessions, Batches
  - **Analysis**: Compare, Metrics
  - **System**: Settings, Guide, API Docs
- Smooth expand/collapse animation (200ms)

**Header redesign**:

- Remove "Krawall Dashboard" and "Next.js 16.1.4 + TypeScript + Tailwind" — completely
- Add breadcrumb navigation showing current location: `Dashboard / Targets / My OpenAI Bot`
- Add a compact status bar: "3 sessions running" with live count (clicking goes to sessions)
- Add command palette trigger (`Cmd+K` or `Ctrl+K`) — even if the palette itself is a later feature

**Mobile responsive**:

- Sidebar becomes bottom tab bar on mobile
- Or: slide-out drawer triggered by hamburger icon
- Content takes full width

**Install dependency**: `pnpm add lucide-react`

### 2.3 — Global Page Template (ui-lead)

Create a consistent page wrapper that all pages use:

```tsx
// components/ui/page-header.tsx
<PageHeader
  title="Targets"
  description="Manage your chatbot endpoints"
  breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Targets" }]}
  actions={<Button>+ New Target</Button>}
/>
```

Every page should follow: `PageHeader → Content → (optional Footer)`. No page should set its own h1 styling — the PageHeader handles it.

### 2.4 — Install Lucide React (backend-infra)

Run: `pnpm add lucide-react`

Verify it doesn't break the build: `pnpm build` (or at least `pnpm run dev` starts clean).

---

## Milestone 3: Page Redesigns — Dashboard & Core Pages

**Gate**: Every page looks polished and professional, information density is high, interactions are smooth.

### 3.1 — Dashboard Redesign: Multi-Tiled Command Center (ui-pages)

**File**: `app/(dashboard)/page.tsx`

The dashboard should feel like a mission control center. Dense, real-time, actionable.

**Layout** (CSS Grid, responsive):

```text
┌──────────────┬──────────────┬──────────────┐
│  Live Sess.  │  Quick Stats │  Quick Exec  │
│  (tall tile) │  (4 metrics) │  (compact)   │
├──────────────┴──────────────┼──────────────┤
│  Active Conversations       │  Recent      │
│  (expandable list, each     │  Activity    │
│   shows live message feed)  │  Feed        │
├─────────────────────────────┼──────────────┤
│  Performance Overview       │  Scheduled   │
│  (sparkline charts)         │  Jobs        │
└─────────────────────────────┴──────────────┘
```

**Live Sessions tile**:

- Count badge with pulse animation
- Each running session: target name, scenario, elapsed time (live), message count
- "Watch Live" button → `/sessions/{id}`
- Mini-preview: last 2 messages from the conversation (fetched from SSE or stats API)
- Click to expand into a mini log viewer right on the dashboard

**Active Conversations drop-in**:

- List of RUNNING sessions with real-time data
- Clicking a session opens an inline mini-viewer (not a full page navigation)
- Shows the last 3-5 messages scrolling in real-time
- "Open Full View" link for the complete LogViewer
- This is the "drop into any conversation" feature — the user should be able to see what's happening in every active session from the dashboard without leaving the page

**Quick Stats**: Total targets, scenarios, sessions run, error rate — compact metric cards with sparkline trends

**Quick Execute**: Target + scenario dropdowns + Run button (already exists, keep it)

**Recent Activity Feed**: Last 10 events (session started, completed, failed, webhook fired) — like a terminal log feed with timestamps and color-coded entries

**Performance Overview**: Small sparkline charts for response time trend and error rate over last 24h (use Chart.js in small format)

**Scheduled Jobs**: Next 3 upcoming jobs with countdown timers

### 3.2 — Targets Page Redesign (ui-pages)

**File**: `app/(dashboard)/targets/page.tsx`

Switch from a grid of oversized cards to a **data table** layout:

- Sortable columns: Name, Type, Endpoint, Status, Last Test, Actions
- Endpoint shown in monospace, truncated with full-show on hover
- Status: green/red dot indicator based on `lastTestSuccess`
- Last test: relative time ("2h ago") with latency
- Actions column: Test / View / Edit / Delete as icon buttons
- Row click → goes to target detail page
- Search/filter bar at top
- Bulk actions: test all, delete selected

### 3.3 — Sessions Page Redesign (ui-pages)

**File**: `app/(dashboard)/sessions/page.tsx`

- **Running sessions** section at top — visually separated with blue accent border, pulse indicators, "Watch Live" buttons
- **Table view** for completed/queued sessions (not cards) — denser information
- Columns: Status, Target, Scenario, Started, Duration, Messages, Tokens, Errors, Actions
- Click a row → session detail
- Status filter tabs (keep existing but restyle as pill tabs)
- Real-time elapsed time for running sessions (updating every second)

### 3.4 — Scenarios Page Redesign (ui-pages)

**File**: `app/(dashboard)/scenarios/page.tsx`

- Table layout with: Name, Category, Target, Steps, Last Run, Actions
- Category shown as colored badge
- "Execute" button that opens a small inline dropdown to pick a target and run
- YAML import/export buttons in header

### 3.5 — Metrics Page Redesign (ui-pages)

**File**: `app/(dashboard)/metrics/page.tsx`

- More chart types: add a response time heatmap (hour x day grid)
- Comparison overlay: select 2 sessions and overlay their metrics
- Better chart sizing — current charts are too uniform
- Add token cost estimation panel (configurable $/token)

### 3.6 — Other Page Polish (ui-pages)

Apply the new design system to:

- `/compare` — cleaner comparison cards
- `/batches` — progress bars and table view
- `/settings/webhooks` — cleaner form layout
- All "new" and "edit" forms — consistent form component usage

---

## Milestone 4: Centralized Settings & In-App Guide

**Gate**: Settings page works, guide walks a new user through complete setup.

### 4.1 — Settings API (backend-api)

**Create**: `app/api/settings/route.ts`

Settings to support (stored in database or a JSON config):

- **General**: App name, default timeout, max concurrent sessions, log retention days
- **Appearance**: Theme preference (always dark for now, but prep for light), sidebar collapsed by default
- **Notifications**: Default webhook events, email notifications (prep the interface, doesn't need to send yet)
- **API**: Rate limit config, CORS origins
- **Defaults**: Default connector type, default auth type, default request/response templates

**Schema change** (backend-infra): Add a `Setting` model to Prisma:

```prisma
model Setting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  category  String   // "general", "appearance", "notifications", "api", "defaults"
  updatedAt DateTime @updatedAt
}
```

Run `pnpm prisma db push` after.

API:

- `GET /api/settings` — returns all settings grouped by category
- `PUT /api/settings` — accepts `{ key: string, value: any }` to update a setting
- `POST /api/settings/reset` — reset to defaults

### 4.2 — Settings Page (ui-pages)

**Create**: `app/(dashboard)/settings/page.tsx`

Tabbed settings interface:

- **General** tab: App configuration
- **Defaults** tab: Default templates, connector settings
- **Notifications** tab: Webhook defaults (link to webhook management)
- **API** tab: Rate limits, CORS

Each tab is a form with save/reset buttons. Use the new UI component library.

Move webhooks under the settings umbrella (update sidebar navigation).

### 4.3 — In-App Guide System (content-eng + ui-pages)

**Create**: `app/(dashboard)/guide/page.tsx`

An interactive, step-by-step guide that walks new users through the platform:

**Guide structure** (each step is a card with description, action button, and completion checkmark):

1. **Welcome to Krawall** — Overview of what the platform does
2. **Start Infrastructure** — How to run Docker containers (`task docker:up`)
3. **Create Your First Target** — Walk through target creation with the mock chatbot. Pre-fill: name="Mock Chatbot", endpoint=`http://localhost:3001`, type=HTTP_REST, no auth. Include a "Create This Target" one-click button.
4. **Test the Connection** — Click "Test Connection" on the newly created target. Explain what the test does.
5. **Create a Scenario** — Walk through creating a basic stress test scenario. Include a "Use Template" button that auto-creates from the Basic Stress Test template.
6. **Run Your First Test** — Execute the scenario against the target. Explain what happens (BullMQ job, JSONL logging, etc.)
7. **Watch it Live** — Navigate to the running session and watch the LogViewer
8. **Analyze Results** — Navigate to metrics after completion
9. **Next Steps** — Links to: create custom scenarios, add real chatbot targets, configure webhooks, explore the API

**content-eng writes**: The prose for each step (clear, concise, friendly but technical)

**ui-pages builds**: The interactive guide UI with progress tracking (localStorage for completion state)

### 4.4 — Mock Chatbot Quick-Start Documentation (content-eng)

**Create**: `docs/MOCK_CHATBOT.md`

Document how to use the mock chatbot for testing:

- How to start it: `pnpm run mock-server` (or however it starts)
- Available endpoints: `/v1/chat/completions`, `/chat`, `/error`, `/timeout`, `/slow`
- Response patterns: what triggers verbose/XML/repetitive responses
- How to configure: port, test mode
- Example curl commands for each endpoint
- How to use it as a target in Krawall (step-by-step with screenshots/code)

Also add a link to this doc from the in-app guide (Step 3).

---

## Milestone 5: Mock Chatbot Enhancement & Scenario Examples

**Gate**: Mock chatbot simulates realistic e-commerce/support scenarios, new scenario templates exist and work.

### 5.1 — Enhanced Mock Chatbot Server (backend-infra)

**File**: `tests/mocks/chatbot-server.ts`

The current mock has 5 response patterns. Expand it to simulate real-world chatbot personas:

**New personas** (selected via `X-Persona` header or `persona` field in request body):

1. **E-Commerce Assistant** (`ecommerce`)
   - Has a "product catalog" (hardcoded array of 20+ products with names, prices, specs, reviews)
   - Responds to "list products" with full catalog
   - Responds to "compare X and Y" with detailed comparison tables
   - Responds to "reviews for X" with fake reviews
   - Responds to "XML format" by wrapping everything in XML
   - Responds to "summarize our conversation" by echoing all previous messages

2. **Support Agent** (`support`)
   - Has a knowledge base (FAQ entries)
   - Escalates after 5 messages: "Let me transfer you to a specialist..."
   - Gets more verbose with each message
   - Returns structured responses with ticket numbers

3. **Code Assistant** (`code`)
   - Returns code blocks in responses
   - Generates increasingly long code examples
   - Responds to "explain" with verbose multi-paragraph explanations

4. **Rate-Limited Bot** (`rate-limited`)
   - Returns 429 after every 3rd request
   - Includes `Retry-After` header
   - Tests backoff handling

5. **Flaky Bot** (`flaky`)
   - Randomly: responds normally (60%), returns 500 (20%), hangs for 10s (10%), returns empty (10%)
   - Tests resilience and error handling

Each persona maintains conversation history and generates contextually appropriate responses.

### 5.2 — E-Commerce Attack Surface Scenario Templates (content-eng)

**File**: `lib/scenarios/templates.ts`

Add new scenario templates based on the user's e-commerce attack surface concept:

**Template: "E-Commerce Token Drain"**

```text
Step 1: "What product categories do you offer?"
Step 2: "List all available options in [category] with detailed specifications"
Step 3: "Can you format that in XML for my accessibility tool?"
Step 4: "Compare [product A] vs [product B] — pros, cons, structured table"
Step 5: "Include customer reviews and ratings for each"
Step 6: "Summarize everything we've discussed so far"
Loop: Repeat steps 2-6 with different categories (5 iterations)
```

**Template: "Support Escalation Flood"**

```text
Step 1: "I have a problem with my order #12345"
Step 2: "Can you look up the full order details?"
Step 3: "What's your return policy? List all conditions."
Step 4: "I need this escalated to a manager"
Step 5: "While I wait, can you also check order #12346?"
Step 6: "And #12347?"
Loop: Repeat with new order numbers (10 iterations)
```

**Template: "Context Window Stuffer"**

```text
Step 1: "Tell me about your company's mission, values, and history"
Step 2: "Now tell me about each of your products in detail"
Step 3: "What did you say about [topic from step 1]? Repeat it exactly."
Step 4: "Combine your answers from steps 1 and 2 into a single document"
Step 5: "Translate that document into formal academic English"
Step 6: "Now add citations for every claim"
Loop: "Expand section [N] with more detail" (8 iterations)
```

**Template: "Polite Persistent Requester"**

```text
Step 1: "Hi! I'm researching [topic]. Could you help me understand it?"
Step 2: "That's great! Could you elaborate on [aspect]?"
Step 3: "Very helpful! Could you provide specific examples?"
Step 4: "Could you present those examples in a table format?"
Step 5: "Perfect! Could you also add a column for [additional dimension]?"
Step 6: "One more thing — could you include references?"
Step 7: "Could you summarize everything in a 500-word essay?"
Loop: "Actually, could you revise the essay to include [new topic]?" (5 iterations)
```

### 5.3 — Update Mock Chatbot Tests (test-eng)

Write tests for the enhanced mock server:

- Test each persona responds correctly
- Test conversation history is maintained per-session
- Test rate limiting persona returns 429 correctly
- Test flaky persona has expected error distribution (within tolerance)

---

## Milestone 6: Swagger/OpenAPI Documentation

**Gate**: `/api-docs` page renders interactive Swagger UI, all endpoints documented.

### 6.1 — OpenAPI Spec Generation (backend-api)

**Create**: `lib/openapi/spec.ts`

Write the OpenAPI 3.0 specification for ALL endpoints:

Every endpoint must include:

- Path, method, summary, description
- Request body schema (with examples)
- Response schema (with examples for success AND error cases)
- Query parameters (with types, defaults, descriptions)
- Path parameters
- Authentication requirements (if any, for future use)
- Tags for grouping (Targets, Scenarios, Sessions, Execution, Metrics, Webhooks, Settings, Dashboard)

**Create**: `app/api/openapi/route.ts`

- `GET /api/openapi` — returns the OpenAPI spec as JSON

### 6.2 — Swagger UI Page (ui-pages)

**Create**: `app/(dashboard)/api-docs/page.tsx`

Options:

- Use `swagger-ui-react` package (install with `pnpm add swagger-ui-react @types/swagger-ui-react`)
- OR: Use `@scalar/nextjs-api-reference` for a more modern look
- Load spec from `/api/openapi`
- Dark theme to match the app
- Interactive "Try it out" functionality

Add to sidebar navigation under "System" section.

### 6.3 — Test the API Docs (test-eng)

- Verify every endpoint listed in the spec is reachable
- Verify request/response examples match actual API behavior
- Verify the Swagger UI renders without errors

---

## Milestone 7: Plugin Framework & Documentation

**Gate**: Plugin framework is solid, documented, and has working examples with tests.

### 7.1 — Unify Plugin Interface (plugin-eng)

**File**: `lib/connectors/plugins/types.ts`

The current interface is good but needs:

- **Error handling**: Wrap every hook in try/catch. A failing plugin must NOT crash the session. Add `onError(error, hookName, context)` optional hook.
- **Hook ordering**: Add `priority: number` field (lower runs first). Default 100. Auth plugins should run at priority 10 (before message modification).
- **Versioning**: Add `version: string` field. Add `minConnectorVersion?: string` for compatibility.
- **Plugin configuration schema**: Add `configSchema: PluginConfigField[]` that describes what config the plugin expects (for UI form generation):

  ```typescript
  interface PluginConfigField {
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "select" | "json";
    required: boolean;
    default?: unknown;
    description: string;
    options?: { label: string; value: string }[];  // for "select" type
  }
  ```

- **Standardized return types**: `beforeSend` MUST return `{ message: string, metadata: Record<string, unknown> }`. `afterReceive` MUST return `{ response: ConnectorResponse, metadata: Record<string, unknown> }`. No ambiguity.

### 7.2 — Enhanced Plugin Loader (plugin-eng)

**File**: `lib/connectors/plugins/loader.ts`

Add:

- `loadFromDirectory(path: string)` — scan a directory for plugins (for future user-provided plugins)
- `getPluginConfig(pluginId: string)` — return the config schema for UI rendering
- `validatePluginConfig(pluginId: string, config: unknown)` — validate config against schema
- Sort plugins by priority before executing hooks
- Error isolation: wrap each hook execution in try/catch, log errors, continue with next plugin

### 7.3 — Plugin API Endpoints (backend-api)

**Create**:

- `GET /api/plugins` — list all registered plugins with metadata
- `GET /api/plugins/[id]` — get plugin details including configSchema
- `GET /api/plugins/[id]/config-schema` — return the config schema for UI form generation
- `POST /api/plugins/[id]/validate-config` — validate a config object against the schema

### 7.4 — Additional Example Plugins (plugin-eng)

Create 2 more example plugins:

**Anthropic Plugin** (`lib/connectors/plugins/anthropic-plugin.ts`):

- Extends HTTP connector for Anthropic's Messages API
- Manages `messages[]` with proper `user`/`assistant` role alternation
- Handles the `content[0].text` response format
- Extracts token usage from `usage.input_tokens` / `usage.output_tokens`
- System prompt via Anthropic's `system` parameter
- Configurable: model, max_tokens, temperature

**Logging/Audit Plugin** (`lib/connectors/plugins/audit-plugin.ts`):

- Records every message sent and received to a separate audit log
- Timestamps, token counts, response times
- Useful for compliance and debugging
- Demonstrates a "passive" plugin that doesn't modify messages

### 7.5 — CUSTOM_ENDPOINTS_DEVELOPMENT.md (content-eng)

**Create**: `CUSTOM_ENDPOINTS_DEVELOPMENT.md` (root of project)

Comprehensive guide for developing custom connector plugins:

Sections:

1. **Overview** — What plugins are, why they exist, architecture diagram
2. **Quick Start** — Minimal plugin in 20 lines of code
3. **Plugin Interface Reference** — Every field and hook documented with types
4. **Lifecycle Hooks Deep Dive** — When each hook fires, what it receives, what to return
   - `initialize()` — Called once per session, set up state
   - `beforeSend()` — Modify outgoing messages, add context
   - `afterReceive()` — Transform responses, extract metadata
   - `onConnect()` — Auth handshakes, session initialization
   - `onDisconnect()` — Cleanup
   - `onError()` — Handle failures gracefully
5. **Plugin Context** — How to use `context.state` for per-session storage
6. **Configuration Schema** — How to define configSchema for UI forms
7. **Registration** — How to register with PluginLoader
8. **Testing Your Plugin** — How to write tests using the mock chatbot
9. **Examples Walkthrough** — Detailed explanation of each example plugin:
   - OpenAI plugin (conversation history)
   - Anthropic plugin (API differences)
   - Multi-Step Auth (token handshake)
   - Audit/Logging (passive observation)
10. **Common Patterns** — Rate limiting, retry logic, response caching, token budget management
11. **Publishing** — How to share your plugin (file structure, exports)
12. **Troubleshooting** — Common issues and solutions

### 7.6 — Plugin Tests (test-eng)

Write comprehensive tests:

- Test each plugin's hooks fire in correct order
- Test plugin priority ordering
- Test error isolation (one plugin failing doesn't crash others)
- Test config validation against schema
- Test `GET /api/plugins` returns correct metadata
- Test `POST /api/plugins/{id}/validate-config` with valid and invalid configs

---

## Milestone 8: Conversation Feature & Scenario Polish

**Gate**: E-commerce scenario runs end-to-end against enhanced mock server, demonstrating the full attack surface.

### 8.1 — Wire Persona Selection into Targets (backend-api + backend-infra)

Add `persona` to the Target model's `protocolConfig` JSON field. When the session executor sends messages, include the persona in the request body or as a header.

Update `lib/jobs/workers/session-executor.ts` to:

- Read `protocolConfig.persona` from the target
- Pass it as `persona` field in the request body OR `X-Persona` header

### 8.2 — Scenario Template UI Integration (ui-pages)

On the "Create Scenario" page, add a "Start from Template" section:

- Grid of template cards with name, description, category badge
- Click to pre-fill the flow builder
- Include the new e-commerce/support/context-stuffer templates
- "Customize" button to modify after selection

### 8.3 — End-to-End Demo Flow (test-eng)

Create an automated integration test that:

1. Starts the enhanced mock chatbot server with `ecommerce` persona
2. Creates a target pointing to the mock server
3. Tests the connection → verifies success
4. Creates the "E-Commerce Token Drain" scenario from template
5. Executes the scenario
6. Watches the SSE stream for messages
7. Verifies messages arrive in correct order
8. Waits for completion
9. Checks metrics: total tokens, response times, repetition scores
10. Exports results as CSV and verifies format

This is the **crown jewel test** — if this passes, the whole system works.

---

## Milestone 9: Final Polish & Feature Suggestions

### 9.1 — Register All Connectors (backend-infra)

**File**: `lib/connectors/registry.ts`

Uncomment and properly register ALL connectors:

- `HTTP_REST` → HTTPConnector (already done)
- `WEBSOCKET` → WebSocketConnector
- `GRPC` → gRPCConnector
- `SSE` → SSEConnector

Verify each can be instantiated without errors.

### 9.2 — Command Palette (ui-lead)

Add a `Cmd+K` / `Ctrl+K` command palette:

- Quick navigation to any page
- Quick actions: "Create Target", "Run Scenario", "View Metrics"
- Search targets, scenarios, sessions by name
- Recent items

This is a power-user feature that makes the app feel polished and professional.

### 9.3 — Keyboard Shortcuts (ui-lead)

- `G D` — Go to Dashboard
- `G T` — Go to Targets
- `G S` — Go to Sessions
- `G M` — Go to Metrics
- `N T` — New Target
- `N S` — New Scenario
- `?` — Show keyboard shortcut help
- `Esc` — Close modals/panels

### 9.4 — Loading States & Skeleton Screens (ui-pages)

Every page should have proper skeleton loading states (not "Loading..." text):

- Skeleton cards that match the actual layout
- Pulse animation on skeletons
- Smooth transition from skeleton → real content

### 9.5 — Toast Notifications (ui-lead)

Replace inline success/error messages with a toast notification system:

- Success: green toast, auto-dismiss after 3s
- Error: red toast, persists until dismissed
- Info: blue toast, auto-dismiss after 5s
- Position: bottom-right
- Stackable

---

## Suggested Additional Features

Present these to the user for consideration in future sprints:

1. **Cost Calculator** — Configure $/token per provider. Show estimated cost per session, per target, cumulative. "This test run cost approximately $0.47 in API credits."

2. **Response Fingerprinting** — Hash response patterns. Detect when a chatbot's behavior changes between test runs. Alert: "Target 'OpenAI GPT-4' response similarity dropped from 94% to 67% since last week."

3. **Token Budget Enforcement** — Set max token spend per session. Auto-stop execution when budget exceeded. Prevents runaway tests from burning API credits.

4. **Latency Heatmap** — Visual grid (hours x days) showing response time patterns. Identify peak hours, degradation trends.

5. **Chaos Engineering Mode** — Inject: random network delays (50-5000ms), connection drops, partial responses, malformed JSON. Test how chatbots handle adversarial network conditions.

6. **Diff Viewer for Responses** — Side-by-side diff of two responses (like GitHub diff). Highlight what changed between runs. Essential for regression testing.

7. **CLI Tool** — `npx krawall run --target=openai --scenario=stress-test`. Run scenarios from CI/CD pipelines without the GUI.

8. **Session Annotations** — Mark specific messages in a session as "interesting", "bug", "regression". Add notes. Filter sessions by annotations.

9. **Conversation Graph** — Visualize conversation flow as a directed graph. Show branching paths, loops, dead ends. Overlay metrics (response time per node, token cost per branch).

10. **Multi-Tenant Support** — Teams/organizations with separate targets, scenarios, and access controls. Share scenarios between teams.

11. **Scheduled Comparison Reports** — Auto-run the same scenario weekly, compare results, email a report showing trends. "Your chatbot's P95 response time increased 40% this week."

12. **Response Quality Regression Alerts** — Track quality scores over time. Alert when quality drops below threshold. Integration with Slack/Discord/email.

---

## Cross-Team Testing Protocol

**This is mandatory. Agents MUST test each other's work.**

### After every backend task

1. **test-eng** hits the endpoint with curl, verifies response shape and status codes
2. **test-eng** tests error cases (invalid ID, missing fields, bad data)
3. **ui-pages** or **ui-lead** verifies the frontend can consume the response

### After every frontend task

1. **test-eng** loads the page in browser, checks for console errors
2. **test-eng** tests responsive behavior (mobile widths)
3. **backend-api** checks server logs for the requests the frontend makes

### After every plugin task

1. **test-eng** runs unit tests against the plugin
2. **test-eng** runs integration test using mock chatbot server
3. **content-eng** verifies the plugin matches the documentation

### Verification gates (team-lead checks ALL before committing)

- **After Milestone 1**: `POST /api/targets/{id}/test` with invalid domain returns `success: false`. All pages load without 404.
- **After Milestone 2**: Sidebar is icon-based, responsive, looks professional. No "Next.js 16.1.4" anywhere.
- **After Milestone 3**: Dashboard shows multi-tile layout with live session drop-in. All pages redesigned.
- **After Milestone 4**: Settings page saves and loads. Guide walks through full setup with mock chatbot.
- **After Milestone 5**: Mock chatbot responds with e-commerce persona. New scenario templates work.
- **After Milestone 6**: Swagger UI renders at `/api-docs`, all endpoints documented.
- **After Milestone 7**: `GET /api/plugins` returns all plugins. CUSTOM_ENDPOINTS_DEVELOPMENT.md is comprehensive.
- **After Milestone 8**: E-commerce Token Drain scenario runs end-to-end against mock server.
- **After Milestone 9**: Command palette works, keyboard shortcuts work, loading states smooth.

---

## Git Workflow

- ONLY **team-lead** commits and pushes
- Commit after EACH milestone with:

  ```text
  feat: complete Milestone N - <description>

  - bullet points of changes

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```

- Push immediately after commit
- Verify push succeeded with `git log --oneline -1`
- **DO NOT batch milestones** — commit after each one

---

## Execution Order & Parallelism

### Milestone 1 (Critical Fixes)

- **backend-api**: Fix test connection bug (1.1) → immediately
- **ui-pages**: Create target detail page (1.2) → immediately
- **test-eng**: Audit all routes (1.3, 1.4) → immediately, in parallel
- All agents work simultaneously. Gate check when all 4 tasks done.

### Milestone 2 (Design System)

- **ui-lead**: Design system (2.1) → start immediately, this is the foundation
- **backend-infra**: Install lucide-react (2.4) → quick task, do first
- **ui-lead**: Sidebar (2.2) and page template (2.3) → after design system basics are done
- **Other agents**: Can work on Milestone 4-7 backend tasks in parallel while UI is being redesigned

### Milestone 3 (Page Redesigns)

- **ui-pages**: Dashboard (3.1) → depends on design system from M2
- **ui-pages**: Other pages (3.2-3.6) → can parallelize after dashboard is done
- **ui-lead**: Support ui-pages with component refinements

### Milestones 4-7 (Features)

- **backend-api + backend-infra**: Settings API (4.1), OpenAPI (6.1), Plugin API (7.3) — can all happen in parallel
- **content-eng**: Guide content (4.3), mock chatbot docs (4.4), scenarios (5.2), CUSTOM_ENDPOINTS_DEVELOPMENT.md (7.5) — mostly independent, can parallelize
- **plugin-eng**: Plugin framework (7.1-7.4) — independent track
- **test-eng**: Write tests as each feature is completed — never wait until end

### Milestones 8-9 (Polish)

- **Everyone**: Final integration and polish
- **test-eng**: Run the crown jewel end-to-end test
- **ui-lead + ui-pages**: Loading states, toasts, command palette
