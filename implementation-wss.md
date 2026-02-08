# Browser WebSocket Discovery for Krawall

## Context

Many production chatbots (Lidl, Intercom, Drift, Zendesk, etc.) don't expose public WebSocket APIs. Instead, the WSS connection is bootstrapped by a web page that generates dynamic session tokens, user IDs, and URL parameters at runtime. Krawall's existing `WebSocketConnector` requires the full WSS URL upfront, making it impossible to test these chatbots.

This feature adds a **Browser Discovery** layer: Playwright navigates to the chatbot page, clicks the chat widget, captures the resulting WebSocket connection (URL + auth), detects the protocol (Socket.IO, plain WS, etc.), and feeds everything into the existing `WebSocketConnector` for stress testing.

---

## Architecture Overview

```
Target (connectorType: BROWSER_WEBSOCKET)
    │
    ▼
BrowserWebSocketConnector extends BaseConnector
    │
    ├── BrowserDiscoveryService (orchestrates Playwright)
    │     ├── WidgetDetector (heuristic → fallback to configured selectors)
    │     ├── WebSocketCapture (page.on('websocket') + CDP for headers)
    │     ├── CredentialExtractor (cookies, localStorage, sessionStorage)
    │     └── ProtocolDetector (auto-detect Socket.IO, plain WS, etc.)
    │
    ├── DiscoveryResult → builds ConnectorConfig
    │
    └── Internal WebSocketConnector (reused for actual messaging)
```

**Key design decision**: This is a **new connector type**, not a plugin. It wraps the existing `WebSocketConnector` internally — the browser phase is a discovery/credential step, then all actual messaging is delegated to the battle-tested WS connector.

---

## Implementation Plan

### Phase 1: Core Discovery Infrastructure

#### 1.1 Add Playwright dependency
- `pnpm add playwright` (+ `pnpm exec playwright install chromium`)
- Add `BROWSER_HEADLESS=true` and `BROWSER_TIMEOUT=30000` to `.env.example`

#### 1.2 Types & interfaces
**New file**: `lib/connectors/browser/types.ts`

```typescript
interface BrowserWebSocketProtocolConfig {
  pageUrl: string;                        // Web page containing the chat widget
  widgetDetection: {
    strategy: 'heuristic' | 'selector' | 'steps';
    selector?: string;                    // CSS selector for 'selector' strategy
    steps?: InteractionStep[];            // Ordered steps for 'steps' strategy
    timeout?: number;                     // Widget detection timeout (default: 15000ms)
    hints?: WidgetHints;                  // Clues to guide heuristic detection
  };
  wsFilter?: {
    urlPattern?: string;                  // Regex to match the desired WSS URL
    index?: number;                       // If multiple WS connections, which one (default: 0)
  };
  browser?: {
    headless?: boolean;
    viewport?: { width: number; height: number };
    userAgent?: string;
    proxy?: { server: string; username?: string; password?: string };
  };
  session?: {
    maxAge?: number;                      // Re-discover after N ms (default: 300000)
    keepBrowserAlive?: boolean;           // Keep browser open for reuse
  };
  protocol?: {
    type?: 'auto' | 'socket.io' | 'raw'; // Auto-detect by default
    socketIo?: { version?: 3 | 4 };      // Socket.IO-specific config
  };
}

// Hints give clues to the heuristic engine without requiring exact CSS selectors.
// The engine builds dynamic selectors from these and tries them BEFORE the generic list.
interface WidgetHints {
  buttonText?: string[];                  // e.g. ["Jetzt Chatten", "Chat starten"]
  containsClass?: string[];              // Partial class matches, e.g. ["solvvy", "ada-embed"]
  containsId?: string[];                 // Partial ID matches, e.g. ["chat-container"]
  iframeSrc?: string[];                  // Partial iframe src matches, e.g. ["scon.schwarz"]
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'custom';
  elementType?: 'button' | 'div' | 'a' | 'iframe' | 'any';
  withinSelector?: string;               // Scope heuristic search to a container, e.g. "#footer"
  dataAttributes?: Record<string, string>; // e.g. { "data-widget": "chat" }
}

interface InteractionStep {
  action: 'click' | 'type' | 'wait' | 'waitForSelector' | 'evaluate';
  selector?: string;
  value?: string;
  timeout?: number;
  script?: string;
}

interface DiscoveryResult {
  wssUrl: string;
  cookies: Array<{ name: string; value: string; domain: string }>;
  headers: Record<string, string>;       // Upgrade request headers
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  capturedFrames: Array<{ direction: 'sent' | 'received'; data: string; timestamp: number }>;
  detectedProtocol: 'socket.io' | 'raw';
  socketIoConfig?: { sid: string; pingInterval: number; pingTimeout: number; version: number };
  discoveredAt: Date;
}
```

#### 1.3 WebSocket Capture
**New file**: `lib/connectors/browser/ws-capture.ts`

Uses Playwright's native `page.on('websocket')` to intercept all WS connections. Also attaches a CDP session to capture the WebSocket upgrade request headers (which Playwright's API doesn't expose).

Key behavior:
- Captures all WebSocket connections opened on the page
- Filters by `wsFilter.urlPattern` regex or takes the Nth connection
- Records initial frames (sent/received) for protocol detection
- Extracts upgrade request headers via `Network.webSocketWillSendHandshakeRequest` CDP event

#### 1.4 Widget Detector
**New file**: `lib/connectors/browser/widget-detector.ts`
**New file**: `lib/connectors/browser/selectors.ts` (curated heuristic selector list)

**Heuristic strategy** (tried in order):

**Phase A — Hint-derived selectors (tried first when hints provided):**
The engine dynamically builds selectors from user-supplied `WidgetHints`:
- `buttonText: ["Jetzt Chatten"]` → `button:has-text("Jetzt Chatten")`, `a:has-text("Jetzt Chatten")`, `div[role="button"]:has-text("Jetzt Chatten")`
- `containsClass: ["solvvy"]` → `[class*="solvvy"]`
- `containsId: ["chat-container"]` → `[id*="chat-container"]`
- `iframeSrc: ["scon.schwarz"]` → `iframe[src*="scon.schwarz"]`
- `dataAttributes: { "data-widget": "chat" }` → `[data-widget="chat"]`
- `position: "bottom-right"` + `elementType: "button"` → `button` elements filtered by computed position (bottom 20%, right 20% of viewport)
- `withinSelector: "#footer"` → all above selectors scoped to `#footer *`

This means for Lidl, a user could configure just `{ buttonText: ["Jetzt Chatten"] }` and the engine would find it immediately without knowing the exact DOM structure.

**Phase B — Generic heuristic selectors (fallback):**
1. Common chat widget iframes: `iframe[src*="intercom"]`, `iframe[src*="drift"]`, `iframe[src*="zendesk"]`, `iframe[src*="livechat"]`, `iframe[src*="tawk"]`, `iframe[src*="hubspot"]`, `iframe[src*="crisp"]`, `iframe[title*="chat" i]`
2. ARIA/data attributes: `[aria-label*="chat" i]`, `[data-testid*="chat"]`
3. Class/ID patterns: `[class*="chat-button"]`, `[class*="chat-widget"]`, `[class*="chat-launcher"]`, `[id*="chat-widget"]`, `[id*="chatbot"]`
4. Text-based: `button:has-text("Chat")`, `button:has-text("Jetzt chatten")`, `button:has-text("Start chat")`, `button:has-text("Live chat")`
5. Positional: floating bottom-right buttons (common chat widget position)

For each candidate (hint-derived first, then generic), the detector:
- Checks visibility
- Clicks it
- Waits up to `timeout` ms for a WebSocket connection to open
- If no WS opens, tries the next selector

**Selector strategy**: directly clicks the user-provided CSS selector.

**Steps strategy**: executes an ordered list of `InteractionStep` objects (for multi-step flows like click → fill name → click start).

Handles iframes (via `page.frameLocator()`) and Shadow DOM (via Playwright's `>>` piercing locator).

#### 1.5 Credential Extractor
**New file**: `lib/connectors/browser/credential-extractor.ts`

Extracts from the browser context after the chat widget opens:
- All cookies via `context.cookies()`
- `localStorage` via `page.evaluate()`
- `sessionStorage` via `page.evaluate()`

#### 1.6 Protocol Detector
**New file**: `lib/connectors/browser/protocol-detector.ts`

Auto-detects the WebSocket protocol from captured frames and URL patterns:

**Socket.IO detection signals**:
- URL contains `socket.io` or `EIO=` query param
- First received frame starts with `0{` (Socket.IO handshake: `0{"sid":"...","pingInterval":25000,"pingTimeout":20000}`)
- Subsequent frames use Engine.IO framing (`2` = ping, `3` = pong, `4` = message, `42` = Socket.IO event)

**Raw WS detection**: anything that doesn't match Socket.IO patterns.

Extracts Socket.IO config (sid, pingInterval, pingTimeout, EIO version) from the handshake frame when detected.

#### 1.7 Discovery Service (Orchestrator)
**New file**: `lib/connectors/browser/discovery-service.ts`

Orchestrates the full flow:
1. Launch Playwright Chromium (headless by default)
2. Attach `WebSocketCapture` to page
3. Navigate to `pageUrl`, wait for load
4. Run `WidgetDetector` to find and click the chat widget
5. `WebSocketCapture.waitForWebSocket()` — wait for a matching WS connection
6. Capture initial frames (wait ~2s for handshake to complete)
7. Run `ProtocolDetector` on captured frames/URL
8. Run `CredentialExtractor` to get cookies/storage
9. Return `DiscoveryResult`

---

### Phase 2: Connector & Socket.IO Support

#### 2.1 BrowserWebSocketConnector
**New file**: `lib/connectors/browser-websocket.ts`

Extends `BaseConnector`. On `connect()`:
1. Runs `BrowserDiscoveryService.discover()` to get `DiscoveryResult`
2. Builds a `ConnectorConfig` for the internal `WebSocketConnector`:
   - `endpoint` = `discoveryResult.wssUrl`
   - `authType` = `CUSTOM_HEADER`
   - `authConfig.headers` = `{ Cookie: <joined cookies>, ...discoveryResult.headers }`
3. If Socket.IO detected → wraps send/receive with Socket.IO framing
4. Creates internal `WebSocketConnector`, calls `connect()`
5. For Socket.IO: handles heartbeat (ping/pong) automatically

On `sendMessage()`:
- **Socket.IO mode**: wraps message as `42["message", <payload>]` (configurable event name), unwraps response frames by stripping the `42` prefix and parsing the JSON array
- **Raw mode**: delegates directly to internal `WebSocketConnector.sendMessage()`

On `disconnect()`:
- Disconnects internal WS connector
- Closes Playwright browser (unless `keepBrowserAlive`)

On `healthCheck()`:
- Delegates to internal connector
- If unhealthy + session expired → re-runs discovery

#### 2.2 Socket.IO Framing Layer
**New file**: `lib/connectors/browser/socketio-handler.ts`

Handles Engine.IO/Socket.IO protocol:
- **Heartbeat**: automatically responds to `2` (ping) with `3` (pong) — this is critical, chatbots disconnect if pings aren't answered
- **Message encoding**: `42["eventName", payload]` → user only deals with the payload
- **Message decoding**: strips `42` prefix, parses JSON array, extracts the data portion
- **Handshake**: parses the `0{...}` initial frame to extract `sid`, `pingInterval`, `pingTimeout`
- **Namespace support**: handles `40` (connect to namespace) and `44` (error) frames

---

### Phase 3: Integration with Existing System

#### 3.1 Prisma Schema Migration
**File**: `prisma/schema.prisma`

Add `BROWSER_WEBSOCKET` to `ConnectorType` enum:
```prisma
enum ConnectorType {
  HTTP_REST
  WEBSOCKET
  GRPC
  SSE
  BROWSER_WEBSOCKET  // ← new
}
```

Run: `pnpm prisma migrate dev --name add_browser_websocket_type`

#### 3.2 Connector Registry
**File**: `lib/connectors/registry.ts`

Add to `registerAll()`:
```typescript
const { BrowserWebSocketConnector } = await import("./browser-websocket");
if (!this.isRegistered("BROWSER_WEBSOCKET")) {
  this.register("BROWSER_WEBSOCKET", BrowserWebSocketConnector);
}
```

#### 3.3 Presets
**File**: `lib/connectors/presets.ts`

- Update `ProviderPreset.connectorType` type to include `"BROWSER_WEBSOCKET"`
- Add two new presets:
  1. **"Browser WebSocket (Auto-Detect)"** — generic preset with heuristic detection and auto protocol detection
  2. **"Browser WebSocket (Socket.IO)"** — preset optimized for Socket.IO chatbots with appropriate request/response templates

#### 3.4 Target API Validation
**File**: `app/api/targets/route.ts`

Update Zod schema to accept `"BROWSER_WEBSOCKET"` in `connectorType` enum.

#### 3.5 Redis Caching for Discovery Results
Reuse existing `lib/cache/redis.ts`. Cache `DiscoveryResult` at key `krawall:discovery:{targetId}` with configurable TTL (default 5 min). Avoids re-running the browser for repeated tests against the same target.

---

### Phase 4: Docker & Browser Setup

#### 4.1 App container (recommended approach)
Install Playwright's Chromium directly in the worker process. Add to the application Dockerfile:
```dockerfile
RUN npx playwright install chromium --with-deps
```

This is simpler than a separate browser service and avoids inter-container network latency.

#### 4.2 Environment variables
Add to `.env.example`:
```
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
```

---

### Phase 5: UI — Guide Pages, Target Configuration & Help

The Browser WebSocket connector needs full UI support matching the existing HTTP REST pattern. Users must be able to configure **all** detection settings — especially widget hints — through the UI.

#### 5.1 Target Configuration Form for Browser WebSocket
**Modified file**: `components/guide/steps/step-target.tsx`
**New file**: `components/targets/browser-websocket-config.tsx`

When `connectorType === "BROWSER_WEBSOCKET"`, the target config form shows:

**Section 1: Page URL** (replaces the normal "endpoint" field)
- Input for the chatbot web page URL (e.g. `https://kundenservice.lidl.de/SelfServiceDE/s/`)
- Help text: "The web page URL where the chat widget is embedded"

**Section 2: Widget Detection** (new section, collapsible)
- **Strategy picker**: Radio group — "Heuristic (recommended)" | "CSS Selector" | "Interaction Steps"
- **Hints panel** (shown when strategy = heuristic):
  - `buttonText` — tag input for button labels, e.g. `["Jetzt Chatten", "Chat starten"]`
  - `containsClass` — tag input for partial CSS class names
  - `containsId` — tag input for partial element IDs
  - `iframeSrc` — tag input for partial iframe src patterns
  - `position` — dropdown: bottom-right | bottom-left | bottom-center
  - `elementType` — dropdown: button | div | a | iframe | any
  - `withinSelector` — text input for scoping container
  - `dataAttributes` — key-value pair editor
  - Help text explaining each field with examples
- **Selector input** (shown when strategy = selector): single CSS selector text field
- **Steps editor** (shown when strategy = steps): ordered list of `InteractionStep` with add/remove/reorder, each step has action dropdown + selector/value fields

**Section 3: WebSocket Filter** (collapsible, optional)
- `urlPattern` — text input with regex help text
- `index` — number input (default: 0)
- Help text: "If the page opens multiple WebSocket connections, filter to the right one"

**Section 4: Protocol** (collapsible, optional)
- `type` — dropdown: Auto-Detect | Socket.IO | Raw WebSocket
- Socket.IO version — dropdown (shown when type = Socket.IO): v3 | v4
- Help text: "Auto-detect works for most chatbots. Force Socket.IO if detection fails."

**Section 5: Browser Settings** (collapsible, "Advanced")
- Headless toggle
- Viewport width/height
- Custom user agent
- Proxy server/username/password
- Session max age (ms)

#### 5.2 Guide Wizard — Browser WebSocket Help Pages
**Modified file**: `components/guide/steps/step-target.tsx`

When the user selects the "Browser WebSocket" preset in the guide wizard's "choose" substep:
- The "configure" substep shows the Browser WebSocket config form (from 5.1 above)
- Add **inline help panels** (like the existing request/response template help in the HTTP REST flow):

**Help Panel: "How Browser Discovery Works"**
- Step-by-step explanation with visual diagram: Browser opens page → clicks chat widget → captures WebSocket → extracts tokens → connects
- When to use heuristic vs selector vs steps
- Examples for common providers (Lidl, Intercom, Zendesk)

**Help Panel: "Widget Hints"**
- Explains each hint field with real examples
- "For Lidl, just set Button Text to 'Jetzt Chatten'"
- "For Intercom, the heuristic auto-detects the iframe"
- Visual showing how hints narrow down the search

**Help Panel: "WebSocket Filter"**
- When you need it (multiple WS connections on page)
- URL pattern examples: `socket.io`, `chat`, `ws/v1`

**Help Panel: "Protocol Detection"**
- What Socket.IO is and why it matters
- How auto-detection works
- When to force a specific protocol

#### 5.3 Provider Cards for Browser WebSocket
**Modified file**: `components/guide/shared/provider-card.tsx` (or step-target.tsx)

Add two new provider cards in the preset selection grid:
1. **"Browser WebSocket (Auto-Detect)"** — icon: `browser`, label: "For Embedded Chatbots", description: "Discovers WebSocket endpoints by automating browser interactions. Auto-detects protocol."
2. **"Browser WebSocket (Socket.IO)"** — icon: `browser`, label: "Socket.IO Chatbots", description: "Optimized for Socket.IO chatbots with built-in heartbeat and framing support."

#### 5.4 README Update
**Modified file**: `README.md`

Add to the Features section:
- **Browser WebSocket Discovery**: new bullet under "Execution Engine" or new subsection
  - Playwright-based browser automation discovers WebSocket endpoints from embedded chat widgets
  - Heuristic widget detection with configurable hints (button text, CSS classes, etc.)
  - Auto-detects Socket.IO protocol with built-in heartbeat and framing
  - Credential extraction (cookies, localStorage, session tokens)
  - Works with Lidl, Intercom, Drift, Zendesk, and custom chat widgets

Add to the Architecture section:
- New connector type: `BROWSER_WEBSOCKET`
- Browser discovery pipeline diagram

Add to the Tech Stack:
- Playwright (Browser Automation) in the protocols/tools row

---

### Phase 6: Testing

#### 6.1 Mock chat widget test fixture
**New file**: `tests/fixtures/mock-chat-widget.html`

A simple HTML page with:
- A "Start Chat" button
- JavaScript that opens a WebSocket connection when clicked
- A mock WS server (reuse existing `tests/mocks/chatbot-server.ts` pattern) that responds to messages

#### 6.2 Unit tests
- `tests/unit/connectors/browser/widget-detector.test.ts` — heuristic selector matching
- `tests/unit/connectors/browser/protocol-detector.test.ts` — Socket.IO vs raw WS detection
- `tests/unit/connectors/browser/socketio-handler.test.ts` — framing encode/decode, heartbeat
- `tests/unit/connectors/browser-websocket.test.ts` — connector lifecycle

#### 6.3 Integration test
- `tests/integration/browser-websocket.test.ts` — end-to-end: launch mock page + WS server → discovery → send messages → verify responses

---

## Files to Create/Modify

### New files (15):
| File | Purpose |
|------|---------|
| `lib/connectors/browser/types.ts` | All interfaces and types |
| `lib/connectors/browser/ws-capture.ts` | WebSocket interception via Playwright |
| `lib/connectors/browser/widget-detector.ts` | Heuristic + configured widget clicking |
| `lib/connectors/browser/selectors.ts` | Curated heuristic selector list + hint builder |
| `lib/connectors/browser/credential-extractor.ts` | Cookie/storage extraction |
| `lib/connectors/browser/protocol-detector.ts` | Auto-detect Socket.IO vs raw WS |
| `lib/connectors/browser/socketio-handler.ts` | Socket.IO framing + heartbeat |
| `lib/connectors/browser/discovery-service.ts` | Orchestrator |
| `lib/connectors/browser-websocket.ts` | The connector (extends BaseConnector) |
| `components/targets/browser-websocket-config.tsx` | Target config form for Browser WS (hints, detection, filter, protocol, browser settings) |
| `tests/fixtures/mock-chat-widget.html` | Test fixture HTML page |
| `tests/fixtures/mock-chat-widget-socketio.html` | Socket.IO variant test fixture |
| `tests/unit/connectors/browser/` (multiple) | Unit tests for all browser/ modules |
| `tests/integration/browser-websocket.test.ts` | End-to-end integration test |
| `implementation-wss.md` | This plan file |

### Modified files (8):
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `BROWSER_WEBSOCKET` to `ConnectorType` enum |
| `lib/connectors/registry.ts` | Register `BrowserWebSocketConnector` in `registerAll()` |
| `lib/connectors/presets.ts` | Update type, add 2 new presets |
| `app/api/targets/route.ts` | Add `BROWSER_WEBSOCKET` to Zod validation |
| `.env.example` | Add `BROWSER_HEADLESS`, `BROWSER_TIMEOUT` |
| `components/guide/steps/step-target.tsx` | Add Browser WS preset cards, config form integration, help panels |
| `components/guide/shared/provider-card.tsx` | Support `browser` icon for new provider cards |
| `README.md` | Add Browser WebSocket Discovery to features, architecture, tech stack |

---

## Edge Cases & Known Limitations

1. **Anti-bot protection** (Cloudflare, reCAPTCHA): Known limitation. Document it. Mitigate with configurable `userAgent`, viewport, and proxy settings.
2. **Multiple WebSocket connections per page**: Handled by `wsFilter.urlPattern` and `wsFilter.index`.
3. **iFrame-based widgets**: Handled via `page.frameLocator()`.
4. **Shadow DOM widgets**: Handled via Playwright's `>>` piercing locator.
5. **Session token expiry**: `maxAge` config triggers re-discovery. On WS disconnect, check age and re-run browser if expired.
6. **Resource usage**: Each browser instance uses ~100-200MB RAM. For concurrent sessions, each needs its own browser. A semaphore-based `BrowserPool` limits concurrent browser instances (default: 3).
7. **Cookie-dependent WSS connections**: Build a `Cookie` header from extracted cookies and pass via `CUSTOM_HEADER` auth to the internal `WebSocketConnector`.

---

## Verification Plan

1. **Unit tests pass**: `pnpm test -- --filter browser`
2. **Integration test**: Mock chat widget page → discovery → message exchange
3. **Manual test against Lidl**: Navigate to `https://kundenservice.lidl.de/SelfServiceDE/s/`, verify:
   - Widget detected and clicked (using configurable hint: `buttonText: ["Jetzt Chatten"]`)
   - WSS URL captured (should contain `socket.io`, `userId`, `sessionId`, `urlToken`)
   - Socket.IO protocol auto-detected
   - Heartbeat maintained
   - Messages sent/received through Socket.IO framing
4. **Docker build**: Verify Playwright Chromium installs correctly in container
5. **Full flow**: Create target via UI → configure hints via UI form → execute session → verify logs show browser discovery + WS messaging

---

## Team Execution Plan

The team lead delegates to **7 specialist agents** working in parallel. Each agent writes implementation code AND comprehensive tests for their scope. Token usage is not a concern — agents should write extensively and thoroughly.

### Team Structure

```
team-lead (orchestrator)
    │
    ├── foundation-agent     → Types, selectors, credential extractor
    ├── capture-agent        → WebSocket capture (Playwright + CDP)
    ├── detector-agent       → Widget detector with hints system
    ├── protocol-agent       → Protocol detector + Socket.IO handler
    ├── connector-agent      → Discovery service + BrowserWebSocketConnector
    ├── ui-agent             → Guide help pages, target config form, provider cards, README
    └── integration-agent    → Schema, registry, presets, API, Docker, integration tests
```

### Agent Assignments

#### `foundation-agent` (general-purpose)
**Writes first** — other agents depend on these types.
| File | Description |
|------|-------------|
| `lib/connectors/browser/types.ts` | All interfaces: `BrowserWebSocketProtocolConfig`, `WidgetHints`, `InteractionStep`, `DiscoveryResult`, etc. |
| `lib/connectors/browser/selectors.ts` | Curated heuristic selector list (iframes, ARIA, class/ID, text, positional) + hint-to-selector builder functions |
| `lib/connectors/browser/credential-extractor.ts` | Cookie, localStorage, sessionStorage extraction from Playwright context |
| `tests/unit/connectors/browser/credential-extractor.test.ts` | Tests for credential extraction |
| `tests/unit/connectors/browser/selectors.test.ts` | Tests for hint-to-selector building and selector ordering |

**Context to provide**: Full `WidgetHints` interface spec, `DiscoveryResult` interface, link to `lib/connectors/base.ts` for `ConnectorConfig`/`AuthType` reference.

---

#### `capture-agent` (general-purpose)
**Depends on**: `types.ts` from foundation-agent.
| File | Description |
|------|-------------|
| `lib/connectors/browser/ws-capture.ts` | `WebSocketCapture` class — attaches to Playwright page, captures WS connections via `page.on('websocket')` + CDP for handshake headers, filtering by URL pattern/index, `waitForWebSocket()` with timeout |
| `tests/unit/connectors/browser/ws-capture.test.ts` | Thorough tests: multiple WS connections, URL filtering, frame recording, CDP header extraction, timeout behavior |

**Context to provide**: Playwright `page.on('websocket')` API, CDP `Network.webSocketCreated` / `Network.webSocketWillSendHandshakeRequest` events, the `WsFilter` and `CapturedWebSocket` types.

---

#### `detector-agent` (general-purpose)
**Depends on**: `types.ts` + `selectors.ts` from foundation-agent.
| File | Description |
|------|-------------|
| `lib/connectors/browser/widget-detector.ts` | `WidgetDetector` class — three strategies (heuristic with hints → generic selectors → configured selector → steps). Handles iframes via `page.frameLocator()`, Shadow DOM via `>>` piercing, visibility checks, click + wait-for-WS loop |
| `tests/unit/connectors/browser/widget-detector.test.ts` | Extensive tests: hint-derived selectors, fallback ordering, iframe detection, Shadow DOM piercing, multi-step interaction flows, timeout/no-match scenarios |
| `tests/fixtures/mock-chat-widget.html` | HTML test fixture with: a visible chat button, an iframe-based widget variant, a Shadow DOM variant, a multi-step form variant. Used by both unit and integration tests |
| `tests/fixtures/mock-chat-widget-socketio.html` | Socket.IO variant of the test fixture (uses EIO=3 URL pattern) |

**Context to provide**: Full `WidgetHints` spec, the heuristic strategy (Phase A hint-derived → Phase B generic), the `InteractionStep` interface, Playwright locator API, how `WebSocketCapture` signals a successful WS connection.

---

#### `protocol-agent` (general-purpose)
**Depends on**: `types.ts` from foundation-agent.
| File | Description |
|------|-------------|
| `lib/connectors/browser/protocol-detector.ts` | `ProtocolDetector` — analyzes captured WSS URL + initial frames to detect Socket.IO (EIO param, `0{` handshake, `42` framing) vs raw WS. Extracts `sid`, `pingInterval`, `pingTimeout`, EIO version from Socket.IO handshake |
| `lib/connectors/browser/socketio-handler.ts` | `SocketIOHandler` — full Engine.IO/Socket.IO framing: heartbeat (auto-respond `3` to `2` pings), message encode (`42["event", payload]`), message decode (strip prefix, parse array), handshake parsing, namespace connect (`40`), error frames (`44`) |
| `tests/unit/connectors/browser/protocol-detector.test.ts` | Tests: Socket.IO v3 detection, Socket.IO v4 detection, raw WS detection, edge cases (partial frames, binary frames, multiple protocols) |
| `tests/unit/connectors/browser/socketio-handler.test.ts` | Extensive tests: encode/decode round-trips, heartbeat timing, namespace support, error frame handling, real Lidl-style frame sequences |

**Context to provide**: Engine.IO packet types (`0`=open, `1`=close, `2`=ping, `3`=pong, `4`=message), Socket.IO packet types (`0`=connect, `1`=disconnect, `2`=event, `3`=ack, `4`=error), example Lidl WSS URL, example handshake frame `0{"sid":"...","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`.

---

#### `connector-agent` (general-purpose)
**Depends on**: ALL above agents (assembles their work).
| File | Description |
|------|-------------|
| `lib/connectors/browser/discovery-service.ts` | `BrowserDiscoveryService` — orchestrates: launch browser → attach WS capture → navigate → widget detect → wait for WS → detect protocol → extract credentials → return `DiscoveryResult`. Includes Redis caching via `lib/cache/redis.ts` |
| `lib/connectors/browser-websocket.ts` | `BrowserWebSocketConnector extends BaseConnector` — runs discovery, builds config, creates internal `WebSocketConnector`, delegates send/receive with Socket.IO framing wrap/unwrap, handles session expiry + re-discovery, auto-registers with `ConnectorRegistry` |
| `tests/unit/connectors/browser/discovery-service.test.ts` | Tests with mocked Playwright: full discovery flow, caching behavior, timeout handling, re-discovery on expiry |
| `tests/unit/connectors/browser-websocket.test.ts` | Tests: connect/disconnect lifecycle, Socket.IO mode vs raw mode, sendMessage delegation, healthCheck with re-discovery, session expiry |

**Context to provide**: Full `BaseConnector` interface from `lib/connectors/base.ts`, `WebSocketConnector` from `lib/connectors/websocket.ts` (constructor, connect, sendMessage), `ConnectorRegistry` pattern, `redis` client from `lib/cache/redis.ts`, how session-executor calls `ConnectorRegistry.create()`.

---

#### `ui-agent` (general-purpose)
**Depends on**: `types.ts` from foundation-agent (for interface shapes). Can run in **Phase 2** alongside capture-agent/detector-agent.
| File | Description |
|------|-------------|
| `components/targets/browser-websocket-config.tsx` | Full Browser WebSocket configuration form: page URL input, detection strategy picker (heuristic/selector/steps), **configurable hints panel** (buttonText tag input, containsClass, containsId, iframeSrc, position dropdown, elementType dropdown, withinSelector, dataAttributes key-value editor), WS filter config, protocol dropdown, browser settings (headless, viewport, user agent, proxy), session max age. All fields with help text and examples. |
| `components/guide/steps/step-target.tsx` (modify) | Add Browser WebSocket preset cards to the "choose" substep. When selected, show the BrowserWebSocketConfig form in the "configure" substep. Add inline help panels: "How Browser Discovery Works", "Widget Hints", "WebSocket Filter", "Protocol Detection" — each with real-world examples (Lidl, Intercom, Zendesk). |
| `components/guide/shared/provider-card.tsx` (modify) | Support `browser` icon type for the new preset cards |
| `README.md` (modify) | Add Browser WebSocket Discovery to: Features section (new subsection with bullet points), Architecture section (new connector type + pipeline diagram), Tech Stack (add Playwright) |

**Context to provide**: Current `step-target.tsx` substep pattern (choose → configure → review), current `provider-card.tsx` icon handling, the `WidgetHints` and `BrowserWebSocketProtocolConfig` interfaces from `types.ts`, existing help panel patterns from the HTTP REST guide flow, current `README.md` structure.

---

#### `integration-agent` (general-purpose)
**Depends on**: connector-agent (needs the connector to exist).
| File | Description |
|------|-------------|
| `prisma/schema.prisma` | Add `BROWSER_WEBSOCKET` to `ConnectorType` enum |
| `lib/connectors/registry.ts` | Add dynamic import + registration in `registerAll()` |
| `lib/connectors/presets.ts` | Update `ProviderPreset` type, add 2 new presets (Auto-Detect + Socket.IO) |
| `app/api/targets/route.ts` | Add `BROWSER_WEBSOCKET` to Zod validation schema |
| `.env.example` | Add `BROWSER_HEADLESS`, `BROWSER_TIMEOUT` |
| `tests/integration/browser-websocket.test.ts` | Full end-to-end integration test: spin up mock WS server + serve mock HTML page → create `BrowserWebSocketConnector` → discover → send messages → verify responses → test Socket.IO variant |

**Context to provide**: Current `prisma/schema.prisma` ConnectorType enum, current `registry.ts` `registerAll()`, current `presets.ts` structure and `ProviderPreset` interface, current `app/api/targets/route.ts` Zod schema.

---

### Execution Order & Dependencies

```
Phase 1 (parallel):
  foundation-agent  ──→ types.ts, selectors.ts, credential-extractor.ts
  protocol-agent    ──→ protocol-detector.ts, socketio-handler.ts (uses types inline initially)

  ► COMMIT after Phase 1: "feat: add browser websocket types, selectors, and protocol layer"

Phase 2 (parallel, after foundation-agent delivers types.ts):
  capture-agent     ──→ ws-capture.ts
  detector-agent    ──→ widget-detector.ts, mock fixtures
  ui-agent          ──→ browser-websocket-config.tsx, step-target.tsx, provider-card.tsx, README.md

  ► COMMIT after Phase 2: "feat: add ws capture, widget detector with hints, and UI config"

Phase 3 (after Phase 1 + 2 complete):
  connector-agent   ──→ discovery-service.ts, browser-websocket.ts

  ► COMMIT after Phase 3: "feat: add browser websocket connector and discovery service"

Phase 4 (after Phase 3 completes):
  integration-agent ──→ schema, registry, presets, API, integration tests

  ► COMMIT after Phase 4: "feat: integrate browser websocket — schema, registry, presets, tests"
```

### Team Lead Responsibilities
1. **Copy this plan to `implementation-wss.md`** at the repo root before starting
2. **Run `pnpm add playwright && pnpm exec playwright install chromium`** before any agent starts writing code
3. **Spawn foundation-agent + protocol-agent first** (Phase 1, in parallel)
4. **After Phase 1 completes**: `git add . && git commit && git push` — then spawn capture-agent + detector-agent + ui-agent (Phase 2, in parallel)
5. **After Phase 2 completes**: `git add . && git commit && git push` — then spawn connector-agent (Phase 3)
6. **After Phase 3 completes**: `git add . && git commit && git push` — then spawn integration-agent (Phase 4)
7. **After integration-agent completes**: run Prisma migration (`pnpm prisma migrate dev --name add_browser_websocket_type`)
8. **Run full test suite**: `pnpm test`
9. **Final commit and push**: `git add . && git commit && git push`
10. **Verify UI**: `pnpm dev` → navigate to guide → select Browser WebSocket preset → confirm all config fields (especially hints) are configurable and help panels render
