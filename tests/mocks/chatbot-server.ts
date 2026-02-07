/**
 * Mock Chatbot Server for Testing
 *
 * Simulates various chatbot behaviors with persona support:
 * - Default: Verbose responses, XML format, repetitive answers, error scenarios
 * - E-Commerce Assistant: Product catalog, comparisons, reviews
 * - Support Agent: FAQ, escalation, ticket numbers
 * - Code Assistant: Code blocks, explanations
 * - Rate-Limited Bot: 429 after every 3rd request
 * - Flaky Bot: Random failures, hangs, empty responses
 *
 * Personas are selected via `X-Persona` header or `persona` field in request body.
 * Session history is tracked via `X-Session-Id` header.
 */

import express, { Express, Request, Response } from "express";

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  persona?: string;
}

interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Product Catalog ────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  specs: Record<string, string>;
  rating: number;
}

const PRODUCT_CATALOG: Product[] = [
  { id: "P001", name: "UltraBook Pro 15", price: 1299.99, category: "Laptops", specs: { cpu: "Intel i7-13700H", ram: "16GB DDR5", storage: "512GB NVMe", display: "15.6\" FHD IPS" }, rating: 4.5 },
  { id: "P002", name: "UltraBook Air 13", price: 999.99, category: "Laptops", specs: { cpu: "Intel i5-1335U", ram: "8GB DDR5", storage: "256GB NVMe", display: "13.3\" FHD IPS" }, rating: 4.2 },
  { id: "P003", name: "GameStation X", price: 1899.99, category: "Laptops", specs: { cpu: "AMD Ryzen 9 7945HX", ram: "32GB DDR5", storage: "1TB NVMe", display: "16\" QHD 165Hz" }, rating: 4.8 },
  { id: "P004", name: "CloudPad Tablet 10", price: 449.99, category: "Tablets", specs: { cpu: "Snapdragon 8 Gen 2", ram: "8GB", storage: "128GB", display: "10.5\" AMOLED" }, rating: 4.3 },
  { id: "P005", name: "CloudPad Mini 8", price: 299.99, category: "Tablets", specs: { cpu: "Snapdragon 7 Gen 1", ram: "4GB", storage: "64GB", display: "8\" LCD" }, rating: 3.9 },
  { id: "P006", name: "ProMonitor 27 4K", price: 549.99, category: "Monitors", specs: { panel: "IPS", resolution: "3840x2160", refresh: "60Hz", ports: "HDMI 2.1, DP 1.4, USB-C" }, rating: 4.6 },
  { id: "P007", name: "CurveView 34 UW", price: 799.99, category: "Monitors", specs: { panel: "VA Curved", resolution: "3440x1440", refresh: "144Hz", ports: "HDMI 2.0, DP 1.4" }, rating: 4.4 },
  { id: "P008", name: "SpeedType Mechanical KB", price: 129.99, category: "Peripherals", specs: { switches: "Cherry MX Brown", layout: "Full-size", backlight: "RGB per-key", connectivity: "USB-C / BT 5.0" }, rating: 4.7 },
  { id: "P009", name: "ErgoMouse Wireless", price: 79.99, category: "Peripherals", specs: { sensor: "26000 DPI", buttons: "8 programmable", battery: "70hr", connectivity: "2.4GHz / BT" }, rating: 4.1 },
  { id: "P010", name: "SoundPods Pro", price: 199.99, category: "Audio", specs: { type: "TWS In-ear", anc: "Active Noise Cancel", battery: "8hr + 24hr case", codec: "AAC, LDAC" }, rating: 4.5 },
  { id: "P011", name: "StudioCans Over-Ear", price: 349.99, category: "Audio", specs: { type: "Over-ear Closed", driver: "50mm", anc: "Adaptive ANC", battery: "30hr" }, rating: 4.8 },
  { id: "P012", name: "DeskHub USB-C Dock", price: 189.99, category: "Accessories", specs: { ports: "3xUSB-A, 2xUSB-C, HDMI, DP, Ethernet", power: "100W PD passthrough", compatibility: "Windows/Mac/Linux" }, rating: 4.3 },
  { id: "P013", name: "PowerBank 20K", price: 49.99, category: "Accessories", specs: { capacity: "20000mAh", output: "65W USB-C PD", ports: "1xUSB-C, 2xUSB-A", weight: "350g" }, rating: 4.0 },
  { id: "P014", name: "WebCam Ultra HD", price: 149.99, category: "Peripherals", specs: { resolution: "4K 30fps / 1080p 60fps", fov: "90°", mic: "Dual stereo", mount: "Clip / Tripod" }, rating: 4.2 },
  { id: "P015", name: "SmartWatch Fit", price: 249.99, category: "Wearables", specs: { display: "1.4\" AMOLED", sensors: "HR, SpO2, GPS", battery: "5 days", water: "5ATM" }, rating: 4.4 },
  { id: "P016", name: "NAS Box 4-Bay", price: 399.99, category: "Storage", specs: { bays: "4x 3.5\" SATA", cpu: "ARM Cortex-A55 Quad", ram: "4GB DDR4", network: "2.5GbE" }, rating: 4.6 },
  { id: "P017", name: "WiFi 7 Router Pro", price: 329.99, category: "Networking", specs: { standard: "WiFi 7 (BE)", speed: "19Gbps tri-band", ports: "4x 2.5GbE LAN, 1x 10GbE WAN", coverage: "3500 sq ft" }, rating: 4.5 },
  { id: "P018", name: "Standing Desk Frame", price: 499.99, category: "Furniture", specs: { range: "25-50 inches", motor: "Dual motor", load: "350 lbs", presets: "4 memory positions" }, rating: 4.7 },
  { id: "P019", name: "LED Desk Lamp Pro", price: 89.99, category: "Accessories", specs: { brightness: "1200 lux", color: "2700K-6500K", features: "Auto-dim, USB-A port", power: "12W" }, rating: 4.1 },
  { id: "P020", name: "Portable SSD 2TB", price: 159.99, category: "Storage", specs: { capacity: "2TB", speed: "2000MB/s read", interface: "USB 3.2 Gen 2x2", encryption: "AES 256-bit HW" }, rating: 4.6 },
  { id: "P021", name: "MechPad NumKey", price: 59.99, category: "Peripherals", specs: { switches: "Gateron Red", keys: "21-key numpad", backlight: "White LED", connectivity: "USB-C" }, rating: 4.0 },
];

const FAKE_REVIEWS: Record<string, Array<{ reviewer: string; rating: number; text: string }>> = {
  "ultrabook pro 15": [
    { reviewer: "TechFan42", rating: 5, text: "Incredible performance for the price. The display is crisp and the keyboard feels great." },
    { reviewer: "DevJane", rating: 4, text: "Great dev machine. Battery could be better but otherwise solid." },
    { reviewer: "StudentMike", rating: 5, text: "Best laptop I've owned. Handles everything I throw at it." },
  ],
  "gamestation x": [
    { reviewer: "GamerPro", rating: 5, text: "The 165Hz display is buttery smooth. AAA games run flawlessly." },
    { reviewer: "StreamerLiz", rating: 4, text: "Heavy but worth it. Great for streaming and gaming simultaneously." },
  ],
  "soundpods pro": [
    { reviewer: "AudioNerd", rating: 5, text: "ANC is best-in-class. LDAC codec support is a huge plus." },
    { reviewer: "CommuteDave", rating: 4, text: "Perfect for commuting. Comfortable for long listening sessions." },
  ],
};

// ─── FAQ Knowledge Base ─────────────────────────────────────────────────────

const FAQ_ENTRIES: Array<{ keywords: string[]; question: string; answer: string }> = [
  { keywords: ["return", "refund"], question: "What is your return policy?", answer: "We offer a 30-day return policy for all products in original condition. Refunds are processed within 5-7 business days." },
  { keywords: ["shipping", "delivery", "ship"], question: "How long does shipping take?", answer: "Standard shipping takes 5-7 business days. Express shipping (2-3 days) is available for $9.99. Free shipping on orders over $50." },
  { keywords: ["warranty", "guarantee"], question: "What warranty do you offer?", answer: "All products come with a 1-year manufacturer warranty. Extended 3-year warranty is available for $29.99." },
  { keywords: ["payment", "pay", "credit", "card"], question: "What payment methods do you accept?", answer: "We accept Visa, Mastercard, American Express, PayPal, and Apple Pay." },
  { keywords: ["track", "order", "status"], question: "How can I track my order?", answer: "You can track your order using the tracking number sent to your email, or visit our Order Status page." },
  { keywords: ["cancel", "cancellation"], question: "Can I cancel my order?", answer: "Orders can be cancelled within 1 hour of placement. After that, you may need to wait for delivery and initiate a return." },
  { keywords: ["account", "password", "login"], question: "I can't log into my account", answer: "Try resetting your password via the 'Forgot Password' link. If issues persist, our team can help verify your identity and restore access." },
  { keywords: ["discount", "coupon", "promo"], question: "Do you have any discounts?", answer: "Sign up for our newsletter to receive 10% off your first order. We also run seasonal sales throughout the year." },
];

// ─── Session Store ──────────────────────────────────────────────────────────

interface SessionData {
  messages: ChatMessage[];
  requestCount: number;
  createdAt: number;
}

const sessionStore = new Map<string, SessionData>();

function getSession(sessionId: string): SessionData {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, { messages: [], requestCount: 0, createdAt: Date.now() });
  }
  return sessionStore.get(sessionId)!;
}

// ─── Persona Handlers ───────────────────────────────────────────────────────

function getPersona(req: Request): string {
  return (
    (req.headers["x-persona"] as string) ||
    req.body?.persona ||
    "default"
  ).toLowerCase();
}

function getSessionId(req: Request): string {
  return (req.headers["x-session-id"] as string) || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function handleEcommerce(message: string, session: SessionData): string {
  const lower = message.toLowerCase();

  if (lower.includes("list products") || lower.includes("show products") || lower.includes("catalog")) {
    const lines = PRODUCT_CATALOG.map(
      (p) => `- **${p.name}** (${p.id}): $${p.price.toFixed(2)} [${p.category}] ★${p.rating}`
    );
    return `Here's our product catalog:\n\n${lines.join("\n")}`;
  }

  if (lower.includes("compare")) {
    const names = PRODUCT_CATALOG.map((p) => p.name.toLowerCase());
    const matched = names.filter((n) => lower.includes(n.split(" ")[0].toLowerCase()));
    const products = matched.length >= 2
      ? matched.slice(0, 2).map((n) => PRODUCT_CATALOG.find((p) => p.name.toLowerCase() === n)!)
      : PRODUCT_CATALOG.slice(0, 2);

    const a = products[0];
    const b = products[1];
    const allKeys = [...new Set([...Object.keys(a.specs), ...Object.keys(b.specs)])];
    const rows = allKeys.map((k) => `| ${k} | ${a.specs[k] || "N/A"} | ${b.specs[k] || "N/A"} |`);

    return `## Comparison: ${a.name} vs ${b.name}\n\n| Spec | ${a.name} | ${b.name} |\n|------|-----------|----------|\n| Price | $${a.price.toFixed(2)} | $${b.price.toFixed(2)} |\n| Rating | ★${a.rating} | ★${b.rating} |\n${rows.join("\n")}`;
  }

  if (lower.includes("review")) {
    for (const [productKey, reviews] of Object.entries(FAKE_REVIEWS)) {
      if (lower.includes(productKey) || lower.includes(productKey.split(" ")[0])) {
        const lines = reviews.map(
          (r) => `- **${r.reviewer}** (★${r.rating}): "${r.text}"`
        );
        return `Reviews for ${productKey}:\n\n${lines.join("\n")}`;
      }
    }
    return "I couldn't find reviews for that product. Try asking for reviews for 'UltraBook Pro 15', 'GameStation X', or 'SoundPods Pro'.";
  }

  if (lower.includes("xml format") || lower.includes("xml")) {
    const products = PRODUCT_CATALOG.slice(0, 5);
    const items = products
      .map((p) => `    <product id="${p.id}">\n      <name>${p.name}</name>\n      <price>${p.price}</price>\n      <category>${p.category}</category>\n      <rating>${p.rating}</rating>\n    </product>`)
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n  <products>\n${items}\n  </products>\n  <total>${PRODUCT_CATALOG.length}</total>\n</catalog>`;
  }

  if (lower.includes("summarize") && (lower.includes("conversation") || lower.includes("chat"))) {
    if (session.messages.length === 0) {
      return "We haven't discussed anything yet! Ask me about products, comparisons, or reviews.";
    }
    const summary = session.messages
      .filter((m) => m.role === "user")
      .map((m, i) => `${i + 1}. You asked: "${m.content}"`)
      .join("\n");
    return `Here's a summary of our conversation:\n\n${summary}\n\nTotal exchanges: ${session.messages.length}`;
  }

  return `Welcome to TechStore! I can help you with:\n- **list products** - Browse our catalog (${PRODUCT_CATALOG.length} items)\n- **compare X and Y** - Side-by-side comparison\n- **reviews for X** - Customer reviews\n- **XML format** - Get data in XML\n- **summarize our conversation** - Recap what we discussed`;
}

function handleSupport(message: string, session: SessionData): string {
  const lower = message.toLowerCase();
  const msgCount = session.requestCount;
  const ticketNum = `TKT-${(10000 + Math.floor(Math.random() * 90000))}`;

  // Escalate after 5 messages
  if (msgCount >= 5) {
    return JSON.stringify({
      ticket: ticketNum,
      status: "escalated",
      message: `Let me transfer you to a senior support specialist. Your ticket number is ${ticketNum}. A human agent will be with you shortly. Thank you for your patience.`,
      escalation_reason: "Conversation exceeded automated support threshold",
      priority: "high",
    }, null, 2);
  }

  // Check FAQ
  for (const faq of FAQ_ENTRIES) {
    if (faq.keywords.some((kw) => lower.includes(kw))) {
      // Verbosity increases with message count
      const baseAnswer = faq.answer;
      const verbosePadding = msgCount > 2
        ? `\n\nTo provide additional context: ${baseAnswer} If you need more specific information, please don't hesitate to ask. Our support team is always here to help you with any questions or concerns.`
        : "";

      return JSON.stringify({
        ticket: ticketNum,
        status: "resolved",
        faq_match: faq.question,
        message: baseAnswer + verbosePadding,
        follow_up: "Is there anything else I can help you with?",
      }, null, 2);
    }
  }

  // Generic support response, gets more verbose with each message
  const verbosityLines = [
    "I'd be happy to help you with that.",
    " Let me look into this for you right away.",
    " I want to make sure we resolve this to your complete satisfaction.",
    " Our team takes every inquiry very seriously and we aim to provide the best possible support experience.",
    " Please know that your satisfaction is our top priority and we will do everything in our power to assist you.",
  ];
  const responseText = verbosityLines.slice(0, Math.min(msgCount + 1, verbosityLines.length)).join("");

  return JSON.stringify({
    ticket: ticketNum,
    status: "open",
    message: responseText,
    suggestions: FAQ_ENTRIES.slice(0, 3).map((f) => f.question),
  }, null, 2);
}

function handleCode(message: string, session: SessionData): string {
  const lower = message.toLowerCase();
  const msgCount = session.requestCount;

  if (lower.includes("explain")) {
    const paragraphs = [
      "Let me provide a detailed explanation of this concept.",
      "\n\nAt a fundamental level, this pattern is used to separate concerns and improve maintainability. By isolating different responsibilities into distinct modules, we can achieve better testability and reduce coupling between components.",
      "\n\nIn practice, this means that each module should have a single, well-defined purpose. When a module needs to interact with another, it should do so through a clearly defined interface rather than reaching into the internals of the other module.",
      "\n\nThe historical context for this approach comes from decades of software engineering research. The SOLID principles, first described by Robert C. Martin, formalize many of these ideas. The Single Responsibility Principle (SRP) states that a class should have only one reason to change.",
      "\n\nFurthermore, modern frameworks and languages have built-in support for these patterns. Dependency injection containers, module systems, and interface-based programming all facilitate this style of architecture.",
      "\n\nTo summarize: keep modules focused, define clear interfaces, prefer composition over inheritance, and test each component in isolation. This will lead to more maintainable, scalable, and robust software systems.",
    ];
    return paragraphs.slice(0, Math.min(msgCount + 2, paragraphs.length)).join("");
  }

  // Generate code examples that grow in length
  const baseSize = Math.min(msgCount + 1, 5);

  if (lower.includes("typescript") || lower.includes("ts")) {
    const functions = Array.from({ length: baseSize }, (_, i) => `
function processStep${i + 1}(input: Record<string, unknown>): Record<string, unknown> {
  const result = { ...input, step: ${i + 1}, timestamp: Date.now() };
  console.log(\`Step ${i + 1} processed:\`, result);
  return result;
}`).join("\n");

    return `Here's a TypeScript example:\n\n\`\`\`typescript\ninterface PipelineResult {\n  success: boolean;\n  data: Record<string, unknown>;\n  steps: number;\n}\n${functions}\n\nasync function runPipeline(input: Record<string, unknown>): Promise<PipelineResult> {\n  let data = input;\n${Array.from({ length: baseSize }, (_, i) => `  data = processStep${i + 1}(data);`).join("\n")}\n  return { success: true, data, steps: ${baseSize} };\n}\n\`\`\``;
  }

  if (lower.includes("python") || lower.includes("py")) {
    const functions = Array.from({ length: baseSize }, (_, i) => `
def process_step_${i + 1}(data: dict) -> dict:
    """Process step ${i + 1} of the pipeline."""
    result = {**data, "step": ${i + 1}, "timestamp": time.time()}
    print(f"Step ${i + 1} processed: {result}")
    return result`).join("\n");

    return `Here's a Python example:\n\n\`\`\`python\nimport time\nfrom typing import Any\n${functions}\n\ndef run_pipeline(input_data: dict[str, Any]) -> dict[str, Any]:\n    data = input_data\n${Array.from({ length: baseSize }, (_, i) => `    data = process_step_${i + 1}(data)`).join("\n")}\n    return {"success": True, "data": data, "steps": ${baseSize}}\n\`\`\``;
  }

  // Default: JavaScript
  const functions = Array.from({ length: baseSize }, (_, i) => `
function processStep${i + 1}(input) {
  const result = { ...input, step: ${i + 1}, ts: Date.now() };
  console.log('Step ${i + 1}:', result);
  return result;
}`).join("\n");

  return `Here's a code example:\n\n\`\`\`javascript\n${functions}\n\nfunction runPipeline(input) {\n  let data = input;\n${Array.from({ length: baseSize }, (_, i) => `  data = processStep${i + 1}(data);`).join("\n")}\n  return { success: true, data, steps: ${baseSize} };\n}\n\`\`\``;
}

function handleRateLimited(session: SessionData): { blocked: boolean; retryAfter?: number } {
  // Block every 3rd request
  if (session.requestCount > 0 && session.requestCount % 3 === 0) {
    return { blocked: true, retryAfter: 2 + Math.floor(Math.random() * 3) };
  }
  return { blocked: false };
}

function handleFlaky(): { type: "normal" | "error" | "hang" | "empty"; hangMs?: number } {
  const roll = Math.random();
  if (roll < 0.6) return { type: "normal" };
  if (roll < 0.8) return { type: "error" };
  if (roll < 0.9) return { type: "hang", hangMs: 10000 };
  return { type: "empty" };
}

// ─── Main Server ────────────────────────────────────────────────────────────

export class MockChatbotServer {
  private app: Express;
  private port: number;
  private server: any;
  private messageHistory: ChatMessage[] = [];
  private requestCount: number = 0;
  private testMode: boolean;

  constructor(port: number = 3001, testMode: boolean = false) {
    this.port = port;
    this.testMode = testMode;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`📥 Mock Server: ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Root health check
    this.app.get("/", (req, res) => {
      res.json({ status: "ok" });
    });

    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "healthy", requestsServed: this.requestCount });
    });

    // Chat completions (OpenAI-style)
    this.app.post("/v1/chat/completions", this.handleChatCompletion.bind(this));

    // Simple chat endpoint
    this.app.post("/chat", this.handleSimpleChat.bind(this));

    // Error simulation endpoint
    this.app.post("/error", (req, res) => {
      res.status(500).json({ error: { message: "Simulated server error" } });
    });

    // Timeout simulation endpoint
    this.app.post("/timeout", async (req, res) => {
      // Never respond (simulates timeout)
      await new Promise(() => {});
    });

    // Slow endpoint
    this.app.post("/slow", async (req, res) => {
      await this.delay(5000); // 5 second delay
      res.json({ message: "This took a while" });
    });
  }

  private async handleChatCompletion(req: Request, res: Response) {
    this.requestCount++;

    const chatRequest: ChatRequest = req.body;
    const userMessage = chatRequest.messages[chatRequest.messages.length - 1];
    const persona = getPersona(req);
    const sessionId = getSessionId(req);
    const session = getSession(sessionId);

    session.requestCount++;
    session.messages.push(userMessage);

    // ── Rate-Limited persona check (before any delay) ──
    if (persona === "rate-limited") {
      const rl = handleRateLimited(session);
      if (rl.blocked) {
        res.set("Retry-After", String(rl.retryAfter));
        res.status(429).json({
          error: {
            message: "Rate limit exceeded",
            type: "rate_limit_error",
            code: "rate_limit_exceeded",
            retry_after: rl.retryAfter,
          },
        });
        return;
      }
    }

    // ── Flaky persona check ──
    if (persona === "flaky") {
      const outcome = handleFlaky();
      if (outcome.type === "error") {
        res.status(500).json({ error: { message: "Internal server error (flaky)", type: "server_error" } });
        return;
      }
      if (outcome.type === "hang") {
        await this.delay(outcome.hangMs!);
        res.status(504).json({ error: { message: "Gateway timeout (flaky)", type: "timeout_error" } });
        return;
      }
      if (outcome.type === "empty") {
        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: chatRequest.model || "mock-gpt-4",
          choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        return;
      }
      // type === "normal" falls through
    }

    // Simulate realistic response time (skipped in test mode for determinism)
    if (!this.testMode) {
      const delay = Math.random() * 1900 + 100;
      await this.delay(delay);
    } else {
      await this.delay(10); // Minimal delay for timing assertions
    }

    // Note: Random 429 errors removed from default persona.
    // Use the "rate-limited" persona explicitly to test rate limiting.

    // Generate response based on persona
    const response = this.generatePersonaResponse(persona, userMessage.content, session);

    // Calculate token usage
    const promptTokens = this.estimateTokens(userMessage.content);
    const completionTokens = this.estimateTokens(response);

    const chatResponse: ChatResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: chatRequest.model || "mock-gpt-4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };

    // Store message history (global and session)
    const assistantMsg: ChatMessage = { role: "assistant", content: response };
    this.messageHistory.push(userMessage, assistantMsg);
    session.messages.push(assistantMsg);

    res.json(chatResponse);
  }

  private async handleSimpleChat(req: Request, res: Response) {
    this.requestCount++;

    const { message, persona: bodyPersona } = req.body;
    const persona = (req.headers["x-persona"] as string || bodyPersona || "default").toLowerCase();
    const sessionId = getSessionId(req);
    const session = getSession(sessionId);

    session.requestCount++;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    session.messages.push({ role: "user", content: message });

    // Rate-limited check
    if (persona === "rate-limited") {
      const rl = handleRateLimited(session);
      if (rl.blocked) {
        res.set("Retry-After", String(rl.retryAfter));
        res.status(429).json({ error: "Rate limit exceeded", retry_after: rl.retryAfter });
        return;
      }
    }

    // Flaky check
    if (persona === "flaky") {
      const outcome = handleFlaky();
      if (outcome.type === "error") {
        res.status(500).json({ error: "Internal server error (flaky)" });
        return;
      }
      if (outcome.type === "hang") {
        await this.delay(outcome.hangMs!);
        res.status(504).json({ error: "Gateway timeout (flaky)" });
        return;
      }
      if (outcome.type === "empty") {
        res.json({ response: "", tokens: { total: 0 }, timestamp: new Date().toISOString() });
        return;
      }
    }

    if (!this.testMode) {
      const delay = Math.random() * 1500 + 100;
      await this.delay(delay);
    } else {
      await this.delay(10);
    }

    const response = this.generatePersonaResponse(persona, message, session);
    const tokens = this.estimateTokens(response);

    session.messages.push({ role: "assistant", content: response });

    res.json({
      response,
      tokens: {
        total: tokens,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private generatePersonaResponse(persona: string, message: string, session: SessionData): string {
    switch (persona) {
      case "ecommerce":
        return handleEcommerce(message, session);
      case "support":
        return handleSupport(message, session);
      case "code":
        return handleCode(message, session);
      case "rate-limited":
      case "flaky":
        // These personas use default response generation when not blocked/errored
        return this.generateResponse(message);
      case "default":
      default:
        return this.generateResponse(message);
    }
  }

  private generateResponse(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Detect request for XML format
    if (lowerMessage.includes("xml")) {
      return this.generateXMLResponse();
    }

    // Detect request for high verbosity
    if (
      lowerMessage.includes("detail") ||
      lowerMessage.includes("elaborate") ||
      lowerMessage.includes("verbose") ||
      lowerMessage.includes("maximal")
    ) {
      return this.generateVerboseResponse(message);
    }

    // Detect request for repetition
    if (lowerMessage.includes("repeat") || lowerMessage.includes("clarif")) {
      return this.generateRepetitiveResponse();
    }

    // Detect request for references/context
    if (lowerMessage.includes("reference") || lowerMessage.includes("context")) {
      return this.generateContextualResponse();
    }

    // Default response
    return this.generateDefaultResponse(message);
  }

  private generateXMLResponse(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>success</status>
  <data>
    <section id="1">
      <title>Detailed XML Response</title>
      <content>
        <paragraph>This is a highly detailed XML formatted response.</paragraph>
        <paragraph>It contains multiple nested elements to demonstrate structure.</paragraph>
        <subsection>
          <header>Nested Content</header>
          <items>
            <item priority="high">First item with attributes</item>
            <item priority="medium">Second item with more data</item>
            <item priority="low">Third item for completeness</item>
          </items>
        </subsection>
      </content>
      <metadata>
        <timestamp>${new Date().toISOString()}</timestamp>
        <version>1.0</version>
        <tokens>approximately 200 tokens</tokens>
      </metadata>
    </section>
  </data>
</response>`;
  }

  private generateVerboseResponse(message: string): string {
    const baseResponse = `I appreciate your request for a detailed explanation. Let me provide you with an extensive and comprehensive response that thoroughly addresses your question.

First and foremost, it's important to establish a foundational understanding of the context surrounding your inquiry. ${message} This is a multifaceted topic that requires careful consideration from multiple perspectives and angles.

From a theoretical standpoint, we must consider the underlying principles that govern this subject matter. These principles have been studied extensively by researchers and practitioners in the field, and their findings provide valuable insights into the mechanisms at work.

Furthermore, when we examine the practical applications of these concepts, we can observe numerous real-world examples that demonstrate their effectiveness. Industry experts have implemented these strategies with varying degrees of success, and their experiences offer important lessons for future implementations.

It's also worth noting the historical context that has shaped our current understanding. Over the past several decades, significant advances have been made in this area, building upon the foundational work of early pioneers. Their contributions continue to influence contemporary approaches and methodologies.

In conclusion, this comprehensive analysis demonstrates the complexity and nuance inherent in addressing your question. By considering multiple perspectives and drawing upon both theoretical frameworks and practical experience, we can develop a more complete understanding of the subject matter.`;

    return baseResponse;
  }

  private generateRepetitiveResponse(): string {
    const phrases = [
      "As I mentioned before, ",
      "To reiterate my previous point, ",
      "Let me clarify once again, ",
      "To expand on what I said earlier, ",
    ];

    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

    return `${randomPhrase}the key concept here is understanding the fundamental principles. ${randomPhrase}it's essential to grasp the core ideas. ${randomPhrase}we need to focus on the basic foundations. This repetitive pattern helps reinforce the main points and ensures comprehensive understanding.`;
  }

  private generateContextualResponse(): string {
    return `Based on extensive research and analysis [1], we can establish that this topic has been thoroughly studied in academic literature. According to Smith et al. (2023) [2], the foundational principles were first described in the early 2000s. Johnson (2024) [3] later expanded on these concepts, providing additional context and real-world applications.

Furthermore, industry reports from TechResearch Group [4] indicate growing adoption of these methodologies. The historical context, as documented by Davis (2022) [5], shows an evolution from early implementations to modern best practices.

References:
[1] Various Academic Sources (2020-2024)
[2] Smith, J., et al. "Foundational Principles" - Journal of Technology, 2023
[3] Johnson, M. "Expanded Concepts" - Tech Review, 2024
[4] TechResearch Group Industry Report, 2024
[5] Davis, L. "Historical Evolution" - Computing History, 2022`;
  }

  private generateDefaultResponse(message: string): string {
    const responses = [
      `I understand your question about "${message}". Let me provide a helpful response.`,
      `That's an interesting question! Regarding "${message}", here's what I can tell you.`,
      `Thank you for asking about "${message}". Here's a comprehensive answer.`,
      `I'd be happy to help with "${message}". Let me explain.`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🤖 Mock Chatbot Server running on http://localhost:${this.port}`);
        console.log(`   Health: http://localhost:${this.port}/health`);
        console.log(`   Chat: http://localhost:${this.port}/v1/chat/completions`);
        console.log(`   Personas: default, ecommerce, support, code, rate-limited, flaky`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log("🛑 Mock Chatbot Server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getStats() {
    return {
      requestCount: this.requestCount,
      messageHistory: this.messageHistory,
      port: this.port,
    };
  }

  public reset() {
    this.messageHistory = [];
    this.requestCount = 0;
    sessionStore.clear();
  }
}

// CLI runner
if (require.main === module) {
  const port = parseInt(process.env.MOCK_PORT || "3001");
  const server = new MockChatbotServer(port);
  server.start();

  process.on("SIGINT", async () => {
    await server.stop();
    process.exit(0);
  });
}

export default MockChatbotServer;
