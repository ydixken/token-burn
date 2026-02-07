import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import yaml from "js-yaml";

/**
 * GET /api/scenarios/[id]/export
 * Export a scenario as a YAML file
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const scenario = await prisma.scenario.findUnique({
      where: { id },
    });

    if (!scenario) {
      return NextResponse.json(
        { success: false, error: "Scenario not found" },
        { status: 404 }
      );
    }

    // Build export object (exclude internal fields)
    const exportData = {
      name: scenario.name,
      description: scenario.description,
      category: scenario.category,
      flowConfig: scenario.flowConfig,
      repetitions: scenario.repetitions,
      concurrency: scenario.concurrency,
      delayBetweenMs: scenario.delayBetweenMs,
      verbosityLevel: scenario.verbosityLevel,
      messageTemplates: scenario.messageTemplates,
    };

    const yamlContent = yaml.dump(exportData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    // Sanitize filename
    const safeName = scenario.name
      .replace(/[^a-zA-Z0-9-_\s]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50);

    return new NextResponse(yamlContent, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml",
        "Content-Disposition": `attachment; filename="${safeName}.yaml"`,
      },
    });
  } catch (error) {
    console.error(`GET /api/scenarios/${id}/export error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to export scenario",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
