import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/db/client";
import { addSessionJob } from "@/lib/jobs/queue";

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

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"] as const;

/**
 * DELETE /api/sessions/[id]
 * Delete a session and its associated metrics and log files
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status === "RUNNING") {
      return NextResponse.json(
        { success: false, error: "Cannot delete a running session. Cancel it first." },
        { status: 400 }
      );
    }

    // Delete associated metrics (cascade handles this via schema, but be explicit)
    await prisma.sessionMetric.deleteMany({
      where: { sessionId: id },
    });

    // Delete the session record
    await prisma.session.delete({
      where: { id },
    });

    // Clean up log files if they exist
    if (session.logPath) {
      try {
        fs.rmSync(session.logPath, { recursive: true, force: true });
      } catch {
        // Log cleanup is best-effort; don't fail the request
        console.warn(`Failed to clean up log files at ${session.logPath}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/sessions/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete session",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions/[id]
 * Perform actions on a session: cancel or restart
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { action } = body;

    if (!action || !["cancel", "restart"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Must be 'cancel' or 'restart'." },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (action === "cancel") {
      if (TERMINAL_STATUSES.includes(session.status as typeof TERMINAL_STATUSES[number])) {
        return NextResponse.json(
          { success: false, error: `Cannot cancel session with status '${session.status}'.` },
          { status: 400 }
        );
      }

      await prisma.session.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({ success: true });
    }

    // action === "restart"
    const newSession = await prisma.session.create({
      data: {
        targetId: session.targetId,
        scenarioId: session.scenarioId,
        executionConfig: session.executionConfig ?? {},
        status: "QUEUED",
      },
    });

    await addSessionJob({
      sessionId: newSession.id,
      targetId: session.targetId,
      scenarioId: session.scenarioId,
      executionConfig: (session.executionConfig as Record<string, unknown>) ?? {},
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: newSession.id,
        originalSessionId: id,
      },
    });
  } catch (error) {
    console.error(`PATCH /api/sessions/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update session",
      },
      { status: 500 }
    );
  }
}
