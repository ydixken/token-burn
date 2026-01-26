import fs from "fs/promises";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

export interface SessionMetadata {
  sessionId: string;
  targetId: string;
  scenarioId?: string;
  startedAt: string;
  executionConfig: Record<string, unknown>;
}

export interface MessageLogEntry {
  index: number;
  timestamp: string;
  direction: "sent" | "received";
  content: string;
  responseTimeMs: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  messageCount: number;
  totalTokens: number;
  avgResponseTimeMs: number;
  errorCount: number;
}

/**
 * Session Logger
 *
 * Handles file-based logging for session execution.
 * Creates a directory per session with metadata, messages, and summary.
 */
export class SessionLogger {
  private sessionId: string;
  private basePath: string;
  private metadataPath: string;
  private messagesPath: string;
  private initialized: boolean = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.basePath = path.join(process.cwd(), "logs", "sessions", sessionId);
    this.metadataPath = path.join(this.basePath, "metadata.json");
    this.messagesPath = path.join(this.basePath, "messages.jsonl");
  }

  /**
   * Initialize the session log directory
   */
  async initialize(metadata: SessionMetadata): Promise<void> {
    try {
      // Create directory if it doesn't exist
      if (!existsSync(this.basePath)) {
        mkdirSync(this.basePath, { recursive: true });
      }

      // Write metadata
      await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));

      this.initialized = true;
      console.log(`✅ Session logger initialized: ${this.sessionId}`);
    } catch (error) {
      console.error(`Failed to initialize session logger: ${this.sessionId}`, error);
      throw new Error(`Failed to initialize session logger: ${(error as Error).message}`);
    }
  }

  /**
   * Log a message (append to JSONL file)
   * Uses synchronous append for reliability
   */
  logMessage(entry: MessageLogEntry): void {
    if (!this.initialized) {
      throw new Error("Session logger not initialized. Call initialize() first.");
    }

    try {
      // Append as JSON line (synchronous for reliability)
      appendFileSync(this.messagesPath, JSON.stringify(entry) + "\n");
    } catch (error) {
      console.error(`Failed to log message for session: ${this.sessionId}`, error);
      throw new Error(`Failed to log message: ${(error as Error).message}`);
    }
  }

  /**
   * Log an error
   */
  async logError(error: Error): Promise<void> {
    try {
      const errorPath = path.join(this.basePath, "error.json");
      await fs.writeFile(
        errorPath,
        JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error(`Failed to log error for session: ${this.sessionId}`, err);
    }
  }

  /**
   * Finalize the session (write summary)
   */
  async finalize(): Promise<SessionSummary> {
    try {
      const summary = await this.calculateSummary();
      const summaryPath = path.join(this.basePath, "summary.json");
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      console.log(`✅ Session finalized: ${this.sessionId}`);
      return summary;
    } catch (error) {
      console.error(`Failed to finalize session: ${this.sessionId}`, error);
      throw new Error(`Failed to finalize session: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate summary statistics from log entries
   */
  private async calculateSummary(): Promise<SessionSummary> {
    try {
      // Check if messages file exists
      if (!existsSync(this.messagesPath)) {
        return {
          messageCount: 0,
          totalTokens: 0,
          avgResponseTimeMs: 0,
          errorCount: 0,
        };
      }

      // Read all messages
      const content = await fs.readFile(this.messagesPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length === 0) {
        return {
          messageCount: 0,
          totalTokens: 0,
          avgResponseTimeMs: 0,
          errorCount: 0,
        };
      }

      const entries: MessageLogEntry[] = lines.map((line) => JSON.parse(line));

      const messageCount = entries.length;
      const totalTokens = entries.reduce(
        (sum, e) => sum + (e.tokenUsage?.totalTokens || 0),
        0
      );
      const avgResponseTimeMs =
        entries.reduce((sum, e) => sum + e.responseTimeMs, 0) / entries.length;
      const errorCount = entries.filter((e) => !e.success).length;

      return {
        messageCount,
        totalTokens,
        avgResponseTimeMs,
        errorCount,
      };
    } catch (error) {
      console.error(`Failed to calculate summary for session: ${this.sessionId}`, error);
      throw new Error(`Failed to calculate summary: ${(error as Error).message}`);
    }
  }

  /**
   * Get the log directory path
   */
  getPath(): string {
    return this.basePath;
  }

  /**
   * Check if logger is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
