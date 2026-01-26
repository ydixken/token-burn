import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { encrypt } from "@/lib/utils/crypto";

// Validation schema for creating a target
const CreateTargetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  connectorType: z.enum(["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"]),
  endpoint: z.string().url(),
  authType: z.enum(["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER", "OAUTH2"]),
  authConfig: z.record(z.unknown()),
  requestTemplate: z.object({
    messagePath: z.string(),
    structure: z.record(z.unknown()).optional(),
    variables: z.record(z.unknown()).optional(),
  }),
  responseTemplate: z.object({
    contentPath: z.string(),
    tokenUsagePath: z.string().optional(),
    errorPath: z.string().optional(),
    transform: z.enum(["none", "markdown", "html"]).optional(),
  }),
  protocolConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/targets
 * List all targets
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const connectorType = searchParams.get("connectorType");

    const where: any = {};

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (connectorType) {
      where.connectorType = connectorType;
    }

    const targets = await prisma.target.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        description: true,
        connectorType: true,
        endpoint: true,
        authType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Don't include authConfig (sensitive)
        // Don't include templates (not needed for list)
      },
    });

    return NextResponse.json({
      success: true,
      data: targets,
      count: targets.length,
    });
  } catch (error) {
    console.error("GET /api/targets error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch targets",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/targets
 * Create a new target
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validated = CreateTargetSchema.parse(body);

    // Encrypt auth config before storing
    const encryptedAuthConfig = encrypt(JSON.stringify(validated.authConfig));

    // Create target in database
    const target = await prisma.target.create({
      data: {
        name: validated.name,
        description: validated.description,
        connectorType: validated.connectorType,
        endpoint: validated.endpoint,
        authType: validated.authType,
        authConfig: { encrypted: encryptedAuthConfig },
        requestTemplate: validated.requestTemplate,
        responseTemplate: validated.responseTemplate,
        protocolConfig: validated.protocolConfig || {},
        isActive: validated.isActive ?? true,
      },
    });

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
        message: "Target created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/targets error:", error);

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
