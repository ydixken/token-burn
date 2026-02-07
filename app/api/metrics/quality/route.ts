import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { QualityScorer } from "@/lib/metrics/quality-scorer";

/**
 * GET /api/metrics/quality?sessionId=xxx
 * Returns quality scores for all messages in a session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId query parameter is required" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        logPath: true,
        summaryMetrics: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    // Fetch session metrics (per-message data)
    const metrics = await prisma.sessionMetric.findMany({
      where: { sessionId },
      orderBy: { messageIndex: "asc" },
    });

    if (metrics.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          sessionId,
          scores: [],
          summary: QualityScorer.aggregate([]),
        },
      });
    }

    // Create scorer with default config
    const scorer = new QualityScorer();

    // Score each message that has a successful response
    const scores = metrics
      .filter((m) => m.success)
      .map((m) => {
        // We use errorMessage as a proxy for prompt (since we don't store prompts in metrics)
        // In practice, the prompt would come from log files
        const prompt = ""; // TODO: read from log file when available
        const response = ""; // TODO: read from log file when available
        const responseTimeMs = m.responseTimeMs;

        const score = scorer.score(prompt, response, responseTimeMs);

        return {
          messageIndex: m.messageIndex,
          responseTimeMs: m.responseTimeMs,
          tokenUsage: {
            prompt: m.promptTokens,
            completion: m.completionTokens,
            total: m.totalTokens,
          },
          repetitionScore: m.repetitionScore,
          quality: score,
        };
      });

    const qualityScores = scores.map((s) => s.quality);
    const summary = QualityScorer.aggregate(qualityScores);

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        sessionStatus: session.status,
        scores,
        summary,
      },
    });
  } catch (error) {
    console.error("GET /api/metrics/quality error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to compute quality scores",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
