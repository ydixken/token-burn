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

// Validation schema for updating a scenario
const UpdateScenarioSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  flowConfig: z.array(FlowStepSchema).optional(),
  repetitions: z.number().int().min(1).max(1000).optional(),
  concurrency: z.number().int().min(1).max(100).optional(),
  delayBetweenMs: z.number().int().min(0).max(60000).optional(),
  verbosityLevel: z.string().optional(),
  messageTemplates: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  errorHandling: ErrorHandlingSchema,
});

/**
 * GET /api/scenarios/[id]
 * Get a single scenario by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        target: { select: { id: true, name: true } },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
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

    return NextResponse.json({
      success: true,
      data: {
        ...scenario,
        sessionCount: scenario._count.sessions,
      },
    });
  } catch (error) {
    console.error(`GET /api/scenarios/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/scenarios/[id]
 * Update a scenario
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();

    // Validate request body
    const validated = UpdateScenarioSchema.parse(body);

    // Check if scenario exists
    const existing = await prisma.scenario.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Scenario not found",
        },
        { status: 404 }
      );
    }

    // Update scenario in database
    const scenario = await prisma.scenario.update({
      where: { id },
      data: validated as any,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        category: scenario.category,
        repetitions: scenario.repetitions,
        concurrency: scenario.concurrency,
        verbosityLevel: scenario.verbosityLevel,
        updatedAt: scenario.updatedAt,
      },
      message: "Scenario updated successfully",
    });
  } catch (error) {
    console.error(`PUT /api/scenarios/${id} error:`, error);

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
        error: "Failed to update scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scenarios/[id]
 * Delete a scenario
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Check if scenario exists
    const existing = await prisma.scenario.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Scenario not found",
        },
        { status: 404 }
      );
    }

    // Check if scenario has sessions
    if (existing._count.sessions > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete scenario with existing sessions",
          message: `This scenario has ${existing._count.sessions} session(s). Delete sessions first or archive the scenario instead.`,
        },
        { status: 400 }
      );
    }

    // Delete scenario
    await prisma.scenario.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Scenario deleted successfully",
    });
  } catch (error) {
    console.error(`DELETE /api/scenarios/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
