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

// Validation schema for creating a scenario
const CreateScenarioSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  flowConfig: z.array(FlowStepSchema),
  repetitions: z.number().int().min(1).max(1000).default(1),
  concurrency: z.number().int().min(1).max(100).default(1),
  delayBetweenMs: z.number().int().min(0).max(60000).default(0),
  verbosityLevel: z.number().int().min(1).max(5).default(1),
  messageTemplates: z.record(z.unknown()).default({}),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

/**
 * GET /api/scenarios
 * List all scenarios
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const isPublic = searchParams.get("isPublic");

    const where: any = {};

    if (category) {
      where.category = category;
    }

    if (isPublic !== null) {
      where.isPublic = isPublic === "true";
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
        isPublic: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            sessions: true,
            targets: true,
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
        flowConfig: validated.flowConfig,
        repetitions: validated.repetitions,
        concurrency: validated.concurrency,
        delayBetweenMs: validated.delayBetweenMs,
        verbosityLevel: validated.verbosityLevel,
        messageTemplates: validated.messageTemplates,
        isPublic: validated.isPublic,
        tags: validated.tags,
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
