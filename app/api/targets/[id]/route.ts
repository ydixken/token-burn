import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { encrypt, decrypt } from "@/lib/utils/crypto";

// Validation schema for updating a target
const UpdateTargetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  connectorType: z.enum(["HTTP_REST", "WEBSOCKET", "GRPC", "SSE", "BROWSER_WEBSOCKET"]).optional(),
  endpoint: z.string().url().optional(),
  authType: z
    .enum(["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER", "OAUTH2"])
    .optional(),
  authConfig: z.record(z.unknown()).optional(),
  requestTemplate: z
    .object({
      messagePath: z.string(),
      structure: z.record(z.unknown()).optional(),
      variables: z.record(z.unknown()).optional(),
    })
    .optional(),
  responseTemplate: z
    .object({
      responsePath: z.string(),
      tokenUsagePath: z.string().optional(),
      errorPath: z.string().optional(),
      transform: z.enum(["none", "markdown", "html"]).optional(),
    })
    .optional(),
  protocolConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/targets/[id]
 * Get a single target by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const target = await prisma.target.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sessions: true,
            scenarios: true,
          },
        },
      },
    });

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: "Target not found",
        },
        { status: 404 }
      );
    }

    // Decrypt auth config for display (but mask sensitive parts)
    let authConfig = target.authConfig as any;
    if (authConfig?.encrypted) {
      try {
        const decrypted = decrypt(authConfig.encrypted);
        authConfig = JSON.parse(decrypted);

        // Mask sensitive values
        authConfig = maskSensitiveData(authConfig);
      } catch (error) {
        console.error("Failed to decrypt auth config:", error);
        authConfig = { error: "Failed to decrypt" };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...target,
        authConfig,
        sessionCount: target._count.sessions,
        scenarioCount: target._count.scenarios,
      },
    });
  } catch (error) {
    console.error(`GET /api/targets/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch target",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/targets/[id]
 * Update a target
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();

    // Validate request body
    const validated = UpdateTargetSchema.parse(body);

    // Check if target exists
    const existing = await prisma.target.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Target not found",
        },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = { ...validated };

    // If authConfig is being updated, encrypt it
    if (validated.authConfig) {
      const encryptedAuthConfig = encrypt(JSON.stringify(validated.authConfig));
      updateData.authConfig = { encrypted: encryptedAuthConfig };
    }

    // Update target in database
    const target = await prisma.target.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: target.id,
        name: target.name,
        description: target.description,
        connectorType: target.connectorType,
        endpoint: target.endpoint,
        authType: target.authType,
        isActive: target.isActive,
        updatedAt: target.updatedAt,
      },
      message: "Target updated successfully",
    });
  } catch (error) {
    console.error(`PUT /api/targets/${id} error:`, error);

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
        error: "Failed to update target",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/targets/[id]
 * Delete a target
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Check if target exists
    const existing = await prisma.target.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Target not found",
        },
        { status: 404 }
      );
    }

    // Check if target has active sessions
    if (existing._count.sessions > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete target with existing sessions",
          message: `This target has ${existing._count.sessions} session(s). Delete sessions first or archive the target instead.`,
        },
        { status: 400 }
      );
    }

    // Delete target
    await prisma.target.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Target deleted successfully",
    });
  } catch (error) {
    console.error(`DELETE /api/targets/${id} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete target",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Mask sensitive data in auth config
 */
function maskSensitiveData(obj: any): any {
  const sensitiveKeys = ["token", "apiKey", "password", "secret", "key"];
  const masked = { ...obj };

  for (const key in masked) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      const value = String(masked[key]);
      if (value.length > 8) {
        masked[key] = `${value.slice(0, 4)}...${value.slice(-4)}`;
      } else {
        masked[key] = "****";
      }
    }
  }

  return masked;
}
