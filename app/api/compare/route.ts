import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const CreateComparisonSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sessionAId: z.string().min(1),
  sessionBId: z.string().min(1),
});

/**
 * POST /api/compare
 * Create a new A/B comparison between two completed sessions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateComparisonSchema.parse(body);

    if (data.sessionAId === data.sessionBId) {
      return NextResponse.json(
        { success: false, error: "Cannot compare a session with itself" },
        { status: 400 }
      );
    }

    // Fetch both sessions with summary metrics
    const [sessionA, sessionB] = await Promise.all([
      prisma.session.findUnique({
        where: { id: data.sessionAId },
        include: { target: { select: { name: true } } },
      }),
      prisma.session.findUnique({
        where: { id: data.sessionBId },
        include: { target: { select: { name: true } } },
      }),
    ]);

    if (!sessionA) {
      return NextResponse.json(
        { success: false, error: `Session A not found: ${data.sessionAId}` },
        { status: 404 }
      );
    }
    if (!sessionB) {
      return NextResponse.json(
        { success: false, error: `Session B not found: ${data.sessionBId}` },
        { status: 404 }
      );
    }

    if (sessionA.status !== "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          error: `Session A is not completed (status: ${sessionA.status})`,
        },
        { status: 400 }
      );
    }
    if (sessionB.status !== "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          error: `Session B is not completed (status: ${sessionB.status})`,
        },
        { status: 400 }
      );
    }

    // Compute comparison results from summary metrics
    const results = computeComparisonResults(
      sessionA.summaryMetrics as any,
      sessionB.summaryMetrics as any
    );

    // Create comparison record
    const comparison = await prisma.comparison.create({
      data: {
        name: data.name,
        description: data.description,
        sessionAId: data.sessionAId,
        sessionBId: data.sessionBId,
        results: results as any,
        status: "completed",
      },
      include: {
        sessionA: {
          select: { id: true, target: { select: { name: true } }, summaryMetrics: true },
        },
        sessionB: {
          select: { id: true, target: { select: { name: true } }, summaryMetrics: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: formatComparison(comparison),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("POST /api/compare error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create comparison",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compare
 * List all comparisons with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const [comparisons, total] = await Promise.all([
      prisma.comparison.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          sessionA: {
            select: { id: true, target: { select: { name: true } }, summaryMetrics: true },
          },
          sessionB: {
            select: { id: true, target: { select: { name: true } }, summaryMetrics: true },
          },
        },
      }),
      prisma.comparison.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: comparisons.map(formatComparison),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/compare error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list comparisons",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SummaryMetrics {
  messageCount?: number;
  totalTokens?: number;
  avgResponseTimeMs?: number;
  errorCount?: number;
  p50ResponseTimeMs?: number;
  p95ResponseTimeMs?: number;
  p99ResponseTimeMs?: number;
}

function computeComparisonResults(
  metricsA: SummaryMetrics | null,
  metricsB: SummaryMetrics | null
) {
  const a = metricsA || {};
  const b = metricsB || {};

  const aResponseTime = a.avgResponseTimeMs ?? 0;
  const bResponseTime = b.avgResponseTimeMs ?? 0;
  const aTokens = a.totalTokens ?? 0;
  const bTokens = b.totalTokens ?? 0;
  const aMessages = a.messageCount ?? 0;
  const bMessages = b.messageCount ?? 0;
  const aErrors = a.errorCount ?? 0;
  const bErrors = b.errorCount ?? 0;
  const aErrorRate = aMessages > 0 ? aErrors / aMessages : 0;
  const bErrorRate = bMessages > 0 ? bErrors / bMessages : 0;

  const responseTimeDiff = aResponseTime - bResponseTime;
  const tokenDiff = aTokens - bTokens;

  // Determine winner: lower response time and tokens is better, lower error rate is better
  let winner: "A" | "B" | "tie" = "tie";
  let aScore = 0;
  let bScore = 0;

  if (aResponseTime < bResponseTime) aScore++;
  else if (bResponseTime < aResponseTime) bScore++;

  if (aTokens < bTokens) aScore++;
  else if (bTokens < aTokens) bScore++;

  if (aErrorRate < bErrorRate) aScore++;
  else if (bErrorRate < aErrorRate) bScore++;

  if (aScore > bScore) winner = "A";
  else if (bScore > aScore) winner = "B";

  return {
    responseTime: {
      a: aResponseTime,
      b: bResponseTime,
      diff: round(responseTimeDiff),
      diffPercent: aResponseTime > 0 ? round((responseTimeDiff / aResponseTime) * 100) : 0,
    },
    tokenUsage: {
      a: aTokens,
      b: bTokens,
      diff: tokenDiff,
      diffPercent: aTokens > 0 ? round((tokenDiff / aTokens) * 100) : 0,
    },
    errorRate: {
      a: round(aErrorRate),
      b: round(bErrorRate),
      diff: round(aErrorRate - bErrorRate),
    },
    messageCount: {
      a: aMessages,
      b: bMessages,
      diff: aMessages - bMessages,
    },
    winner,
  };
}

function formatComparison(comparison: any) {
  return {
    id: comparison.id,
    name: comparison.name,
    description: comparison.description,
    status: comparison.status,
    sessionA: {
      id: comparison.sessionA.id,
      targetName: comparison.sessionA.target.name,
      summaryMetrics: comparison.sessionA.summaryMetrics,
    },
    sessionB: {
      id: comparison.sessionB.id,
      targetName: comparison.sessionB.target.name,
      summaryMetrics: comparison.sessionB.summaryMetrics,
    },
    results: comparison.results,
    createdAt: comparison.createdAt,
    updatedAt: comparison.updatedAt,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
