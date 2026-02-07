import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import yaml from "js-yaml";

const ImportedScenarioSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  category: z.string().min(1).max(100).optional().default("custom"),
  flowConfig: z.array(z.record(z.unknown())).min(1),
  repetitions: z.number().int().min(1).max(1000).optional().default(1),
  concurrency: z.number().int().min(1).max(100).optional().default(1),
  delayBetweenMs: z.number().int().min(0).max(300000).optional().default(0),
  verbosityLevel: z.string().optional().default("normal"),
  messageTemplates: z.record(z.unknown()).optional().default({}),
});

/**
 * POST /api/scenarios/import
 * Import a scenario from YAML
 * Accepts YAML as request body (Content-Type: application/yaml or text/yaml)
 * or as a multipart form upload with field name "file"
 */
export async function POST(request: NextRequest) {
  try {
    let yamlContent: string;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json(
          { success: false, error: "No file provided. Upload a .yaml file." },
          { status: 400 }
        );
      }
      yamlContent = await (file as Blob).text();
    } else {
      // Handle raw YAML body
      yamlContent = await request.text();
    }

    if (!yamlContent.trim()) {
      return NextResponse.json(
        { success: false, error: "Empty YAML content" },
        { status: 400 }
      );
    }

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent);
    } catch (yamlError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid YAML",
          message: (yamlError as Error).message,
        },
        { status: 400 }
      );
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { success: false, error: "YAML must contain an object" },
        { status: 400 }
      );
    }

    // Validate against schema
    const data = ImportedScenarioSchema.parse(parsed);

    // Create scenario
    const scenario = await prisma.scenario.create({
      data: {
        name: data.name,
        description: data.description || null,
        category: data.category,
        flowConfig: data.flowConfig as any,
        repetitions: data.repetitions,
        concurrency: data.concurrency,
        delayBetweenMs: data.delayBetweenMs,
        verbosityLevel: data.verbosityLevel,
        messageTemplates: data.messageTemplates as any,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description,
          category: scenario.category,
          createdAt: scenario.createdAt,
        },
        message: "Scenario imported successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error: YAML does not match scenario schema",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error("POST /api/scenarios/import error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to import scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
