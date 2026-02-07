/**
 * ConversationContext - Stateful conversation management for multi-turn chatbot testing.
 *
 * Tracks message history, manages context window size, captures session tokens,
 * and extracts conversation IDs from API responses.
 */

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ConversationContextConfig {
  maxContextTokens?: number; // Default: 4096
  conversationIdPath?: string; // JSON path to extract conversation ID from response
  sessionTokenPaths?: string[]; // JSON paths to extract session tokens from response
}

const DEFAULT_MAX_CONTEXT_TOKENS = 4096;
const TOKENS_PER_WORD_APPROX = 1.3;

export class ConversationContext {
  private history: ConversationMessage[] = [];
  private _conversationId: string | null = null;
  private _sessionTokens: Record<string, string> = {};
  private config: ConversationContextConfig;

  constructor(config: ConversationContextConfig = {}) {
    this.config = {
      maxContextTokens: config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      conversationIdPath: config.conversationIdPath,
      sessionTokenPaths: config.sessionTokenPaths,
    };
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(role: "user" | "assistant", content: string): void {
    this.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // Trim history if it exceeds max context tokens
    this.trimToTokenLimit();
  }

  /**
   * Get the full conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.history];
  }

  /**
   * Get the last N messages
   */
  getLastN(n: number): ConversationMessage[] {
    return this.history.slice(-n);
  }

  /**
   * Get approximate token count of the conversation history
   */
  getTokenCount(): number {
    return this.history.reduce((total, msg) => {
      return total + estimateTokens(msg.content);
    }, 0);
  }

  /**
   * Get the number of messages in history
   */
  getMessageCount(): number {
    return this.history.length;
  }

  /**
   * Clear the conversation history and reset state
   */
  clear(): void {
    this.history = [];
    this._conversationId = null;
    this._sessionTokens = {};
  }

  /**
   * Get the extracted conversation ID
   */
  get conversationId(): string | null {
    return this._conversationId;
  }

  /**
   * Get captured session tokens for forwarding
   */
  get sessionTokens(): Record<string, string> {
    return { ...this._sessionTokens };
  }

  /**
   * Process an API response to extract conversation ID and session tokens.
   * Call this after each assistant response.
   */
  processResponse(responseBody: unknown, responseHeaders?: Record<string, string>): void {
    // Extract conversation ID from response body
    if (this.config.conversationIdPath && !this._conversationId) {
      const extracted = extractValueAtPath(responseBody, this.config.conversationIdPath);
      if (extracted && typeof extracted === "string") {
        this._conversationId = extracted;
      }
    }

    // Extract session tokens from response
    if (this.config.sessionTokenPaths) {
      for (const tokenPath of this.config.sessionTokenPaths) {
        // Check response body first
        const bodyToken = extractValueAtPath(responseBody, tokenPath);
        if (bodyToken && typeof bodyToken === "string") {
          this._sessionTokens[tokenPath] = bodyToken;
        }

        // Also check response headers (using the last segment of the path as header name)
        if (responseHeaders) {
          const headerName = tokenPath.split(".").pop() || tokenPath;
          const headerValue = responseHeaders[headerName] || responseHeaders[headerName.toLowerCase()];
          if (headerValue) {
            this._sessionTokens[headerName] = headerValue;
          }
        }
      }
    }
  }

  /**
   * Get headers that should be forwarded to subsequent requests
   */
  getForwardHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Add conversation ID if captured
    if (this._conversationId) {
      headers["X-Conversation-Id"] = this._conversationId;
    }

    // Add session tokens
    for (const [key, value] of Object.entries(this._sessionTokens)) {
      // Use last segment of the key path as the header name
      const headerName = key.includes(".") ? key.split(".").pop()! : key;
      headers[headerName] = value;
    }

    return headers;
  }

  /**
   * Get a formatted history string suitable for Handlebars templates
   */
  getFormattedHistory(): string {
    return this.history
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Get context data suitable for template variable substitution
   */
  toTemplateVars(): Record<string, unknown> {
    return {
      conversationId: this._conversationId,
      messageCount: this.history.length,
      tokenCount: this.getTokenCount(),
      history: this.getFormattedHistory(),
      lastAssistantMessage: this.getLastAssistantMessage(),
      lastUserMessage: this.getLastUserMessage(),
    };
  }

  /**
   * Get the last assistant message content
   */
  private getLastAssistantMessage(): string {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === "assistant") {
        return this.history[i].content;
      }
    }
    return "";
  }

  /**
   * Get the last user message content
   */
  private getLastUserMessage(): string {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === "user") {
        return this.history[i].content;
      }
    }
    return "";
  }

  /**
   * Trim conversation history to stay under token limit (sliding window)
   */
  private trimToTokenLimit(): void {
    const maxTokens = this.config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;

    while (this.history.length > 1 && this.getTokenCount() > maxTokens) {
      // Remove the oldest message
      this.history.shift();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Approximate token count from text content (word count * 1.3)
 */
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * TOKENS_PER_WORD_APPROX);
}

/**
 * Extract a value from a nested object using a JSON path
 */
function extractValueAtPath(obj: unknown, jsonPath: string): unknown {
  const cleanPath = jsonPath.startsWith("$.") ? jsonPath.slice(2) : jsonPath;
  const parts = cleanPath.split(/[.\[\]]/).filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}
