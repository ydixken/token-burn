import { Worker, Job } from "bullmq";
import { redis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/client";
import { ConnectorRegistry } from "@/lib/connectors/registry";
import { SessionLogger, MessageLogEntry } from "@/lib/storage/session-logger";
import type { SessionJobData, ExecutionConfig, FlowStep, ErrorHandlingConfig } from "../queue";
import type { BaseConnector, ConnectorConfig } from "@/lib/connectors/base";
import { ConnectorError } from "@/lib/connectors/base";
import { ConversationContext } from "@/lib/context/conversation-context";
import { TokenBucket } from "@/lib/rate-limit/token-bucket";
import { emitWebhookEvent } from "@/lib/webhooks/emitter";
import Handlebars from "handlebars";

// ─── Execution Context ───────────────────────────────────────────────────────

interface ExecutionContext {
  variables: Record<string, unknown>;
  messageIndex: number;
  lastResponse: string;
  repetitionIndex: number;
  sessionId: string;
  conversation: ConversationContext;
  rateLimiter: TokenBucket | null;
}

// ─── Semaphore for concurrency limiting ──────────────────────────────────────

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

// ─── Template Substitution ───────────────────────────────────────────────────

function substituteTemplate(
  template: string,
  context: ExecutionContext,
  customVariables?: Record<string, unknown>
): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled({
    messageIndex: context.messageIndex,
    timestamp: new Date().toISOString(),
    repetitionIndex: context.repetitionIndex,
    lastResponse: context.lastResponse,
    ...context.conversation.toTemplateVars(),
    ...context.variables,
    ...customVariables,
  });
}

// ─── JSON Path Extraction ────────────────────────────────────────────────────

function extractValueAtPath(obj: unknown, jsonPath: string): unknown {
  // Supports $.foo.bar[0] or foo.bar.0
  const cleanPath = jsonPath.startsWith("$.") ? jsonPath.slice(2) : jsonPath;
  const parts = cleanPath.split(/[.\[\]]/).filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

// ─── Connector Lifecycle Helpers ─────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

async function connectWithRetry(connector: BaseConnector): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      await connector.connect();
      return;
    } catch (error) {
      lastError = error as Error;
      console.error(`Connection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} failed:`, error);
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(`Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts: ${lastError?.message}`);
}

async function ensureConnected(connector: BaseConnector): Promise<void> {
  if (!connector.isConnected()) {
    console.log("Connector disconnected mid-session, attempting reconnection...");
    await connectWithRetry(connector);
  }
}

// ─── Timeout Helper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ─── Error Handling Resolution ───────────────────────────────────────────────

interface ResolvedErrorAction {
  type: "skip" | "abort" | "retry";
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

function resolveErrorAction(
  config: ErrorHandlingConfig | undefined,
  statusCode?: number
): ResolvedErrorAction {
  if (!config) return { type: "skip", maxRetries: 3, delayMs: 1000, backoffMultiplier: 1.5, maxDelayMs: 30000 };

  // Check status code rules first
  if (statusCode && config.statusCodeRules) {
    for (const rule of config.statusCodeRules) {
      if (rule.codes.includes(statusCode)) {
        return {
          type: rule.action,
          maxRetries: rule.retryConfig?.maxRetries ?? config.retryConfig?.maxRetries ?? 3,
          delayMs: rule.retryConfig?.delayMs ?? config.retryConfig?.delayMs ?? 1000,
          backoffMultiplier: config.retryConfig?.backoffMultiplier ?? 1.5,
          maxDelayMs: config.retryConfig?.maxDelayMs ?? 30000,
        };
      }
    }
  }

  // Fall back to default onError
  return {
    type: config.onError,
    maxRetries: config.retryConfig?.maxRetries ?? 3,
    delayMs: config.retryConfig?.delayMs ?? 1000,
    backoffMultiplier: config.retryConfig?.backoffMultiplier ?? 1.5,
    maxDelayMs: config.retryConfig?.maxDelayMs ?? 30000,
  };
}

// ─── Session Executor Worker ─────────────────────────────────────────────────

export function createSessionWorker() {
  const worker = new Worker<SessionJobData>(
    "session-execution",
    async (job: Job<SessionJobData>) => {
      const { sessionId, targetId, scenarioId, executionConfig } = job.data;

      console.log(`Starting session execution: ${sessionId}`);

      let connector: BaseConnector | null = null;
      let logger: SessionLogger | null = null;
      let connectorConfig: ConnectorConfig | null = null;

      try {
        // Fetch target configuration
        const target = await prisma.target.findUnique({
          where: { id: targetId },
        });

        if (!target) {
          throw new Error(`Target not found: ${targetId}`);
        }

        // Fetch scenario configuration if provided
        let scenario = null;
        if (scenarioId) {
          scenario = await prisma.scenario.findUnique({
            where: { id: scenarioId },
          });
        }

        // Update session status to RUNNING
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
          },
        });

        // Build connector config
        connectorConfig = {
          endpoint: target.endpoint,
          authType: target.authType as any,
          authConfig: target.authConfig as any,
          requestTemplate: target.requestTemplate as any,
          responseTemplate: target.responseTemplate as any,
          protocolConfig: target.protocolConfig as any,
        };

        // Initialize connector with retry
        connector = await ConnectorRegistry.create(target.connectorType, targetId, connectorConfig);
        await connectWithRetry(connector);

        // Initialize session logger
        logger = new SessionLogger(sessionId);
        await logger.initialize({
          sessionId,
          targetId,
          scenarioId: scenarioId || undefined,
          startedAt: new Date().toISOString(),
          executionConfig: executionConfig as any,
        });

        // Set logPath early so the messages API can stream messages during execution
        await prisma.session.update({
          where: { id: sessionId },
          data: { logPath: logger.getPath() },
        });

        // Initialize execution context with conversation memory
        const conversation = new ConversationContext({
          maxContextTokens: (executionConfig as any).maxContextTokens ?? 4096,
          conversationIdPath: (executionConfig as any).conversationIdPath,
          sessionTokenPaths: (executionConfig as any).sessionTokenPaths,
        });

        // Initialize rate limiter from protocol config if configured
        const protocolConfig = target.protocolConfig as Record<string, unknown> | null;
        const rateLimitConfig = protocolConfig?.rateLimit as Record<string, unknown> | undefined;
        let rateLimiter: TokenBucket | null = null;
        if (rateLimitConfig) {
          rateLimiter = new TokenBucket({
            tokensPerSecond: (rateLimitConfig.maxRequestsPerSecond as number) || 10,
            bucketSize: (rateLimitConfig.burstSize as number) || 20,
            backpressureStrategy:
              (rateLimitConfig.backpressureStrategy as "wait" | "drop" | "error") || "wait",
          });
        }

        const context: ExecutionContext = {
          variables: {},
          messageIndex: 0,
          lastResponse: "",
          repetitionIndex: 0,
          sessionId,
          conversation,
          rateLimiter,
        };

        // Determine flow configuration
        const flowConfig = executionConfig.flowConfig || [];
        const customMessages = executionConfig.customMessages || [];
        const repetitions = executionConfig.repetitions || 1;
        const delayBetweenMs = executionConfig.delayBetweenMs || 0;
        const verbosityLevel = executionConfig.verbosityLevel || "normal";
        const concurrency = executionConfig.concurrency || 1;
        const messageTimeout = executionConfig.messageTimeout || 30000;
        const sessionTimeout = executionConfig.timeout;
        const resetBetweenRepetitions = executionConfig.resetBetweenRepetitions || false;
        const variableExtractors = executionConfig.variableExtractors || {};
        const customVariables = executionConfig.messageTemplates || {};
        const errorHandling = executionConfig.errorHandling;

        // Wrap entire execution in session-level timeout if configured
        const executeSession = async () => {
          if (flowConfig.length > 0) {
            // Execute structured flow
            for (let rep = 0; rep < repetitions; rep++) {
              context.repetitionIndex = rep;
              console.log(`  Repetition ${rep + 1}/${repetitions}`);

              // Reset connector between repetitions if configured
              if (rep > 0 && resetBetweenRepetitions && connector) {
                console.log("  Resetting connector and context between repetitions...");
                context.conversation.clear();
                try {
                  await connector.disconnect();
                } catch (e) {
                  console.error("Disconnect during reset failed:", e);
                }
                connector = await ConnectorRegistry.create(target.connectorType, targetId, connectorConfig!);
                await connectWithRetry(connector);
              }

              if (concurrency > 1) {
                // Parallel execution with semaphore
                await executeStepsParallel(
                  flowConfig as FlowStep[],
                  connector!,
                  logger!,
                  context,
                  job,
                  { delayBetweenMs, verbosityLevel, messageTimeout, variableExtractors, customVariables, errorHandling },
                  concurrency
                );
              } else {
                // Sequential execution
                for (const step of flowConfig as FlowStep[]) {
                  await ensureConnected(connector!);
                  await executeFlowStep(step, connector!, logger!, context, job, {
                    delayBetweenMs,
                    verbosityLevel,
                    messageTimeout,
                    variableExtractors,
                    customVariables,
                    errorHandling,
                  });

                  // Update progress
                  const progress =
                    ((rep * flowConfig.length + flowConfig.indexOf(step)) /
                      (repetitions * flowConfig.length)) *
                    100;
                  await job.updateProgress(progress);
                }
              }
            }
          } else if (customMessages.length > 0) {
            // Execute custom message list
            for (let rep = 0; rep < repetitions; rep++) {
              context.repetitionIndex = rep;
              console.log(`  Repetition ${rep + 1}/${repetitions}`);

              // Reset connector between repetitions if configured
              if (rep > 0 && resetBetweenRepetitions && connector) {
                console.log("  Resetting connector and context between repetitions...");
                context.conversation.clear();
                try {
                  await connector.disconnect();
                } catch (e) {
                  console.error("Disconnect during reset failed:", e);
                }
                connector = await ConnectorRegistry.create(target.connectorType, targetId, connectorConfig!);
                await connectWithRetry(connector);
              }

              if (concurrency > 1) {
                // Parallel message execution
                const semaphore = new Semaphore(concurrency);
                const messagePromises = customMessages.map(async (message, idx) => {
                  await semaphore.acquire();
                  try {
                    await ensureConnected(connector!);
                    await executeMessage(
                      substituteTemplate(applyVerbosity(message, verbosityLevel), context, customVariables),
                      connector!,
                      logger!,
                      context,
                      { messageTimeout, variableExtractors, errorHandling }
                    );
                  } finally {
                    semaphore.release();
                  }
                });
                await Promise.allSettled(messagePromises);
              } else {
                // Sequential
                for (const message of customMessages) {
                  await ensureConnected(connector!);
                  const substituted = substituteTemplate(
                    applyVerbosity(message, verbosityLevel),
                    context,
                    customVariables
                  );
                  await executeMessage(substituted, connector!, logger!, context, {
                    messageTimeout,
                    variableExtractors,
                    errorHandling,
                  });

                  if (delayBetweenMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
                  }

                  const progress =
                    ((rep * customMessages.length + customMessages.indexOf(message)) /
                      (repetitions * customMessages.length)) *
                    100;
                  await job.updateProgress(progress);
                }
              }
            }
          } else {
            throw new Error("No flow configuration or custom messages provided");
          }
        };

        if (sessionTimeout && sessionTimeout > 0) {
          await withTimeout(executeSession(), sessionTimeout, "Session execution");
        } else {
          await executeSession();
        }

        // Finalize session logger and get summary
        const summary = await logger.finalize();

        // Update session with completion status and summary
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            logPath: logger.getPath(),
            summaryMetrics: {
              messageCount: summary.messageCount,
              totalTokens: summary.totalTokens,
              avgResponseTimeMs: summary.avgResponseTimeMs,
              errorCount: summary.errorCount,
            } as any,
          },
        });

        // Disconnect connector
        if (connector) {
          try {
            await connector.disconnect();
          } catch (e) {
            console.error("Final disconnect failed:", e);
          }
        }

        console.log(`Session completed: ${sessionId}`);
        console.log(`   Messages: ${summary.messageCount}`);
        console.log(`   Tokens: ${summary.totalTokens}`);
        console.log(`   Avg response: ${summary.avgResponseTimeMs.toFixed(2)}ms`);
        console.log(`   Errors: ${summary.errorCount}`);

        // Emit webhook event (fire-and-forget, never blocks session)
        emitWebhookEvent("session.completed", {
          sessionId,
          targetId,
          scenarioId: scenarioId || null,
          targetName: target.name,
          status: "COMPLETED",
          summary: {
            messageCount: summary.messageCount,
            totalTokens: summary.totalTokens,
            avgResponseTimeMs: summary.avgResponseTimeMs,
            errorCount: summary.errorCount,
          },
          completedAt: new Date().toISOString(),
        }).catch(() => {}); // Swallow errors - emitter already logs internally

        return { success: true, sessionId, summary };
      } catch (error) {
        console.error(`Session failed: ${sessionId}`, error);

        // Log error to session logger
        if (logger) {
          await logger.logError(error as Error);
        }

        // Mark session as failed
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            logPath: logger?.getPath(),
          },
        });

        // Disconnect connector if initialized
        if (connector) {
          try {
            await connector.disconnect();
          } catch (disconnectError) {
            console.error("Failed to disconnect connector:", disconnectError);
          }
        }

        // Emit webhook event (fire-and-forget, never blocks session)
        emitWebhookEvent("session.failed", {
          sessionId,
          targetId,
          scenarioId: scenarioId || null,
          status: "FAILED",
          error: (error as Error).message,
          failedAt: new Date().toISOString(),
        }).catch(() => {}); // Swallow errors - emitter already logs internally

        throw error;
      }
    },
    {
      connection: redis,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5"),
      limiter: {
        max: 10, // Max 10 jobs per duration
        duration: 1000, // 1 second
      },
    }
  );

  // Event handlers
  worker.on("completed", (job) => {
    console.log(`Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job failed: ${job?.id}`, err);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  return worker;
}

// ─── Step Options ────────────────────────────────────────────────────────────

interface StepOptions {
  delayBetweenMs: number;
  verbosityLevel: string;
  messageTimeout: number;
  variableExtractors: Record<string, string>;
  customVariables: Record<string, unknown>;
  errorHandling?: ErrorHandlingConfig;
}

interface MessageOptions {
  messageTimeout: number;
  variableExtractors: Record<string, string>;
  errorHandling?: ErrorHandlingConfig;
}

// ─── Parallel Step Execution ─────────────────────────────────────────────────

async function executeStepsParallel(
  steps: FlowStep[],
  connector: BaseConnector,
  logger: SessionLogger,
  context: ExecutionContext,
  job: Job,
  options: StepOptions,
  concurrency: number
): Promise<void> {
  // Only message steps can run in parallel; other types run sequentially
  const semaphore = new Semaphore(concurrency);

  const stepPromises = steps.map(async (step) => {
    if (step.type === "message") {
      await semaphore.acquire();
      try {
        await ensureConnected(connector);
        await executeFlowStep(step, connector, logger, context, job, options);
      } finally {
        semaphore.release();
      }
    } else {
      // Non-message steps (delay, conditional, loop) always run sequentially
      await executeFlowStep(step, connector, logger, context, job, options);
    }
  });

  await Promise.allSettled(stepPromises);
}

// ─── Flow Step Execution ─────────────────────────────────────────────────────

async function executeFlowStep(
  step: FlowStep,
  connector: BaseConnector,
  logger: SessionLogger,
  context: ExecutionContext,
  job: Job,
  options: StepOptions
): Promise<void> {
  switch (step.type) {
    case "message": {
      const rawMessage = (step.config.content ?? step.config.message) as string;
      const substituted = substituteTemplate(rawMessage, context, options.customVariables);
      const verboseMessage = applyVerbosity(substituted, options.verbosityLevel);
      await executeMessage(verboseMessage, connector, logger, context, {
        messageTimeout: options.messageTimeout,
        variableExtractors: options.variableExtractors,
        errorHandling: options.errorHandling,
      });
      break;
    }

    case "delay": {
      const duration = (step.config.durationMs as number) || options.delayBetweenMs;
      console.log(`    Delaying for ${duration}ms`);
      await new Promise((resolve) => setTimeout(resolve, duration));
      break;
    }

    case "conditional": {
      const condition = step.config.condition as string;
      const matches = evaluateCondition(condition, context.lastResponse);
      console.log(`    Conditional: ${condition} = ${matches}`);

      if (matches && step.config.thenSteps) {
        const thenSteps = step.config.thenSteps as FlowStep[];
        for (const thenStep of thenSteps) {
          await executeFlowStep(thenStep, connector, logger, context, job, options);
        }
      } else if (!matches && step.config.elseSteps) {
        const elseSteps = step.config.elseSteps as FlowStep[];
        for (const elseStep of elseSteps) {
          await executeFlowStep(elseStep, connector, logger, context, job, options);
        }
      }
      break;
    }

    case "loop": {
      const iterations = (step.config.iterations as number) || 1;
      const loopSteps = (step.config.steps as FlowStep[]) || [];
      console.log(`    Loop: ${iterations} iterations`);

      for (let i = 0; i < iterations; i++) {
        for (const loopStep of loopSteps) {
          await executeFlowStep(loopStep, connector, logger, context, job, options);
        }
      }
      break;
    }

    default:
      console.warn(`    Unknown step type: ${step.type}`);
  }
}

// ─── Message Execution ───────────────────────────────────────────────────────

async function executeMessage(
  message: string,
  connector: BaseConnector,
  logger: SessionLogger,
  context: ExecutionContext,
  options: MessageOptions
): Promise<void> {
  const startTime = Date.now();
  const index = context.messageIndex++;

  console.log(`    Message ${index + 1}: ${message.substring(0, 50)}...`);

  try {
    // Apply rate limiting if configured
    if (context.rateLimiter) {
      const acquired = await context.rateLimiter.acquire();
      if (!acquired) {
        console.log(`    Message ${index + 1}: dropped by rate limiter`);
        return; // Dropped by rate limiter (backpressure strategy = "drop")
      }
    }

    // Track user message in conversation context
    context.conversation.addMessage("user", message);

    // Send message with per-message timeout
    // Forward headers from conversation context are available via context.conversation.getForwardHeaders()
    // for connectors that support custom headers per-request
    const sendPromise = connector.sendMessage(message, {
      sessionId: context.sessionId,
      messageIndex: index,
      timestamp: new Date(),
    });

    const response = await withTimeout(
      sendPromise,
      options.messageTimeout,
      `Message ${index + 1}`
    );

    const responseTimeMs = Date.now() - startTime;

    // Track assistant response in conversation context
    context.conversation.addMessage("assistant", response.content);

    // Parse response for conversation ID and session token extraction
    let parsedResponse: unknown = response.content;
    try {
      parsedResponse = JSON.parse(response.content);
    } catch {
      // Response is not JSON - use raw string
    }

    // Process response to extract conversation IDs and session tokens
    context.conversation.processResponse(
      parsedResponse,
      response.metadata?.headers
    );

    // Update context with last response
    context.lastResponse = response.content;

    // Extract variables from response if extractors are configured
    if (Object.keys(options.variableExtractors).length > 0) {
      for (const [varName, jsonPath] of Object.entries(options.variableExtractors)) {
        const extracted = extractValueAtPath(parsedResponse, jsonPath);
        if (extracted !== undefined) {
          context.variables[varName] = extracted;
        }
      }
    }

    // Log sent message entry
    const entry: MessageLogEntry = {
      index,
      timestamp: new Date().toISOString(),
      direction: "sent",
      content: message,
      responseTimeMs,
      tokenUsage: response.metadata?.tokenUsage,
      success: true,
      metadata: {
        endpoint: (connector as any).config?.endpoint,
        conversationId: context.conversation.conversationId,
      },
    };

    logger.logMessage(entry);

    // Log response entry
    const responseEntry: MessageLogEntry = {
      index,
      timestamp: new Date().toISOString(),
      direction: "received",
      content: response.content,
      responseTimeMs,
      tokenUsage: response.metadata?.tokenUsage,
      success: true,
      metadata: {
        conversationId: context.conversation.conversationId,
        messageCount: context.conversation.getMessageCount(),
        contextTokens: context.conversation.getTokenCount(),
      },
    };

    logger.logMessage(responseEntry);

    console.log(`    Response received (${responseTimeMs}ms, context: ${context.conversation.getMessageCount()} msgs, ~${context.conversation.getTokenCount()} tokens)`);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const isTimeout = (error as Error).message.includes("timed out");
    const statusCode = error instanceof ConnectorError ? error.statusCode : undefined;

    // Log error entry
    const errorEntry: MessageLogEntry = {
      index,
      timestamp: new Date().toISOString(),
      direction: "sent",
      content: message,
      responseTimeMs,
      success: false,
      error: (error as Error).message,
      metadata: {
        timedOut: isTimeout,
        statusCode,
      },
    };

    logger.logMessage(errorEntry);

    console.error(`    Message failed${isTimeout ? " (timeout)" : ""}: ${(error as Error).message}`);

    // Resolve error action based on config and status code
    const action = resolveErrorAction(options.errorHandling, statusCode);

    if (action.type === "abort") {
      throw error;
    }

    if (action.type === "retry") {
      let lastAttemptError = error;
      for (let attempt = 1; attempt <= action.maxRetries; attempt++) {
        const delay = Math.min(
          action.delayMs * Math.pow(action.backoffMultiplier, attempt - 1),
          action.maxDelayMs
        );
        console.log(`    Retry ${attempt}/${action.maxRetries} after ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          const retryStart = Date.now();
          const retryResponse = await withTimeout(
            connector.sendMessage(message, {
              sessionId: context.sessionId,
              messageIndex: index,
              timestamp: new Date(),
            }),
            options.messageTimeout,
            `Message ${index + 1} retry ${attempt}`
          );

          const retryResponseTimeMs = Date.now() - retryStart;

          // Success on retry - update context and log
          context.conversation.addMessage("assistant", retryResponse.content);
          context.lastResponse = retryResponse.content;

          const retryEntry: MessageLogEntry = {
            index,
            timestamp: new Date().toISOString(),
            direction: "received",
            content: retryResponse.content,
            responseTimeMs: retryResponseTimeMs,
            tokenUsage: retryResponse.metadata?.tokenUsage,
            success: true,
            metadata: {
              retryAttempt: attempt,
            },
          };
          logger.logMessage(retryEntry);

          console.log(`    Retry ${attempt} succeeded (${retryResponseTimeMs}ms)`);
          return; // Success - exit catch block
        } catch (retryError) {
          lastAttemptError = retryError;
          console.error(`    Retry ${attempt} failed: ${(retryError as Error).message}`);
        }
      }

      // All retries exhausted - log and skip (fall through)
      console.error(`    All ${action.maxRetries} retries exhausted, skipping message`);
    }

    // "skip" (default) - continue with next message
  }
}

// ─── Verbosity ───────────────────────────────────────────────────────────────

function applyVerbosity(message: string, verbosityLevel: string): string {
  switch (verbosityLevel) {
    case "verbose":
      return `${message}\n\nPlease provide a detailed response with examples and explanations.`;
    case "extreme":
      return `${message}\n\nPlease provide an extremely detailed response with comprehensive examples, step-by-step explanations, code samples, and any relevant context. Be as verbose as possible.`;
    default:
      return message;
  }
}

// ─── Condition Evaluation ────────────────────────────────────────────────────

function evaluateCondition(condition: string, response: string): boolean {
  // Supports: contains:text, matches:regex, length>N, length<N
  if (condition.startsWith("contains:")) {
    const text = condition.substring(9);
    return response.toLowerCase().includes(text.toLowerCase());
  }

  if (condition.startsWith("matches:")) {
    const pattern = condition.substring(8);
    const regex = new RegExp(pattern, "i");
    return regex.test(response);
  }

  if (condition.startsWith("length>")) {
    const threshold = parseInt(condition.substring(7), 10);
    return response.length > threshold;
  }

  if (condition.startsWith("length<")) {
    const threshold = parseInt(condition.substring(7), 10);
    return response.length < threshold;
  }

  return false;
}
