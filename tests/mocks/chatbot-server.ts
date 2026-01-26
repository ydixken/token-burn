/**
 * Mock Chatbot Server for Testing
 *
 * Simulates various chatbot behaviors:
 * - Verbose responses
 * - XML format outputs
 * - Repetitive answers
 * - Error scenarios
 * - Variable response times
 * - Token usage tracking
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

export class MockChatbotServer {
  private app: Express;
  private port: number;
  private server: any;
  private messageHistory: ChatMessage[] = [];
  private requestCount: number = 0;

  constructor(port: number = 3001) {
    this.port = port;
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

    // Simulate realistic response time (100-2000ms)
    const delay = Math.random() * 1900 + 100;
    await this.delay(delay);

    // Randomly simulate errors (5% chance)
    if (Math.random() < 0.05) {
      res.status(429).json({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
      return;
    }

    // Generate response based on content
    const response = this.generateResponse(userMessage.content);

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

    // Store message history
    this.messageHistory.push(userMessage, { role: "assistant", content: response });

    res.json(chatResponse);
  }

  private async handleSimpleChat(req: Request, res: Response) {
    this.requestCount++;

    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const delay = Math.random() * 1500 + 100;
    await this.delay(delay);

    const response = this.generateResponse(message);
    const tokens = this.estimateTokens(response);

    res.json({
      response,
      tokens: {
        total: tokens,
      },
      timestamp: new Date().toISOString(),
    });
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
