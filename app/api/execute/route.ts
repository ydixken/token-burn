import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { addSessionJob } from "@/lib/jobs/queue";
import { z } from "zod";

// Validation schema for execute request
const ExecuteRequestSchema = z.object({
  targetId: z.string().cuid(),
  scenarioId: z.string().cuid().optional(),
  executionConfig: z
    .object({
      repetitions: z.number().int().min(1).max(1000).optional(),
      concurrency: z.number().int().min(1).max(10).optional(),
      delayBetweenMs: z.number().int().min(0).max(60000).optional(),
      messageTemplates: z.record(z.unknown()).optional(),
      verbosityLevel: z.enum(["normal", "verbose", "extreme"]).optional(),
      customMessages: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * POST /api/execute
 * Fire-and-forget session execution endpoint
 * Creates a session record, queues a job, and returns immediately
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validated = ExecuteRequestSchema.parse(body);

    // Check if target exists and is active
    const target = await prisma.target.findUnique({
      where: { id: validated.targetId },
    });

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: "Target not found",
        },
        { status: 404 }
      );
    }

    if (!target.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "Target is not active",
        },
        { status: 400 }
      );
    }

    // If scenarioId provided, check if scenario exists
    let scenario = null;
    if (validated.scenarioId) {
      scenario = await prisma.scenario.findUnique({
        where: { id: validated.scenarioId },
      });

      if (!scenario) {
        return NextResponse.json(
          {
            success: false,
            error: "Scenario not found",
          },
          { status: 404 }
        );
      }

      if (!scenario.isActive) {
        return NextResponse.json(
          {
            success: false,
            error: "Scenario is not active",
          },
          { status: 400 }
        );
      }
    }

    // Build execution configuration (merge scenario config with request overrides)
    const executionConfig = {
      ...(scenario
        ? {
            flowConfig: scenario.flowConfig,
            repetitions: scenario.repetitions,
            concurrency: scenario.concurrency,
            delayBetweenMs: scenario.delayBetweenMs,
            messageTemplates: scenario.messageTemplates,
            verbosityLevel: scenario.verbosityLevel,
          }
        : {}),
      ...(validated.executionConfig || {}),
    };

    // Validate that we have either a scenario or custom messages
    if (!scenario && !validated.executionConfig?.customMessages) {
      return NextResponse.json(
        {
          success: false,
          error: "Either scenarioId or executionConfig.customMessages is required",
        },
        { status: 400 }
      );
    }

    // Create session record
    const session = await prisma.session.create({
      data: {
        targetId: validated.targetId,
        scenarioId: validated.scenarioId,
        status: "PENDING",
        executionConfig: executionConfig as any,
        startedAt: new Date(),
      },
    });

    // Add job to BullMQ queue
    await addSessionJob({
      sessionId: session.id,
      targetId: validated.targetId,
      scenarioId: validated.scenarioId || null,
      executionConfig,
    });

    // Update session status to QUEUED
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "QUEUED" },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          sessionId: session.id,
          status: "QUEUED",
          message: "Session queued for execution",
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("POST /api/execute error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute session",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
