import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { encrypt } from "@/lib/utils/crypto";

// Validation schema for updating a webhook
const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  secret: z.string().min(16).optional(),
  isActive: z.boolean().optional(),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10).optional(),
      backoffMs: z.number().int().min(100).max(60000).optional(),
      backoffMultiplier: z.number().min(1).max(10).optional(),
    })
    .optional(),
});

/**
 * GET /api/webhooks/[id]
 * Get a single webhook by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id },
      include: {
        _count: {
          select: { deliveries: true },
        },
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        retryConfig: webhook.retryConfig,
        deliveryCount: webhook._count.deliveries,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        // Never expose the secret
      },
    });
  } catch (error) {
    console.error(`GET /api/webhooks/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch webhook",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/webhooks/[id]
 * Update a webhook
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const validated = UpdateWebhookSchema.parse(body);

    const existing = await prisma.webhook.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    const updateData: any = { ...validated };

    // If secret is being rotated, encrypt the new one
    if (validated.secret) {
      updateData.secret = encrypt(validated.secret);
    }

    const webhook = await prisma.webhook.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        retryConfig: webhook.retryConfig,
        updatedAt: webhook.updatedAt,
      },
      message: "Webhook updated successfully",
    });
  } catch (error) {
    console.error(`PUT /api/webhooks/${id} error:`, error);

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
        error: "Failed to update webhook",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/[id]
 * Delete a webhook and all its deliveries (cascade)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const existing = await prisma.webhook.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    // Delete webhook - deliveries cascade via Prisma onDelete: Cascade
    await prisma.webhook.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Webhook deleted successfully",
    });
  } catch (error) {
    console.error(`DELETE /api/webhooks/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete webhook",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
