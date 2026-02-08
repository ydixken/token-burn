import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { decrypt } from "@/lib/utils/crypto";
import { ConnectorRegistry } from "@/lib/connectors/registry";
import type { ConnectorConfig } from "@/lib/connectors/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT = 10000;
const BROWSER_WEBSOCKET_TIMEOUT = 60000;
const DEFAULT_TEST_MESSAGE = "Hello, this is a connection test.";

/**
 * GET /api/targets/[id]/test/stream
 * SSE endpoint that streams discovery and test progress events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const forceFresh = request.nextUrl.searchParams.get("fresh") === "true";

  try {
    // Fetch target
    const target = await prisma.target.findUnique({
      where: { id },
    });

    if (!target) {
      return new Response(
        JSON.stringify({ error: "Target not found" }),
        { status: 404 }
      );
    }

    if (!target.isActive) {
      return new Response(
        JSON.stringify({ error: "Target is not active" }),
        { status: 400 }
      );
    }

    const timeout = target.connectorType === "BROWSER_WEBSOCKET"
      ? BROWSER_WEBSOCKET_TIMEOUT
      : DEFAULT_TIMEOUT;

    // Decrypt auth config
    let authConfig = target.authConfig as Record<string, unknown>;
    if (authConfig?.encrypted) {
      try {
        const decrypted = decrypt(authConfig.encrypted as string);
        authConfig = JSON.parse(decrypted);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to decrypt auth configuration" }),
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

    // Pass forceFresh flag through protocolConfig for browser discovery
    if (forceFresh && connectorConfig.protocolConfig) {
      connectorConfig.protocolConfig = { ...connectorConfig.protocolConfig, _forceFresh: true };
    }

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const send = (data: object) =>
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

    const close = () => writer.close().catch(() => {});

    // Detached async — runs independently, doesn't block the response
    (async () => {
      let connector: Awaited<ReturnType<typeof ConnectorRegistry.create>> | null = null;
      const startTime = Date.now();

      try {
        // Create connector
        connector = await ConnectorRegistry.create(
          target.connectorType,
          target.id,
          connectorConfig
        );

        // Wire up progress callback
        connector.setOnProgress((event) => {
          send({
            type: event.type,
            message: event.message,
            timestamp: event.timestamp.toISOString(),
            data: event.data,
          }).catch(() => {});
        });

        // Step 1: Connect
        await send({ type: "step", message: "Connecting...", timestamp: new Date().toISOString() });
        const connectStart = Date.now();

        const connectPromise = connector.connect();
        await withTimeout(connectPromise, timeout, "Connection");
        const connectLatencyMs = Date.now() - connectStart;

        await send({ type: "step", message: `Connected (${connectLatencyMs}ms)`, timestamp: new Date().toISOString() });

        // Step 2: Health check
        let healthResult: { healthy: boolean; latencyMs?: number; error?: string } | null = null;
        try {
          await send({ type: "step", message: "Running health check...", timestamp: new Date().toISOString() });
          const healthPromise = connector.healthCheck();
          const health = await withTimeout(healthPromise, timeout, "Health check");
          healthResult = {
            healthy: health.healthy,
            latencyMs: health.latencyMs,
            error: health.error,
          };
          await send({
            type: "step",
            message: health.healthy ? `Health check passed (${health.latencyMs}ms)` : `Health check failed: ${health.error}`,
            timestamp: new Date().toISOString(),
            data: healthResult,
          });
        } catch (healthError) {
          healthResult = {
            healthy: false,
            error: (healthError as Error).message,
          };
          await send({
            type: "step",
            message: `Health check failed: ${(healthError as Error).message}`,
            timestamp: new Date().toISOString(),
            data: healthResult,
          });
        }

        // Step 3: Send test message
        let testResponse: string | undefined;
        let testError: string | undefined;
        try {
          await send({ type: "step", message: "Sending test message...", timestamp: new Date().toISOString() });
          const sendPromise = connector.sendMessage(DEFAULT_TEST_MESSAGE, {
            sessionId: "test-connection-stream",
            messageIndex: 0,
            timestamp: new Date(),
          });
          const response = await withTimeout(sendPromise, timeout, "Test message");
          testResponse = response.content;
          await send({
            type: "step",
            message: "Test message sent successfully",
            timestamp: new Date().toISOString(),
            data: { response: testResponse?.substring(0, 200) },
          });

          // Stream the raw response so the user can see the actual data structure
          // and configure their response template path correctly
          if (response.metadata?.rawResponse) {
            await send({
              type: "raw_response",
              data: response.metadata.rawResponse,
              extractedContent: testResponse,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (messageError) {
          testError = (messageError as Error).message;
          await send({
            type: "step",
            message: `Test message failed: ${testError}`,
            timestamp: new Date().toISOString(),
          });
        }

        const totalLatencyMs = Date.now() - startTime;
        const isHealthy = healthResult?.healthy ?? false;
        const success = !testError && isHealthy;

        // Update target with test results
        const errorMessage = testError
          ? `Test message failed: ${testError}`
          : healthResult?.error
            ? `Health check failed: ${healthResult.error}`
            : undefined;

        await prisma.target.update({
          where: { id },
          data: {
            lastTestAt: new Date(),
            lastTestSuccess: success,
            lastTestError: errorMessage ?? null,
          },
        });

        // Send final result
        await send({
          type: "result",
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
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        await send({
          type: "error",
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
        });
        await send({
          type: "result",
          success: false,
          data: {
            healthy: false,
            latencyMs: Date.now() - startTime,
            connectorType: target.connectorType,
            error: (error as Error).message,
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        // Always disconnect
        if (connector) {
          try {
            await connector.disconnect();
          } catch {
            // Ignore disconnect errors during test
          }
        }
        close();
      }
    })();

    // Cleanup on client disconnect
    request.signal.addEventListener("abort", () => {
      close();
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Encoding": "none",
      },
    });
  } catch (error) {
    console.error(`GET /api/targets/${id}/test/stream error:`, error);
    return new Response(
      JSON.stringify({ error: "Failed to start stream" }),
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
