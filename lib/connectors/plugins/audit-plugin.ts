import type { ConnectorPlugin, PluginContext } from "./types";
import type { ConnectorResponse, MessageMetadata } from "../base";
import { PluginLoader } from "./loader";

/**
 * Audit Log Entry
 */
export interface AuditLogEntry {
  timestamp: Date;
  direction: "sent" | "received";
  sessionId: string;
  targetId: string;
  message?: string;
  responseContent?: string;
  responseTimeMs?: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** In-memory audit log storage, keyed by session ID */
const auditLogs = new Map<string, AuditLogEntry[]>();

/**
 * Get audit log entries for a session.
 * Returns all entries if no sessionId is provided.
 */
export function getAuditLog(sessionId?: string): AuditLogEntry[] {
  if (sessionId) {
    return auditLogs.get(sessionId) || [];
  }
  // Return all entries across all sessions
  const all: AuditLogEntry[] = [];
  for (const entries of auditLogs.values()) {
    all.push(...entries);
  }
  return all;
}

/**
 * Clear audit log entries for a session, or all entries if no sessionId.
 */
export function clearAuditLog(sessionId?: string): void {
  if (sessionId) {
    auditLogs.delete(sessionId);
  } else {
    auditLogs.clear();
  }
}

/**
 * Audit Plugin
 *
 * Passive plugin that records every message sent and received to an in-memory
 * audit log. Captures timestamps, token counts, and response times.
 * Does NOT modify messages or responses - purely observational.
 */
const auditPlugin: ConnectorPlugin = {
  id: "audit",
  name: "Audit Log Plugin",
  description:
    "Records all sent/received messages with timestamps, token counts, and response times for auditing.",
  version: "1.0.0",
  priority: 200,
  compatibleConnectors: ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"],

  async initialize(context: PluginContext): Promise<void> {
    // Initialize an empty log for this session
    if (!auditLogs.has(context.sessionId)) {
      auditLogs.set(context.sessionId, []);
    }
    context.state.lastSendTimestamp = null;
  },

  async beforeSend(
    message: string,
    _metadata: MessageMetadata | undefined,
    context: PluginContext
  ): Promise<{ message: string; metadata?: Record<string, unknown> }> {
    const log = auditLogs.get(context.sessionId) || [];

    // Record the send timestamp for response-time calculation
    context.state.lastSendTimestamp = Date.now();

    log.push({
      timestamp: new Date(),
      direction: "sent",
      sessionId: context.sessionId,
      targetId: context.targetId,
      message,
    });

    auditLogs.set(context.sessionId, log);

    // Passive: return message unmodified
    return { message };
  },

  async afterReceive(
    response: ConnectorResponse,
    context: PluginContext
  ): Promise<{ response: ConnectorResponse; metadata?: Record<string, unknown> }> {
    const log = auditLogs.get(context.sessionId) || [];

    // Calculate response time
    let responseTimeMs: number | undefined;
    if (context.state.lastSendTimestamp) {
      responseTimeMs = Date.now() - (context.state.lastSendTimestamp as number);
    }

    log.push({
      timestamp: new Date(),
      direction: "received",
      sessionId: context.sessionId,
      targetId: context.targetId,
      responseContent: response.content,
      responseTimeMs: responseTimeMs ?? response.metadata.responseTimeMs,
      tokenUsage: response.metadata.tokenUsage
        ? {
            promptTokens: response.metadata.tokenUsage.promptTokens,
            completionTokens: response.metadata.tokenUsage.completionTokens,
            totalTokens: response.metadata.tokenUsage.totalTokens,
          }
        : undefined,
    });

    auditLogs.set(context.sessionId, log);

    // Passive: return response unmodified
    return { response };
  },

  async onDisconnect(context: PluginContext): Promise<void> {
    // Keep the audit log on disconnect - it should persist for review.
    // Only clear via explicit clearAuditLog() call.
    context.state.lastSendTimestamp = null;
  },

  onError(error: Error, hookName: string, context: PluginContext): void {
    console.error(
      `[audit-plugin] Error in ${hookName} for session ${context.sessionId}:`,
      error.message
    );
  },
};

// Auto-register
PluginLoader.register(auditPlugin);

export { auditPlugin };
