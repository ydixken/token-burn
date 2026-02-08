import { NextResponse } from "next/server";
import {
  getSessionQueueStats,
  getMetricsQueueStats,
  sessionQueue,
  metricsQueue,
} from "@/lib/jobs/queue";
import {
  getTokenRefreshQueueStats,
  tokenRefreshQueue,
} from "@/lib/jobs/token-refresh/queue";

export async function GET() {
  try {
    const [
      sessionStats,
      metricsStats,
      tokenRefreshStats,
      sessionWorkers,
      metricsWorkers,
      tokenRefreshWorkers,
    ] = await Promise.all([
      getSessionQueueStats(),
      getMetricsQueueStats(),
      getTokenRefreshQueueStats(),
      sessionQueue.getWorkers().catch(() => []),
      metricsQueue.getWorkers().catch(() => []),
      tokenRefreshQueue.getWorkers().catch(() => []),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sessionQueue: {
          ...sessionStats,
          workerRunning: sessionWorkers.length > 0,
        },
        metricsQueue: {
          ...metricsStats,
          workerRunning: metricsWorkers.length > 0,
        },
        tokenRefreshQueue: {
          ...tokenRefreshStats,
          workerRunning: tokenRefreshWorkers.length > 0,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch queue status",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
