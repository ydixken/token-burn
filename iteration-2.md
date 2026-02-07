# Guided Configurator Redesign - Team Leader Brief

## Context

The current guide at `/guide` is underdesigned. It's a flat list of collapsible cards with hardcoded one-click buttons. Step 5 (Create Scenario) is **broken** - it sends `{ steps: [...] }` but the API expects `{ flowConfig: [...] }`. Beyond the bug, the entire UX needs to be reimagined as a proper **multi-step wizard** with inline forms, live previews, provider preset integration, and embedded real-time feedback - not a checklist that links to other pages.

**What's wrong today:**
- Broken: Step 5 sends wrong payload format (Zod validation rejects it)
- No inline forms - user can't customize target name, endpoint, or scenario content
- No provider preset integration (6 presets exist in `lib/connectors/presets.ts` but aren't surfaced)
- No template browser (12 scenario templates exist in `lib/scenarios/templates.ts` but aren't shown)
- Steps 4/7/8 just link to other pages - no inline test, no inline monitoring
- No visual previews of what's being created
- No validation feedback before submission
- No way to skip steps or branch based on user choices
- No connection to toast notification system
- Progress tracking is basic localStorage - doesn't track what was created (IDs)

---

## Team Structure

You have a team of 4 agents (including you as a team lead). Assign work spawning the agents. NEVER work on code yourself. Your role is to delegate, coordinate, and review the agents. Use the following guidelines, there might be more owns needed but this is a starting point:

| Agent | Owns | Focus |
|-------|------|-------|
| **guide-ui** | `app/(dashboard)/guide/page.tsx`, `components/guide/**` (new) | Wizard framework, step components, all UI |
| **guide-api** | `app/api/guide/**` (new), `app/api/health/route.ts` | Dedicated guide API endpoints, health check enhancement |
| **test-eng** | `tests/integration/guide.test.ts` | End-to-end guide flow testing |

---

## Architecture Decision: Wizard Component System

Replace the single 620-line `guide/page.tsx` with a multi-file component system:

```
app/(dashboard)/guide/
  page.tsx                    - Wizard container, step routing, progress state
components/guide/
  wizard-shell.tsx            - Layout: sidebar progress rail + main content area
  wizard-context.tsx          - React context: created IDs, progress, navigation
  steps/
    step-welcome.tsx          - Step 1: Welcome + prerequisites check
    step-infrastructure.tsx   - Step 2: Docker status check
    step-target.tsx           - Step 3: Target creation wizard (multi-sub-step)
    step-test-connection.tsx  - Step 4: Inline connection test
    step-scenario.tsx         - Step 5: Scenario creation from templates
    step-execute.tsx          - Step 6: Execute with live mini-viewer
    step-results.tsx          - Step 7: Inline results dashboard
    step-next.tsx             - Step 8: Advanced features tour
  shared/
    provider-card.tsx         - Provider preset selection card
    template-card.tsx         - Scenario template preview card
    mini-log-viewer.tsx       - Embedded live session log (subset of LogViewer)
    json-preview.tsx          - Read-only JSON preview of what will be created
    connection-tester.tsx     - Inline connection test with live status
    step-navigation.tsx       - Back/Next/Skip footer
```

---

## Milestone G1: Fix Critical Bug + Wizard Shell

**Gate**: Guide loads, scenario creation works, wizard frame renders.

### G1.1 - Fix Scenario Creation Bug (guide-api)

**File**: `app/(dashboard)/guide/page.tsx` (lines 269-311)

The guide sends:
```json
{ "steps": [{ "order": 1, "content": "...", "type": "PROMPT" }] }
```

The API (`app/api/scenarios/route.ts`) expects:
```json
{ "flowConfig": [{ "id": "step-1", "type": "message", "config": { "content": "..." } }] }
```

**Fix**: Change the guide's `onClick` handler to send the correct `flowConfig` format:
```json
{
  "name": "Quick Smoke Test",
  "description": "A basic scenario to verify the chatbot responds correctly",
  "category": "guide",
  "flowConfig": [
    { "id": "step-1", "type": "message", "config": { "content": "Hello! Can you introduce yourself?" } },
    { "id": "step-2", "type": "message", "config": { "content": "What is the capital of France?" } },
    { "id": "step-3", "type": "message", "config": { "content": "Thank you for your help!" } }
  ],
  "messageTemplates": {},
  "repetitions": 1,
  "concurrency": 1,
  "delayBetweenMs": 500
}
```

**test-eng verifies**: `POST /api/scenarios` with this payload returns `success: true`.

### G1.2 - Wizard Shell Component (guide-ui)

**Create**: `components/guide/wizard-shell.tsx`

Two-column layout:
- **Left rail** (200px, fixed): Vertical step list with numbered circles, titles, status indicators (pending/active/complete/skipped). Connected by a thin vertical line. Current step highlighted with blue. Completed steps show green check.
- **Right content** (flex-1): Active step content area with smooth fade transitions.
- **Bottom bar**: Back / Next / Skip buttons. "Next" is primary blue. "Skip" is ghost. "Back" is secondary. Disable "Next" until step requirements are met (e.g., target created). Show step count: "Step 3 of 8".

On mobile: rail collapses to a horizontal progress bar at top.

### G1.3 - Wizard Context Provider (guide-ui)

**Create**: `components/guide/wizard-context.tsx`

React context that tracks:
```typescript
interface WizardState {
  currentStep: number;
  completedSteps: Set<number>;
  skippedSteps: Set<number>;
  createdTargetId: string | null;
  createdScenarioId: string | null;
  createdSessionId: string | null;
  selectedPresetId: string | null;
  selectedTemplateId: string | null;
}
```

Persist to localStorage key `krawall-guide-v2` (new key, don't break old progress). Provide `goNext()`, `goBack()`, `goToStep(n)`, `markComplete(n)`, `skip(n)` methods.

### G1.4 - Rewrite Guide Page as Wizard Host (guide-ui)

**File**: `app/(dashboard)/guide/page.tsx`

Gut the entire current implementation. Replace with:
```tsx
<WizardProvider>
  <WizardShell steps={STEPS} />
</WizardProvider>
```

Where `STEPS` is an array of `{ id, title, description, icon, component, canSkip }`.

---

## Milestone G2: Target Creation Wizard (Step 3)

**Gate**: User can create a target through an inline multi-sub-step form with provider presets, custom endpoint, and live preview.

This is the most important step - it's where the user configures their first chatbot endpoint. It needs to feel like a first-class setup experience, not a hidden form behind a "Create Mock Target" button.

### G2.1 - Provider Preset Selection (guide-ui)

**Create**: `components/guide/steps/step-target.tsx`

**Sub-step 1: Choose a Provider**

Visual grid of provider cards (3 columns on desktop, 1 on mobile). Each card shows:
- Provider icon/logo mark (use colored text icon or first-letter avatar - no external images)
- Provider name (OpenAI, Anthropic, Google Gemini, Azure OpenAI, Ollama, Mock Chatbot)
- One-line description
- Connector type badge (`HTTP_REST`, `SSE`, etc.)
- Auth type indicator (API Key, Bearer Token, None)

Source data from `PROVIDER_PRESETS` in `lib/connectors/presets.ts`. Add **Mock Chatbot** as a special first card with a "Recommended for first-time setup" badge.

Clicking a provider card:
1. Pre-fills all form fields from the preset
2. Highlights the card with blue border
3. Enables "Next" to advance to sub-step 2
4. Stores `selectedPresetId` in wizard context

Also show a "Custom Endpoint" card at the bottom for advanced users who want to configure everything manually.

**Create**: `components/guide/shared/provider-card.tsx`

### G2.2 - Target Configuration Form (guide-ui)

**Sub-step 2: Configure Target**

Inline form that is **pre-filled** from the selected preset but fully editable:

**Fields:**
- **Name** (text input, required) - Pre-filled: "My OpenAI Bot" or "Mock Chatbot"
- **Description** (textarea, optional) - Pre-filled from preset description
- **Endpoint** (text input, required, URL validation) - Pre-filled from `preset.defaultEndpoint`. For Mock Chatbot: `http://localhost:3001/v1/chat/completions`
- **Connector Type** (select, disabled for presets) - Auto-set from preset
- **Auth Type** (select, disabled for presets) - Auto-set from preset
- **Auth Config** (dynamic fields based on auth type):
  - `NONE`: No fields shown
  - `BEARER_TOKEN`: API key password input
  - `API_KEY`: Key name + value inputs
  - `BASIC_AUTH`: Username + password inputs
  - `CUSTOM_HEADER`: Header name + value inputs

**Pre-filled from preset `authFields`** - show labels, placeholders, and required indicators.

**Request Template** section (collapsed by default, expandable for advanced users):
- Read-only JSON preview of the request structure
- "Customize" button to expand into editable JSON editor
- For Mock Chatbot, show the OpenAI-compatible format with explanation

**Response Template** section (collapsed by default):
- Content path (pre-filled from preset)
- Token usage path (pre-filled from preset)
- Error path (pre-filled from preset)

### G2.3 - Target Preview & Creation (guide-ui)

**Sub-step 3: Review & Create**

Full read-only preview of what will be created:
- JSON preview card showing the complete target payload (with auth masked as `***`)
- "This will create a target with the following configuration:" header
- Expandable sections: Connection, Authentication, Request Template, Response Template

**"Create Target" button:**
- Loading state with spinner
- On success: green success banner with target ID, auto-advance to step 4
- On failure: red error banner with detailed error message and "Try Again" button
- Store `createdTargetId` in wizard context

### G2.4 - Guide-Specific Target API (guide-api)

**Create**: `app/api/guide/create-target/route.ts`

Thin wrapper around the target creation that also:
- Returns the created target with full details (including connection test URL)
- Accepts an optional `runTestAfterCreate: boolean` flag
- If `runTestAfterCreate` is true, runs a quick health check and returns the result inline
- This prevents the user from needing to manually navigate to test

---

## Milestone G3: Inline Connection Test (Step 4)

**Gate**: Connection test runs inline in the guide with live status updates.

### G3.1 - Inline Connection Tester (guide-ui)

**Create**: `components/guide/shared/connection-tester.tsx`

NOT a link to `/targets` - the test runs right here in the guide:

**UI:**
- Large status circle in the center:
  - Gray (idle): "Ready to test"
  - Blue (testing): Spinning animation + "Testing connection..."
  - Green (success): Check icon + "Connection successful" + latency in ms
  - Red (failure): X icon + "Connection failed" + error message
- "Test Connection" primary button
- Target info summary: name, endpoint (truncated), connector type
- If test fails, show troubleshooting tips:
  - "Is the mock server running? Start it with `pnpm run mock-server`"
  - "Check that the endpoint URL is correct"
  - "Ensure Docker containers are running: `task docker:up`"
- "Re-test" button after failure
- "Skip" option for users who know their endpoint works

**API call**: `POST /api/targets/{createdTargetId}/test`

Read `createdTargetId` from wizard context. If null, show "You need to create a target first" with a "Go Back" button.

### G3.2 - Step 4: Test Connection Step (guide-ui)

**Create**: `components/guide/steps/step-test-connection.tsx`

Wraps the `connection-tester.tsx` component. Auto-runs the test on mount if `createdTargetId` exists. Shows a "What this tests" explainer section:
- Sends a health check request to your endpoint
- Verifies the response format matches your template
- Measures round-trip latency
- Does NOT count as a real test session

---

## Milestone G4: Scenario Template Browser (Step 5)

**Gate**: User can browse templates, preview them, customize, and create a scenario through the guide.

### G4.1 - Template Browser (guide-ui)

**Create**: `components/guide/steps/step-scenario.tsx`

**Sub-step 1: Choose a Template**

Visual template browser:
- Category tabs at top: All, Stress Test, Edge Case, Context, Performance, Attack Surface
- Grid of template cards (2 columns desktop, 1 mobile)
- Each card shows:
  - Template name
  - Category badge (colored: red for Attack Surface, blue for Stress Test, etc.)
  - Description (2-line truncated)
  - Quick stats: step count, loop count, estimated messages, repetition count
  - "Preview" button - expands to show flow steps inline
  - "Use This Template" button - selects it and moves to sub-step 2

**Create**: `components/guide/shared/template-card.tsx`

Include a **"Quick Start" template** at the top (recommended for first time), separate from the grid. This is a 3-message smoke test that's simple and fast.

Also include a **"Create from Scratch"** card at the bottom that opens a minimal flow builder (3 message inputs + an "Add Message" button).

Source data from `SCENARIO_TEMPLATES` in `lib/scenarios/templates.ts`.

### G4.2 - Template Preview & Customization (guide-ui)

**Sub-step 2: Customize Scenario**

After selecting a template:
- **Scenario name** (text input, pre-filled from template name)
- **Description** (textarea, pre-filled)
- **Flow preview**: Visual list of steps with icons:
  - `message` - Chat bubble icon + message content (editable text input)
  - `loop` - Loop icon + iteration count (editable number input) + nested steps
  - `delay` - Clock icon + duration
  - `conditional` - Branch icon + condition
- **Execution settings** (collapsed by default):
  - Repetitions (number input, pre-filled)
  - Concurrency (number input, pre-filled)
  - Delay between messages (number input, pre-filled)

Users can edit message content directly in the flow preview. This is NOT the full FlowBuilder drag-and-drop - it's a simplified inline editor.

### G4.3 - Scenario Review & Creation (guide-ui)

**Sub-step 3: Review & Create**

- Summary card: template name, step count, estimated messages
- JSON preview (collapsed by default)
- **"Create Scenario" button**
- On success: green banner + scenario ID, auto-advance
- Store `createdScenarioId` in wizard context

**CRITICAL**: Use the correct `flowConfig` format from the template. Map template data directly - the templates already use the correct `flowConfig` structure (verified in `lib/scenarios/templates.ts`). Just add proper `id` fields to each step if missing.

---

## Milestone G5: Execute & Watch Live (Steps 6-7)

**Gate**: User can execute a test and see results inline without leaving the guide.

### G5.1 - Execute Step (guide-ui)

**Create**: `components/guide/steps/step-execute.tsx`

Show a launch panel:
- **Target**: Name + endpoint (from wizard context, fetched by ID)
- **Scenario**: Name + step count (from wizard context, fetched by ID)
- **"Launch Test" button** (large, primary, with rocket icon)
- Execution explainer: "This will queue a session that sends each scenario step to your target. Messages are logged in real-time."

After clicking "Launch Test":
1. Call `POST /api/execute` with `{ targetId, scenarioId }`
2. Store `createdSessionId` in wizard context
3. Transition UI to the mini live viewer

### G5.2 - Mini Log Viewer (guide-ui)

**Create**: `components/guide/shared/mini-log-viewer.tsx`

An embedded, compact version of the full `LogViewer`:
- Fixed height (400px) with scrolling
- Shows messages as they arrive via SSE (`/api/sessions/{id}/stream`)
- Each message shows:
  - Direction arrow (sent / received)
  - Truncated content (first 200 chars, expandable)
  - Response time in ms
  - Token count if available
- Status bar at top: "Running... 3/5 messages sent" with progress bar
- When complete: "Session complete! 5 messages sent in 12.3s"
- "Open Full View" link to `/sessions/{createdSessionId}`

This replaces the old Step 7 ("Watch it Live") which just linked to `/sessions`.

### G5.3 - Results Step (guide-ui)

**Create**: `components/guide/steps/step-results.tsx`

Inline results dashboard (replaces old Step 8 "Analyze Results"):

- **Summary metrics cards** (4-column grid):
  - Total messages sent
  - Average response time (ms)
  - Total tokens consumed
  - Error rate (%)
- **Response time mini-chart** (small bar chart, 200px tall):
  - Per-message response times
  - P50/P95 lines overlaid
- **Message quality summary**:
  - Repetition score (average)
  - Success rate
- **What this means** explainer section:
  - Interpret the metrics for the user
  - "Your chatbot responded in an average of 450ms - this is within normal range"
  - "0 errors out of 5 messages - all requests succeeded"

Fetch data from `GET /api/sessions/{createdSessionId}` (which includes `summaryMetrics`).

If the session hasn't completed yet, poll every 2 seconds until it does.

---

## Milestone G6: Welcome, Infrastructure & Next Steps

**Gate**: All wizard steps are implemented with proper content.

### G6.1 - Welcome Step (guide-ui)

**Create**: `components/guide/steps/step-welcome.tsx`

More than just text - make it visually engaging:
- Hero section with Krawall logo and tagline
- 3 feature highlight cards in a row:
  - "Multi-Protocol Testing" - HTTP, WebSocket, gRPC, SSE
  - "Real-Time Monitoring" - Watch conversations as they happen
  - "Deep Analytics" - Token usage, response times, quality scores
- **Prerequisites checklist** (auto-detected where possible):
  - Node.js >= 20 - show as requirement
  - Docker running - show as requirement
  - pnpm installed - show as requirement
- Estimated time: "This guide takes about 5 minutes"
- "Let's Get Started" CTA button

### G6.2 - Infrastructure Step (guide-ui)

**Create**: `components/guide/steps/step-infrastructure.tsx`

More interactive than just "run this command":
- **Service status panel** (3 rows):
  - PostgreSQL - status dot + port 5432
  - Redis - status dot + port 6379
  - Mock Chatbot Server - status dot + port 3001
- **"Check Services" button** - calls `GET /api/health` and displays results
- If services are down: show the exact commands to run with copy-to-clipboard buttons:
  ```
  task docker:up          # Start PostgreSQL & Redis
  pnpm run mock-server    # Start mock chatbot (in separate terminal)
  ```
- If services are up: show green status and enable "Next"
- Auto-check on mount, re-check every 10 seconds

### G6.3 - Health Check API Enhancement (guide-api)

**File**: `app/api/health/route.ts`

Enhance the existing health check to return granular service status:
```json
{
  "success": true,
  "services": {
    "database": { "status": "connected", "latencyMs": 2 },
    "redis": { "status": "connected", "latencyMs": 1 },
    "mockServer": { "status": "unreachable" }
  }
}
```

Add a check for the mock server: try `GET http://localhost:3001/health` with a 2-second timeout. If it fails, report "unreachable" (not an error - it's optional).

### G6.4 - Next Steps & Advanced Features Tour (guide-ui)

**Create**: `components/guide/steps/step-next.tsx`

A feature discovery page, NOT just links:
- **"You've completed the guide!"** celebration banner with confetti animation (subtle, CSS-only)
- **What you built** summary:
  - Target: {name} at {endpoint}
  - Scenario: {name} with {step count} steps
  - Session: {id} - {message count} messages, {total tokens} tokens
- **Advanced features grid** (2 columns, interactive cards):
  - **Batch Testing** - Run the same scenario against multiple targets simultaneously
  - **A/B Comparison** - Compare two sessions side-by-side with statistical analysis
  - **Webhook Alerts** - Get notified when sessions complete or fail
  - **Scheduled Jobs** - Run scenarios on a cron schedule
  - **API Docs** - Full API reference for automation
  - **Plugin System** - Build custom connectors for your chatbot
- Each card: icon, title, 2-line description, "Explore" link
- **"Run another test"** button - resets wizard to step 3 (reuse target, pick new scenario)

---

## Milestone G7: Polish & Edge Cases

**Gate**: Guide works end-to-end, handles errors gracefully, is responsive.

### G7.1 - Error Handling (guide-ui)

Every API call in the guide needs:
- Loading spinner on the action button
- Success: Green banner with details + auto-advance after 1.5s
- Failure: Red banner with:
  - Human-readable error message
  - Specific troubleshooting steps (context-dependent)
  - "Try Again" button that resets the action state
  - "Skip This Step" option
- Network error: "Can't reach the server. Is the dev server running?"
- Validation error: Show field-level errors on the form
- Duplicate target name: "A target named 'Mock Chatbot' already exists. Use a different name or delete the existing one."

### G7.2 - Responsive Design (guide-ui)

- **Desktop** (>1024px): Two-column layout (sidebar rail + content)
- **Tablet** (768-1024px): Sidebar rail collapses to compact icons
- **Mobile** (<768px): Full-width content, horizontal step indicators at top, swipe navigation between steps

### G7.3 - Keyboard Navigation (guide-ui)

- `Enter` to advance / submit current step
- `Backspace` to go back
- `Tab` through form fields
- Number keys (1-8) to jump to step
- `Esc` to close expanded sections

### G7.4 - Resume & Recovery (guide-ui)

When user returns to the guide:
- Detect existing progress from localStorage
- If `createdTargetId` exists, verify it still exists via API. If deleted, reset step 3.
- If `createdScenarioId` exists, verify. If deleted, reset step 5.
- If session was created, show results if completed, or re-attach to stream if still running.
- Show a "Welcome back! You're on step {n}" banner with option to "Start Fresh"

### G7.5 - Animations & Transitions (guide-ui)

- Step transitions: slide-left (forward) / slide-right (back) with 200ms duration
- Content fade-in within steps (150ms)
- Progress rail: smooth animated fill as steps complete
- Button hover: subtle scale + glow
- Success/error banners: slide-down entry
- Skeleton loading states for async content (provider presets, templates, session data)

### G7.6 - Integration Tests (test-eng)

Write an integration test that simulates the full guide flow:
1. Open guide - verify wizard shell renders
2. Step 1: Welcome - click Next
3. Step 2: Infrastructure - verify health check called
4. Step 3: Select Mock Chatbot preset - verify form pre-fills - create target - verify API called with correct payload
5. Step 4: Test connection - verify test endpoint called with correct target ID
6. Step 5: Select Quick Start template - verify form pre-fills - create scenario - verify `flowConfig` format is correct
7. Step 6: Execute - verify execute API called - verify mini log viewer connects to SSE
8. Step 7: Results - verify metrics fetched
9. Step 8: Next Steps - verify links

---

## Files Summary

**New files (18):**
- `components/guide/wizard-shell.tsx`
- `components/guide/wizard-context.tsx`
- `components/guide/steps/step-welcome.tsx`
- `components/guide/steps/step-infrastructure.tsx`
- `components/guide/steps/step-target.tsx`
- `components/guide/steps/step-test-connection.tsx`
- `components/guide/steps/step-scenario.tsx`
- `components/guide/steps/step-execute.tsx`
- `components/guide/steps/step-results.tsx`
- `components/guide/steps/step-next.tsx`
- `components/guide/shared/provider-card.tsx`
- `components/guide/shared/template-card.tsx`
- `components/guide/shared/mini-log-viewer.tsx`
- `components/guide/shared/json-preview.tsx`
- `components/guide/shared/connection-tester.tsx`
- `components/guide/shared/step-navigation.tsx`
- `app/api/guide/create-target/route.ts`
- `tests/integration/guide.test.ts`

**Modified files (2):**
- `app/(dashboard)/guide/page.tsx` - Complete rewrite
- `app/api/health/route.ts` - Add granular service status

**Read-only dependencies (do NOT modify):**
- `lib/connectors/presets.ts` - Import `PROVIDER_PRESETS`
- `lib/scenarios/templates.ts` - Import `SCENARIO_TEMPLATES`
- `app/api/targets/route.ts` - Target creation API
- `app/api/scenarios/route.ts` - Scenario creation API (correct `flowConfig` format)
- `app/api/execute/route.ts` - Session execution API
- `app/api/sessions/[id]/stream/route.ts` - SSE stream for live logs
- `components/ui/*.tsx` - Existing UI primitives (Button, Card, Toast, etc.)

---

## Execution Order

### Phase 1 (G1): Fix bug + scaffold - parallel
- **guide-api**: Fix scenario payload (G1.1)
- **guide-ui**: Wizard shell + context (G1.2, G1.3, G1.4)
- **test-eng**: Verify scenario fix after G1.1

### Phase 2 (G2 + G3): Target + test - after Phase 1
- **guide-ui**: Provider presets, target form, connection tester (G2.1-G2.3, G3.1-G3.2)
- **guide-api**: Guide target endpoint (G2.4), health check (G6.3) - parallel

### Phase 3 (G4): Scenarios - after Phase 2
- **guide-ui**: Template browser, customization, creation (G4.1-G4.3)

### Phase 4 (G5 + G6): Execute, results, bookends - after Phase 3
- **guide-ui**: Execute, mini log viewer, results, welcome, infrastructure, next steps

### Phase 5 (G7): Polish - after Phase 4
- **guide-ui**: Error handling, responsive, animations (G7.1-G7.5)
- **test-eng**: Full integration test (G7.6)

---

## Verification

After all milestones, the guide must:
1. Load at `/guide` with the wizard shell and 8 steps in the left rail
2. Step 1: Welcome with feature highlights and prerequisites
3. Step 2: Infrastructure status with live service checks
4. Step 3: 6+ provider presets in a grid - select Mock Chatbot - pre-fill form - create target - success banner with ID
5. Step 4: Auto-run connection test - green success with latency - troubleshooting if fails
6. Step 5: 12 scenario templates in categorized grid - select template - customize - create scenario - success
7. Step 6: Launch panel - click Launch - mini log viewer shows live messages - session completes
8. Step 7: Inline metrics: message count, avg response time, tokens, error rate, mini chart
9. Step 8: Celebration + feature discovery grid + "Run another test"
10. Progress persists across reloads via localStorage
11. Returning users see "Welcome back" with resume/restart
12. All API calls use correct payload formats (especially `flowConfig`)
13. Responsive on mobile
14. Error states show troubleshooting tips, not raw error messages
