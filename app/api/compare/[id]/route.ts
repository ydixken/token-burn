import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/compare/[id]
 * Get comparison details with full results
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const comparison = await prisma.comparison.findUnique({
      where: { id },
      include: {
        sessionA: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            summaryMetrics: true,
            target: { select: { id: true, name: true, connectorType: true } },
            scenario: { select: { id: true, name: true, category: true } },
          },
        },
        sessionB: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            summaryMetrics: true,
            target: { select: { id: true, name: true, connectorType: true } },
            scenario: { select: { id: true, name: true, category: true } },
          },
        },
      },
    });

    if (!comparison) {
      return NextResponse.json(
        { success: false, error: "Comparison not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: comparison.id,
        name: comparison.name,
        description: comparison.description,
        status: comparison.status,
        sessionA: {
          id: comparison.sessionA.id,
          status: comparison.sessionA.status,
          startedAt: comparison.sessionA.startedAt?.toISOString() || null,
          completedAt: comparison.sessionA.completedAt?.toISOString() || null,
          target: comparison.sessionA.target,
          scenario: comparison.sessionA.scenario,
          summaryMetrics: comparison.sessionA.summaryMetrics,
        },
        sessionB: {
          id: comparison.sessionB.id,
          status: comparison.sessionB.status,
          startedAt: comparison.sessionB.startedAt?.toISOString() || null,
          completedAt: comparison.sessionB.completedAt?.toISOString() || null,
          target: comparison.sessionB.target,
          scenario: comparison.sessionB.scenario,
          summaryMetrics: comparison.sessionB.summaryMetrics,
        },
        results: comparison.results,
        createdAt: comparison.createdAt,
        updatedAt: comparison.updatedAt,
      },
    });
  } catch (error) {
    console.error(`GET /api/compare/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch comparison",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/compare/[id]
 * Delete a comparison
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const existing = await prisma.comparison.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comparison not found" },
        { status: 404 }
      );
    }

    await prisma.comparison.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Comparison deleted successfully",
    });
  } catch (error) {
    console.error(`DELETE /api/compare/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete comparison",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
