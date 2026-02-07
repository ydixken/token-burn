import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/webhooks/[id]/deliveries
 * List recent deliveries for a webhook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify webhook exists
    const webhook = await prisma.webhook.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10),
      200
    );
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const status = searchParams.get("status");
    const event = searchParams.get("event");

    const where: any = { webhookId: id };

    if (status) {
      where.status = status;
    }
    if (event) {
      where.event = event;
    }

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          event: true,
          status: true,
          statusCode: true,
          attempts: true,
          lastAttemptAt: true,
          nextRetryAt: true,
          error: true,
          createdAt: true,
          // Exclude full payload from list - fetch by ID if needed
        },
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error(`GET /api/webhooks/${id}/deliveries error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch deliveries",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
