import { Worker, Job } from "bullmq";
import { redis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/client";
import { ConnectorRegistry } from "@/lib/connectors/registry";
import { SessionLogger, MessageLogEntry } from "@/lib/storage/session-logger";
import type { SessionJobData } from "../queue";
import type { BaseConnector } from "@/lib/connectors/base";

interface FlowStep {
  id: string;
  type: "message" | "delay" | "conditional" | "loop";
  config: Record<string, unknown>;
  next?: string;
}

interface ExecutionContext {
  variables: Record<string, unknown>;
  messageIndex: number;
  lastResponse: string;
}

// Session executor worker
export function createSessionWorker() {
  const worker = new Worker<SessionJobData>(
    "session-execution",
    async (job: Job<SessionJobData>) => {
      const { sessionId, targetId, scenarioId, executionConfig } = job.data;

      console.log(`🚀 Starting session execution: ${sessionId}`);

      let connector: BaseConnector | null = null;
      let logger: SessionLogger | null = null;

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

        // Initialize connector
        connector = ConnectorRegistry.create(target.connectorType, targetId, {
          endpoint: target.endpoint,
          authType: target.authType,
          authConfig: target.authConfig as any,
          requestTemplate: target.requestTemplate as any,
          responseTemplate: target.responseTemplate as any,
          protocolConfig: target.protocolConfig as any,
        });

        await connector.connect();

        // Initialize session logger
        logger = new SessionLogger(sessionId);
        await logger.initialize({
          sessionId,
          targetId,
          scenarioId: scenarioId || undefined,
          startedAt: new Date().toISOString(),
          executionConfig: executionConfig as any,
        });

        // Initialize execution context
        const context: ExecutionContext = {
          variables: {},
          messageIndex: 0,
          lastResponse: "",
        };

        // Determine flow configuration
        const flowConfig = executionConfig.flowConfig || [];
        const customMessages = executionConfig.customMessages || [];
        const repetitions = executionConfig.repetitions || 1;
        const delayBetweenMs = executionConfig.delayBetweenMs || 0;
        const verbosityLevel = executionConfig.verbosityLevel || "normal";

        // Execute scenario flow or custom messages
        if (flowConfig.length > 0) {
          // Execute structured flow
          for (let rep = 0; rep < repetitions; rep++) {
            console.log(`  📝 Repetition ${rep + 1}/${repetitions}`);

            for (const step of flowConfig as FlowStep[]) {
              await executeFlowStep(step, connector, logger, context, job, {
                delayBetweenMs,
                verbosityLevel,
              });

              // Update progress
              const progress =
                ((rep * flowConfig.length + flowConfig.indexOf(step)) /
                  (repetitions * flowConfig.length)) *
                100;
              await job.updateProgress(progress);
            }
          }
        } else if (customMessages.length > 0) {
          // Execute custom message list
          for (let rep = 0; rep < repetitions; rep++) {
            console.log(`  📝 Repetition ${rep + 1}/${repetitions}`);

            for (const message of customMessages) {
              await executeMessage(
                applyVerbosity(message, verbosityLevel),
                connector,
                logger,
                context
              );

              // Delay between messages
              if (delayBetweenMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
              }

              // Update progress
              const progress =
                ((rep * customMessages.length + customMessages.indexOf(message)) /
                  (repetitions * customMessages.length)) *
                100;
              await job.updateProgress(progress);
            }
          }
        } else {
          throw new Error("No flow configuration or custom messages provided");
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
        await connector.disconnect();

        console.log(`✅ Session completed: ${sessionId}`);
        console.log(`   📊 Messages: ${summary.messageCount}`);
        console.log(`   🪙 Tokens: ${summary.totalTokens}`);
        console.log(`   ⏱️  Avg response: ${summary.avgResponseTimeMs.toFixed(2)}ms`);
        console.log(`   ❌ Errors: ${summary.errorCount}`);

        return { success: true, sessionId, summary };
      } catch (error) {
        console.error(`❌ Session failed: ${sessionId}`, error);

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
    console.log(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  worker.on("error", (err) => {
    console.error("❌ Worker error:", err);
  });

  return worker;
}

/**
 * Execute a single flow step
 */
async function executeFlowStep(
  step: FlowStep,
  connector: BaseConnector,
  logger: SessionLogger,
  context: ExecutionContext,
  job: Job,
  options: { delayBetweenMs: number; verbosityLevel: string }
): Promise<void> {
  switch (step.type) {
    case "message": {
      const message = step.config.message as string;
      const verboseMessage = applyVerbosity(message, options.verbosityLevel);
      await executeMessage(verboseMessage, connector, logger, context);
      break;
    }

    case "delay": {
      const duration = (step.config.durationMs as number) || options.delayBetweenMs;
      console.log(`    ⏸️  Delaying for ${duration}ms`);
      await new Promise((resolve) => setTimeout(resolve, duration));
      break;
    }

    case "conditional": {
      // Conditional logic based on last response
      const condition = step.config.condition as string;
      const matches = evaluateCondition(condition, context.lastResponse);
      console.log(`    🔀 Conditional: ${condition} = ${matches}`);

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
      console.log(`    🔁 Loop: ${iterations} iterations`);

      for (let i = 0; i < iterations; i++) {
        for (const loopStep of loopSteps) {
          await executeFlowStep(loopStep, connector, logger, context, job, options);
        }
      }
      break;
    }

    default:
      console.warn(`    ⚠️  Unknown step type: ${step.type}`);
  }
}

/**
 * Execute a single message exchange
 */
async function executeMessage(
  message: string,
  connector: BaseConnector,
  logger: SessionLogger,
  context: ExecutionContext
): Promise<void> {
  const startTime = Date.now();
  const index = context.messageIndex++;

  console.log(`    💬 Message ${index + 1}: ${message.substring(0, 50)}...`);

  try {
    // Send message to connector
    const response = await connector.sendMessage(message, {
      sessionId: logger.isInitialized() ? "session" : "unknown",
      messageIndex: index,
    });

    const responseTimeMs = Date.now() - startTime;

    // Update context
    context.lastResponse = response.content;

    // Log message entry
    const entry: MessageLogEntry = {
      index,
      timestamp: new Date().toISOString(),
      direction: "sent",
      content: message,
      responseTimeMs,
      tokenUsage: response.tokenUsage,
      success: true,
      metadata: {
        endpoint: connector["config"]?.endpoint,
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
      tokenUsage: response.tokenUsage,
      success: true,
    };

    logger.logMessage(responseEntry);

    console.log(`    ✅ Response received (${responseTimeMs}ms)`);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    // Log error entry
    const errorEntry: MessageLogEntry = {
      index,
      timestamp: new Date().toISOString(),
      direction: "sent",
      content: message,
      responseTimeMs,
      success: false,
      error: (error as Error).message,
    };

    logger.logMessage(errorEntry);

    console.error(`    ❌ Message failed: ${(error as Error).message}`);

    // Don't throw - continue with next message
  }
}

/**
 * Apply verbosity level to message
 */
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

/**
 * Evaluate a conditional expression
 */
function evaluateCondition(condition: string, response: string): boolean {
  // Simple condition evaluation
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

  // Default: always false for unknown conditions
  return false;
}
