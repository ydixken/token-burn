import { Queue, QueueEvents } from "bullmq";
import { redis } from "@/lib/cache/redis";

// Session execution queue
export const sessionQueue = new Queue("session-execution", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs
      age: 7 * 24 * 3600, // Keep for 7 days
    },
  },
});

// Metrics aggregation queue
export const metricsQueue = new Queue("metrics-aggregation", {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      count: 50,
      age: 12 * 3600, // Keep for 12 hours
    },
    removeOnFail: {
      count: 200,
      age: 3 * 24 * 3600, // Keep for 3 days
    },
  },
});

// Queue events for monitoring
export const sessionQueueEvents = new QueueEvents("session-execution", {
  connection: redis,
});

export const metricsQueueEvents = new QueueEvents("metrics-aggregation", {
  connection: redis,
});

// Job data types
export interface SessionJobData {
  sessionId: string;
  targetId: string;
  scenarioId: string | null;
  executionConfig: ExecutionConfig;
}

export interface MetricsJobData {
  sessionId: string;
}

export interface ExecutionConfig {
  flowConfig?: FlowStep[];
  customMessages?: string[];
  repetitions?: number;
  concurrency?: number;
  delayBetweenMs?: number;
  verbosityLevel?: "normal" | "verbose" | "extreme";
  messageTemplates?: Record<string, unknown>;
  timeout?: number; // session-level timeout in ms
  messageTimeout?: number; // per-message timeout in ms (default 30000)
  resetBetweenRepetitions?: boolean; // disconnect/reconnect between reps
  variableExtractors?: Record<string, string>; // name → JSON path to extract from response
}

export interface FlowStep {
  id: string;
  type: "message" | "delay" | "conditional" | "loop";
  config: Record<string, unknown>;
  next?: string;
}

// Helper functions
export async function addSessionJob(data: SessionJobData) {
  return sessionQueue.add("execute", data, {
    jobId: data.sessionId, // Use session ID as job ID for idempotency
  });
}

export async function addMetricsJob(data: MetricsJobData) {
  return metricsQueue.add("aggregate", data);
}

// Get queue stats
export async function getSessionQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    sessionQueue.getWaitingCount(),
    sessionQueue.getActiveCount(),
    sessionQueue.getCompletedCount(),
    sessionQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active,
  };
}

export async function getMetricsQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    metricsQueue.getWaitingCount(),
    metricsQueue.getActiveCount(),
    metricsQueue.getCompletedCount(),
    metricsQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active,
  };
}

// Cleanup function
export async function closeQueues() {
  await Promise.all([
    sessionQueue.close(),
    metricsQueue.close(),
    sessionQueueEvents.close(),
    metricsQueueEvents.close(),
  ]);
}
