import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/sessions
 * List all sessions with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const targetId = searchParams.get("targetId");
    const scenarioId = searchParams.get("scenarioId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (targetId) {
      where.targetId = targetId;
    }

    if (scenarioId) {
      where.scenarioId = scenarioId;
    }

    // Fetch sessions
    const sessions = await prisma.session.findMany({
      where,
      include: {
        target: {
          select: {
            name: true,
            connectorType: true,
          },
        },
        scenario: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    // Get total count
    const total = await prisma.session.count({ where });

    return NextResponse.json({
      success: true,
      data: sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("GET /api/sessions error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch sessions",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
