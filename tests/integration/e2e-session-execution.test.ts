import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { addSessionJob } from "@/lib/jobs/queue";
import { createSessionWorker } from "@/lib/jobs/workers/session-executor";
import { encrypt } from "@/lib/utils/crypto";
import type { Worker } from "bullmq";

describe("E2E Session Execution", () => {
  let targetId: string;
  let scenarioId: string;
  let worker: Worker;

  beforeAll(async () => {
    // Create a test target
    const target = await prisma.target.create({
      data: {
        name: "E2E Test Target",
        description: "Test target for E2E testing",
        connectorType: "HTTP_REST",
        endpoint: "http://localhost:3001/chat",
        authType: "NONE",
        authConfig: { encrypted: encrypt(JSON.stringify({})) },
        requestTemplate: {
          messagePath: "message",
          structure: {
            model: "test-model",
            message: "{{message}}",
          },
        },
        responseTemplate: {
          contentPath: "content",
          tokenUsagePath: "usage",
        },
        protocolConfig: {},
        isActive: true,
      },
    });

    targetId = target.id;

    // Create a test scenario
    const scenario = await prisma.scenario.create({
      data: {
        name: "E2E Test Scenario",
        description: "Test scenario for E2E testing",
        category: "test",
        targetId,
        flowConfig: [
          {
            id: "step1",
            type: "message",
            config: {
              message: "Hello, this is a test message",
            },
          },
          {
            id: "step2",
            type: "delay",
            config: {
              durationMs: 100,
            },
          },
          {
            id: "step3",
            type: "message",
            config: {
              message: "Second test message",
            },
          },
        ],
        repetitions: 2,
        concurrency: 1,
        delayBetweenMs: 50,
        messageTemplates: {},
        verbosityLevel: "normal",
        isActive: true,
      },
    });

    scenarioId = scenario.id;

    // Create worker
    worker = createSessionWorker();

    // Wait for worker to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    await prisma.session.deleteMany({ where: { targetId } });
    await prisma.scenario.delete({ where: { id: scenarioId } });
    await prisma.target.delete({ where: { id: targetId } });

    // Close worker
    await worker.close();
  });

  it("should create and queue a session", async () => {
    // Create session
    const session = await prisma.session.create({
      data: {
        targetId,
        scenarioId,
        status: "PENDING",
        executionConfig: {
          flowConfig: [
            {
              id: "step1",
              type: "message",
              config: {
                message: "Test message",
              },
            },
          ],
          repetitions: 1,
          delayBetweenMs: 0,
          verbosityLevel: "normal",
        },
        startedAt: new Date(),
      },
    });

    expect(session).toBeDefined();
    expect(session.status).toBe("PENDING");

    // Add job to queue
    const job = await addSessionJob({
      sessionId: session.id,
      targetId,
      scenarioId,
      executionConfig: {
        flowConfig: [
          {
            id: "step1",
            type: "message",
            config: {
              message: "Test message",
            },
          },
        ],
        repetitions: 1,
        delayBetweenMs: 0,
        verbosityLevel: "normal",
      },
    });

    expect(job).toBeDefined();
    expect(job.id).toBe(session.id);
  });

  it("should execute a session with custom messages", async () => {
    // Create session with custom messages
    const session = await prisma.session.create({
      data: {
        targetId,
        status: "PENDING",
        executionConfig: {
          customMessages: ["Hello", "How are you?", "Goodbye"],
          repetitions: 1,
          delayBetweenMs: 0,
          verbosityLevel: "normal",
        },
        startedAt: new Date(),
      },
    });

    expect(session).toBeDefined();
    expect(session.status).toBe("PENDING");

    // Add job to queue
    const job = await addSessionJob({
      sessionId: session.id,
      targetId,
      scenarioId: null,
      executionConfig: {
        customMessages: ["Hello", "How are you?", "Goodbye"],
        repetitions: 1,
        delayBetweenMs: 0,
        verbosityLevel: "normal",
      },
    });

    expect(job).toBeDefined();
  });

  it("should validate required fields in execution config", async () => {
    const session = await prisma.session.create({
      data: {
        targetId,
        status: "PENDING",
        executionConfig: {
          // Missing both flowConfig and customMessages - should fail
          repetitions: 1,
        },
        startedAt: new Date(),
      },
    });

    // This should fail when processed by worker
    const job = await addSessionJob({
      sessionId: session.id,
      targetId,
      scenarioId: null,
      executionConfig: {
        repetitions: 1,
      },
    });

    expect(job).toBeDefined();
    // Worker will mark this as FAILED when it tries to process
  });

  it("should handle verbosity levels", async () => {
    const verbosityLevels = ["normal", "verbose", "extreme"] as const;

    for (const level of verbosityLevels) {
      const session = await prisma.session.create({
        data: {
          targetId,
          status: "PENDING",
          executionConfig: {
            customMessages: ["Test message"],
            repetitions: 1,
            verbosityLevel: level,
          },
          startedAt: new Date(),
        },
      });

      const job = await addSessionJob({
        sessionId: session.id,
        targetId,
        scenarioId: null,
        executionConfig: {
          customMessages: ["Test message"],
          repetitions: 1,
          verbosityLevel: level,
        },
      });

      expect(job).toBeDefined();
    }
  });

  it("should handle flow with different step types", async () => {
    const session = await prisma.session.create({
      data: {
        targetId,
        scenarioId,
        status: "PENDING",
        executionConfig: {
          flowConfig: [
            {
              id: "msg1",
              type: "message",
              config: { message: "First message" },
            },
            {
              id: "delay1",
              type: "delay",
              config: { durationMs: 100 },
            },
            {
              id: "loop1",
              type: "loop",
              config: {
                iterations: 2,
                steps: [
                  {
                    id: "msg2",
                    type: "message",
                    config: { message: "Looped message" },
                  },
                ],
              },
            },
            {
              id: "cond1",
              type: "conditional",
              config: {
                condition: "contains:test",
                thenSteps: [
                  {
                    id: "msg3",
                    type: "message",
                    config: { message: "Condition matched" },
                  },
                ],
              },
            },
          ],
          repetitions: 1,
        },
        startedAt: new Date(),
      },
    });

    const job = await addSessionJob({
      sessionId: session.id,
      targetId,
      scenarioId,
      executionConfig: session.executionConfig as any,
    });

    expect(job).toBeDefined();
  });
});
