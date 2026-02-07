import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

// Validation schema for flow step
const FlowStepSchema = z.object({
  id: z.string(),
  type: z.enum(["message", "delay", "conditional", "loop"]),
  config: z.record(z.unknown()),
  next: z.string().optional(),
});

// Validation schema for error handling configuration
const ErrorHandlingSchema = z.object({
  onError: z.enum(["skip", "abort", "retry"]).default("skip"),
  retryConfig: z.object({
    maxRetries: z.number().int().min(0).max(100).default(3),
    delayMs: z.number().int().min(100).max(60000).default(1000),
    backoffMultiplier: z.number().min(1).max(10).default(1.5),
    maxDelayMs: z.number().int().min(1000).max(300000).default(30000),
  }).optional(),
  statusCodeRules: z.array(z.object({
    codes: z.array(z.number().int().min(100).max(599)),
    action: z.enum(["skip", "abort", "retry"]),
    retryConfig: z.object({
      maxRetries: z.number().int().min(0).max(100),
      delayMs: z.number().int().min(100).max(60000),
    }).optional(),
  })).max(10).optional(),
}).optional();

// Validation schema for creating a scenario
const CreateScenarioSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  flowConfig: z.array(FlowStepSchema),
  repetitions: z.number().int().min(1).max(1000).default(1),
  concurrency: z.number().int().min(1).max(100).default(1),
  delayBetweenMs: z.number().int().min(0).max(60000).default(0),
  verbosityLevel: z.string().default("normal"),
  messageTemplates: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  errorHandling: ErrorHandlingSchema,
});

/**
 * GET /api/scenarios
 * List all scenarios
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const isActive = searchParams.get("isActive");

    const where: any = {};

    if (category) {
      where.category = category;
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const scenarios = await prisma.scenario.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        repetitions: true,
        concurrency: true,
        verbosityLevel: true,
        isActive: true,
        errorHandling: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: scenarios,
      count: scenarios.length,
    });
  } catch (error) {
    console.error("GET /api/scenarios error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scenarios",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scenarios
 * Create a new scenario
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validated = CreateScenarioSchema.parse(body);

    // Create scenario in database
    const scenario = await prisma.scenario.create({
      data: {
        name: validated.name,
        description: validated.description,
        category: validated.category,
        flowConfig: validated.flowConfig as any,
        repetitions: validated.repetitions,
        concurrency: validated.concurrency,
        delayBetweenMs: validated.delayBetweenMs,
        verbosityLevel: validated.verbosityLevel,
        messageTemplates: validated.messageTemplates as any,
        isActive: validated.isActive,
        errorHandling: validated.errorHandling as any,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description,
          category: scenario.category,
          repetitions: scenario.repetitions,
          concurrency: scenario.concurrency,
          verbosityLevel: scenario.verbosityLevel,
          createdAt: scenario.createdAt,
        },
        message: "Scenario created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/scenarios error:", error);

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
        error: "Failed to create scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
