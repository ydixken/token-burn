import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { encrypt } from "@/lib/utils/crypto";

const GuideCreateTargetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  connectorType: z.enum(["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"]),
  endpoint: z.string().url(),
  authType: z.enum([
    "NONE",
    "BEARER_TOKEN",
    "API_KEY",
    "BASIC_AUTH",
    "CUSTOM_HEADER",
    "OAUTH2",
  ]),
  authConfig: z.record(z.unknown()).default({}),
  requestTemplate: z.object({
    messagePath: z.string(),
    structure: z.record(z.unknown()).optional(),
    variables: z.record(z.unknown()).optional(),
  }),
  responseTemplate: z.object({
    contentPath: z.string(),
    tokenUsagePath: z.string().optional(),
    errorPath: z.string().optional(),
  }),
  protocolConfig: z.record(z.unknown()).optional(),
  runTestAfterCreate: z.boolean().optional(),
});

/**
 * POST /api/guide/create-target
 * Thin wrapper around target creation for the guide flow.
 * Optionally runs a connectivity test after creation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = GuideCreateTargetSchema.parse(body);

    const { runTestAfterCreate, ...targetData } = validated;

    // Encrypt auth config before storing
    const encryptedAuthConfig = encrypt(JSON.stringify(targetData.authConfig));

    // Create target in database
    const target = await prisma.target.create({
      data: {
        name: targetData.name,
        description: targetData.description,
        connectorType: targetData.connectorType,
        endpoint: targetData.endpoint,
        authType: targetData.authType,
        authConfig: { encrypted: encryptedAuthConfig },
        requestTemplate: targetData.requestTemplate as any,
        responseTemplate: targetData.responseTemplate as any,
        protocolConfig: (targetData.protocolConfig || {}) as any,
        isActive: true,
      },
    });

    let testResult = null;

    if (runTestAfterCreate) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(targetData.endpoint, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        testResult = {
          success: res.ok,
          statusCode: res.status,
          latencyMs: Date.now() - startTime,
          error: null,
        };
      } catch (error) {
        testResult = {
          success: false,
          statusCode: null,
          latencyMs: Date.now() - startTime,
          error: (error as Error).message,
        };
      }

      // Update target with test results
      await prisma.target.update({
        where: { id: target.id },
        data: {
          lastTestAt: new Date(),
          lastTestSuccess: testResult.success,
          lastTestError: testResult.error,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: target.id,
          name: target.name,
          description: target.description,
          connectorType: target.connectorType,
          endpoint: target.endpoint,
          authType: target.authType,
          isActive: target.isActive,
          createdAt: target.createdAt,
        },
        testResult,
        message: "Target created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/guide/create-target error:", error);

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
        error: "Failed to create target",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
