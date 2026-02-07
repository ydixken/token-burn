import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decrypt } from "@/lib/utils/crypto";
import { buildSignedHeaders } from "@/lib/webhooks/signer";
import axios from "axios";

/**
 * POST /api/webhooks/[id]/test
 * Send a test webhook delivery to verify endpoint connectivity
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const webhook = await prisma.webhook.findUnique({ where: { id } });

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    // Decrypt the stored secret
    let secret: string;
    try {
      secret = decrypt(webhook.secret);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to decrypt webhook secret",
        },
        { status: 500 }
      );
    }

    // Build test payload
    const testPayload = JSON.stringify({
      event: "webhook.test",
      payload: {
        webhookId: webhook.id,
        webhookName: webhook.name,
        message: "This is a test delivery from Krawall.",
      },
      deliveryId: `test-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });

    const headers = buildSignedHeaders(testPayload, secret);

    // Attempt delivery
    try {
      const response = await axios.post(webhook.url, testPayload, {
        headers,
        timeout: 10000,
        validateStatus: () => true,
      });

      const success = response.status >= 200 && response.status < 300;

      // Record the test delivery
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: "webhook.test",
          payload: JSON.parse(testPayload),
          status: success ? "DELIVERED" : "FAILED",
          statusCode: response.status,
          attempts: 1,
          lastAttemptAt: new Date(),
          error: success ? null : `HTTP ${response.status}`,
        },
      });

      return NextResponse.json({
        success,
        data: {
          statusCode: response.status,
          delivered: success,
        },
        message: success
          ? "Test webhook delivered successfully"
          : `Test webhook failed with HTTP ${response.status}`,
      });
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.code === "ECONNABORTED"
          ? "Request timeout (10s)"
          : error.message
        : (error as Error).message;

      // Record the failed test delivery
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: "webhook.test",
          payload: JSON.parse(testPayload),
          status: "FAILED",
          attempts: 1,
          lastAttemptAt: new Date(),
          error: errorMessage,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: "Test delivery failed",
          message: errorMessage,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error(`POST /api/webhooks/${id}/test error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to send test webhook",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
