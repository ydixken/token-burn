import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { generateWebhookSecret } from "@/lib/webhooks/signer";
import { encrypt } from "@/lib/utils/crypto";

// Validation schema for creating a webhook
const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z
    .array(z.string().min(1))
    .min(1, "At least one event is required"),
  secret: z.string().min(16).optional(), // If omitted, auto-generate
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
 * GET /api/webhooks
 * List all webhooks
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const event = searchParams.get("event");

    const where: any = {};

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (event) {
      where.events = { has: event };
    }

    const webhooks = await prisma.webhook.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { deliveries: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: webhooks,
      count: webhooks.length,
    });
  } catch (error) {
    console.error("GET /api/webhooks error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch webhooks",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateWebhookSchema.parse(body);

    // Generate secret if not provided
    const rawSecret = validated.secret ?? generateWebhookSecret();

    // Encrypt the secret before storing
    const encryptedSecret = encrypt(rawSecret);

    const webhook = await prisma.webhook.create({
      data: {
        name: validated.name,
        url: validated.url,
        events: validated.events,
        secret: encryptedSecret,
        isActive: validated.isActive ?? true,
        retryConfig: validated.retryConfig ?? {
          maxRetries: 5,
          backoffMs: 1000,
          backoffMultiplier: 2,
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
          // Return raw secret ONLY on creation so user can store it
          secret: rawSecret,
        },
        message: "Webhook created successfully. Store the secret - it will not be shown again.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/webhooks error:", error);

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
        error: "Failed to create webhook",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
