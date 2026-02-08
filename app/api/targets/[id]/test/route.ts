import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { decrypt } from "@/lib/utils/crypto";
import { ConnectorRegistry } from "@/lib/connectors/registry";
import type { ConnectorConfig } from "@/lib/connectors/base";

const TestTargetSchema = z.object({
  testMessage: z.string().min(1).max(5000).optional(),
  timeout: z.number().int().min(1000).max(60000).optional(),
});

const DEFAULT_TEST_MESSAGE = "Hello, this is a connection test.";
const DEFAULT_TIMEOUT = 10000;
const BROWSER_WEBSOCKET_TIMEOUT = 60000;

/**
 * POST /api/targets/[id]/test
 * Test connectivity and send a test message to a target
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = TestTargetSchema.parse(body);

    const testMessage = validated.testMessage || DEFAULT_TEST_MESSAGE;
    let timeout = validated.timeout || DEFAULT_TIMEOUT;

    // Fetch target
    const target = await prisma.target.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Target not found" },
        { status: 404 }
      );
    }

    if (!target.isActive) {
      return NextResponse.json(
        { success: false, error: "Target is not active" },
        { status: 400 }
      );
    }

    // Browser-based connectors need more time for browser launch + discovery
    if (target.connectorType === "BROWSER_WEBSOCKET" && !validated.timeout) {
      timeout = BROWSER_WEBSOCKET_TIMEOUT;
    }

    // Decrypt auth config
    let authConfig = target.authConfig as Record<string, unknown>;
    if (authConfig?.encrypted) {
      try {
        const decrypted = decrypt(authConfig.encrypted as string);
        authConfig = JSON.parse(decrypted);
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to decrypt auth configuration",
          },
          { status: 500 }
        );
      }
    }

    // Build connector config
    const connectorConfig: ConnectorConfig = {
      endpoint: target.endpoint,
      authType: target.authType as ConnectorConfig["authType"],
      authConfig,
      requestTemplate: target.requestTemplate as any,
      responseTemplate: target.responseTemplate as any,
      protocolConfig: target.protocolConfig as any,
      timeout,
    };

    // Create connector
    const connector = await ConnectorRegistry.create(
      target.connectorType,
      target.id,
      connectorConfig
    );

    const startTime = Date.now();
    let connectLatencyMs = 0;
    let healthResult: { healthy: boolean; latencyMs?: number; error?: string } | null = null;
    let testResponse: string | undefined;
    let testError: string | undefined;

    try {
      // Step 1: Connect
      const connectPromise = connector.connect();
      await withTimeout(connectPromise, timeout, "Connection");
      connectLatencyMs = Date.now() - startTime;

      // Step 2: Health check
      try {
        const healthPromise = connector.healthCheck();
        const health = await withTimeout(healthPromise, timeout, "Health check");
        healthResult = {
          healthy: health.healthy,
          latencyMs: health.latencyMs,
          error: health.error,
        };
      } catch (healthError) {
        healthResult = {
          healthy: false,
          error: (healthError as Error).message,
        };
      }

      // Step 3: Send test message
      try {
        const sendPromise = connector.sendMessage(testMessage, {
          sessionId: "test-connection",
          messageIndex: 0,
          timestamp: new Date(),
        });
        const response = await withTimeout(sendPromise, timeout, "Test message");
        testResponse = response.content;
      } catch (messageError) {
        testError = (messageError as Error).message;
      }
    } finally {
      // Always disconnect
      try {
        await connector.disconnect();
      } catch {
        // Ignore disconnect errors during test
      }
    }

    const totalLatencyMs = Date.now() - startTime;

    const isHealthy = healthResult?.healthy ?? false;
    const success = !testError && isHealthy;
    const errorMessage = testError
      ? `Test message failed: ${testError}`
      : healthResult?.error
        ? `Health check failed: ${healthResult.error}`
        : undefined;

    // Update target with test results
    await prisma.target.update({
      where: { id },
      data: {
        lastTestAt: new Date(),
        lastTestSuccess: success,
        lastTestError: errorMessage ?? null,
      },
    });

    // Auto-start token refresh for verified Browser WebSocket targets
    if (success && target.connectorType === "BROWSER_WEBSOCKET") {
      try {
        const { TokenRefreshScheduler } = await import(
          "@/lib/jobs/token-refresh/scheduler"
        );
        await TokenRefreshScheduler.schedule(
          id,
          target.protocolConfig as any
        );
      } catch (scheduleError) {
        console.warn("Failed to auto-schedule token refresh:", scheduleError);
        // Non-blocking — don't fail the test response
      }
    }

    return NextResponse.json({
      success,
      data: {
        healthy: isHealthy,
        latencyMs: totalLatencyMs,
        connectLatencyMs,
        healthCheckLatencyMs: healthResult?.latencyMs,
        testResponse,
        connectorType: target.connectorType,
        error: errorMessage,
      },
    });
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

    console.error(`POST /api/targets/${id}/test error:`, error);
    return NextResponse.json(
      {
        success: false,
        data: {
          healthy: false,
          latencyMs: 0,
          connectorType: "unknown",
          error: (error as Error).message,
        },
      },
      { status: 500 }
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
