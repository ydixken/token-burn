import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/sessions/[id]
 * Fetch a single session by ID with target and scenario details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        target: true,
        scenario: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error(`GET /api/sessions/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch session",
      },
      { status: 500 }
    );
  }
}
