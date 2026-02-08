import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { TokenRefreshStatus } from "@/lib/jobs/token-refresh/status";
import { getTokenRefreshQueueStats } from "@/lib/jobs/token-refresh/queue";
import { TokenRefreshScheduler } from "@/lib/jobs/token-refresh/scheduler";

/**
 * GET /api/targets/[id]/token-refresh
 * Returns the token refresh status, schedule info, and queue stats for a target.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify target exists
    const target = await prisma.target.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Target not found" },
        { status: 404 }
      );
    }

    const [status, queueStats, isScheduled] = await Promise.all([
      TokenRefreshStatus.getStatus(id),
      getTokenRefreshQueueStats(),
      TokenRefreshScheduler.isScheduled(id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        targetId: id,
        ...status,
        isScheduled,
        queueStats,
      },
    });
  } catch (error) {
    console.error(`GET /api/targets/${id}/token-refresh error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch token refresh status",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

const TokenRefreshActionSchema = z.object({
  action: z.enum(["start", "stop", "force"]),
  config: z
    .object({
      refreshAheadPercent: z.number().min(0.1).max(1.0).optional(),
    })
    .optional(),
});

/**
 * POST /api/targets/[id]/token-refresh
 * Start, stop, or force a token refresh for a target.
 * Validates the request body with Zod and dispatches to the scheduler.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = TokenRefreshActionSchema.parse(body);

    // Verify target exists and is BROWSER_WEBSOCKET
    const target = await prisma.target.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Target not found" },
        { status: 404 }
      );
    }
    if (target.connectorType !== "BROWSER_WEBSOCKET") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Token refresh is only supported for BROWSER_WEBSOCKET targets",
        },
        { status: 400 }
      );
    }

    const protocolConfig = target.protocolConfig as any;

    switch (validated.action) {
      case "start": {
        // Override refreshAheadPercent if provided
        if (validated.config?.refreshAheadPercent && protocolConfig?.session) {
          protocolConfig.session.refreshAheadPercent =
            validated.config.refreshAheadPercent;
        }
        await TokenRefreshScheduler.schedule(id, protocolConfig);
        return NextResponse.json({
          success: true,
          data: { action: "started", targetId: id },
        });
      }
      case "stop": {
        await TokenRefreshScheduler.cancel(id);
        return NextResponse.json({
          success: true,
          data: { action: "stopped", targetId: id },
        });
      }
      case "force": {
        await TokenRefreshScheduler.forceRefresh(id);
        return NextResponse.json({
          success: true,
          data: { action: "force-refreshed", targetId: id },
        });
      }
    }
  } catch (error) {
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

    console.error(`POST /api/targets/${id}/token-refresh error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute token refresh action",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
