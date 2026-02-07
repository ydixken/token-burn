# Mock Chatbot Server

The mock chatbot server (`tests/mocks/chatbot-server.ts`) simulates various chatbot behaviors for testing Krawall scenarios against realistic endpoints without requiring live API keys or third-party services.

## Starting the Server

### Standalone (CLI)

```bash
# Default port 3001
npx tsx tests/mocks/chatbot-server.ts

# Custom port
MOCK_PORT=4000 npx tsx tests/mocks/chatbot-server.ts
```

### Programmatic (Tests)

```typescript
import { MockChatbotServer } from "../tests/mocks/chatbot-server";

const server = new MockChatbotServer(3001, true); // port, testMode
await server.start();

// ... run tests ...

await server.stop();
```

When `testMode` is `true`:
- Response delays are minimized (10ms instead of random 100–2000ms)
- Random error simulation on the `default` persona is disabled
- Deterministic behavior for assertion-friendly test output

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns `{ status, requestsServed }` |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions endpoint |
| `POST` | `/chat` | Simple chat endpoint (lighter request/response format) |
| `POST` | `/error` | Always returns HTTP 500 |
| `POST` | `/timeout` | Never responds (simulates infinite hang) |
| `POST` | `/slow` | Responds after a 5-second delay |

### POST `/v1/chat/completions`

OpenAI-compatible format. This is the primary endpoint for Krawall testing.

**Request:**

```json
{
  "model": "mock-gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7,
  "maxTokens": 1024,
  "stream": false,
  "persona": "ecommerce"
}
```

**Response:**

```json
{
  "id": "chatcmpl-1706000000000",
  "object": "chat.completion",
  "created": 1706000000,
  "model": "mock-gpt-4",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 50,
    "total_tokens": 55
  }
}
```

### POST `/chat`

Simplified chat endpoint.

**Request:**

```json
{
  "message": "Hello!",
  "persona": "support"
}
```

**Response:**

```json
{
  "response": "...",
  "tokens": { "total": 42 },
  "timestamp": "2024-01-23T12:00:00.000Z"
}
```

## Personas

Personas control how the server generates responses. Select a persona via:

1. **`X-Persona` header** (preferred): `X-Persona: ecommerce`
2. **`persona` field in request body**: `{ "persona": "ecommerce", ... }`

If neither is set, the `default` persona is used. Values are case-insensitive.

### Session Tracking

Session state is tracked via the `X-Session-Id` header. Each unique session ID maintains its own message history and request counter. If no session ID is provided, a random one is auto-generated per request.

```
X-Session-Id: my-test-session-001
```

---

### `default`

General-purpose chatbot with keyword-triggered response styles.

| Keyword in message | Behavior |
|--------------------|----------|
| `xml` | Returns a full XML document with nested elements |
| `detail`, `elaborate`, `verbose`, `maximal` | Returns a long, multi-paragraph response (~250 words) |
| `repeat`, `clarif` | Returns a response that deliberately repeats itself |
| `reference`, `context` | Returns an academic-style response with fake citations |
| *(anything else)* | Short, randomized acknowledgment of the message |

In non-test mode, there is a 5% random chance of returning HTTP 429 (rate limit) on any request.

---

### `ecommerce`

E-commerce assistant with a 21-product catalog (laptops, tablets, monitors, peripherals, audio, accessories, etc.).

| Keyword in message | Behavior |
|--------------------|----------|
| `list products`, `show products`, `catalog` | Returns the full 21-item product catalog with IDs, prices, categories, and ratings |
| `compare` | Side-by-side markdown table comparing two products (specs, price, rating) |
| `review` | Customer reviews for specific products (UltraBook Pro 15, GameStation X, SoundPods Pro) |
| `xml` | First 5 products in XML format |
| `summarize conversation`, `summarize chat` | Recap of all user messages in the current session |
| *(anything else)* | Help menu listing available commands |

---

### `support`

Customer support agent with an FAQ knowledge base and automatic escalation.

| Condition | Behavior |
|-----------|----------|
| FAQ keyword match (`return`, `refund`, `shipping`, `warranty`, `payment`, `track`, `cancel`, `account`, `discount`, etc.) | Returns a JSON object with `ticket`, `status: "resolved"`, `faq_match`, and the FAQ answer. Verbosity increases after the 2nd message in a session. |
| 5+ messages in session | Auto-escalates: returns `status: "escalated"` with a ticket number, priority `"high"`, and a message about transferring to a human agent. |
| *(anything else)* | Returns a JSON object with `status: "open"`, an increasingly verbose response, and a `suggestions` array of FAQ questions. |

All support responses are JSON objects, making this persona ideal for testing JSON response extraction.

---

### `code`

Code assistant that generates progressively longer code samples.

| Keyword in message | Behavior |
|--------------------|----------|
| `explain` | Multi-paragraph explanation of software design principles. Length increases with each message in the session (2–6 paragraphs). |
| `typescript` / `ts` | TypeScript code block with a multi-step pipeline. Functions grow in count per session message (1–5 functions). |
| `python` / `py` | Python code block with the same growing pipeline pattern. |
| *(anything else)* | JavaScript code block (default language). |

This persona is useful for testing token-heavy responses that grow over a conversation.

---

### `rate-limited`

Rate-limiting bot that blocks every 3rd request per session.

- Requests 1, 2: Normal response (uses `default` response generation)
- Request 3: HTTP 429 with `Retry-After` header (2–4 seconds random)
- Requests 4, 5: Normal
- Request 6: HTTP 429 again
- *(pattern repeats)*

**429 Response:**

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "retry_after": 3
  }
}
```

---

### `flaky`

Unreliable bot that randomly fails. Each request rolls a random outcome:

| Probability | Outcome |
|-------------|---------|
| 60% | Normal response (uses `default` response generation) |
| 20% | HTTP 500 Internal Server Error |
| 10% | 10-second hang, then HTTP 504 Gateway Timeout |
| 10% | HTTP 200 with empty content string |

This persona is ideal for testing retry logic, timeout handling, and empty response detection.

---

## Example curl Commands

### Health Check

```bash
curl http://localhost:3001/health
```

### Default Persona

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{ "role": "user", "content": "Give me a detailed explanation" }]
  }'
```

### E-commerce — List Products

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Persona: ecommerce" \
  -H "X-Session-Id: demo-session-1" \
  -d '{
    "messages": [{ "role": "user", "content": "list products" }]
  }'
```

### E-commerce — Compare Products

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Persona: ecommerce" \
  -d '{
    "messages": [{ "role": "user", "content": "compare ultrabook and gamestation" }]
  }'
```

### E-commerce — Reviews

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Persona: ecommerce" \
  -d '{
    "messages": [{ "role": "user", "content": "reviews for ultrabook pro 15" }]
  }'
```

### Support — FAQ Match

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Persona: support" \
  -d '{
    "messages": [{ "role": "user", "content": "What is your return policy?" }]
  }'
```

### Code — TypeScript Example

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Persona: code" \
  -H "X-Session-Id: code-session-1" \
  -d '{
    "messages": [{ "role": "user", "content": "Give me a typescript example" }]
  }'
```

### Rate-Limited — Trigger 429

```bash
# Send 3 requests to the same session — the 3rd will return 429
for i in 1 2 3; do
  echo "--- Request $i ---"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST http://localhost:3001/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "X-Persona: rate-limited" \
    -H "X-Session-Id: rl-session-1" \
    -d '{"messages": [{ "role": "user", "content": "hello" }]}'
done
```

### Flaky — Observe Random Failures

```bash
# Send 10 requests and observe the mix of successes and failures
for i in $(seq 1 10); do
  echo "--- Request $i ---"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST http://localhost:3001/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "X-Persona: flaky" \
    -d '{"messages": [{ "role": "user", "content": "hello" }]}'
done
```

### Simple Chat Endpoint

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -H "X-Persona: ecommerce" \
  -d '{ "message": "list products" }'
```

### Error and Timeout Endpoints

```bash
# Always returns 500
curl -X POST http://localhost:3001/error

# Never responds (will hang until client timeout)
curl -X POST http://localhost:3001/timeout --max-time 5

# Responds after 5 seconds
curl -X POST http://localhost:3001/slow
```

## Using the Mock Server as a Krawall Target

The mock chatbot is designed to be used as a Target inside Krawall for development and testing.

### 1. Start the Mock Server

```bash
npx tsx tests/mocks/chatbot-server.ts
```

### 2. Create a Target in Krawall

In the Krawall UI, create a new target with these settings:

| Field | Value |
|-------|-------|
| **Name** | Mock Chatbot (or any name) |
| **Endpoint URL** | `http://localhost:3001/v1/chat/completions` |
| **Connector Type** | `HTTP_REST` |
| **Auth Type** | `NONE` |

**Request Template:**

```json
{
  "messagePath": "messages[0].content",
  "structure": {
    "model": "mock-gpt-4",
    "messages": [
      { "role": "user", "content": "" }
    ]
  }
}
```

**Response Template:**

```json
{
  "contentPath": "choices[0].message.content",
  "tokenUsagePath": "usage"
}
```

### 3. Test the Connection

Use the "Test Connection" button on the target detail page. You should get a successful response from the mock server.

### 4. Run Scenarios

With the mock server running, you can execute any Krawall scenario against it. To test specific personas, add the `X-Persona` header in the target's custom headers configuration.

### 5. Persona-Specific Targets

For focused testing, create separate targets for each persona by including the persona header:

| Target Name | Extra Headers |
|-------------|---------------|
| Mock - E-commerce | `X-Persona: ecommerce` |
| Mock - Support | `X-Persona: support` |
| Mock - Code | `X-Persona: code` |
| Mock - Rate Limited | `X-Persona: rate-limited` |
| Mock - Flaky | `X-Persona: flaky` |

## Server API (Programmatic)

When using the server in test code:

```typescript
const server = new MockChatbotServer(3001, true);

await server.start();        // Start listening
server.getStats();            // { requestCount, messageHistory, port }
server.reset();               // Clear all state (history, sessions, counters)
await server.stop();          // Stop the server
```
