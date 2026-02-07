import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const DEFAULT_SETTINGS: Record<string, { value: unknown; category: string }> = {
  "general.appName": { value: "Krawall", category: "general" },
  "general.defaultTimeout": { value: 30000, category: "general" },
  "general.maxConcurrentSessions": { value: 10, category: "general" },
  "general.logRetentionDays": { value: 30, category: "general" },
  "appearance.sidebarCollapsed": { value: false, category: "appearance" },
  "appearance.theme": { value: "dark", category: "appearance" },
  "notifications.defaultWebhookEvents": {
    value: ["session.completed", "session.failed"],
    category: "notifications",
  },
  "api.rateLimitRpm": { value: 60, category: "api" },
  "api.corsOrigins": { value: ["http://localhost:3000"], category: "api" },
  "defaults.connectorType": { value: "HTTP_REST", category: "defaults" },
  "defaults.authType": { value: "NONE", category: "defaults" },
  "defaults.requestTemplate": {
    value: { messagePath: "message", structure: { message: "{{message}}" } },
    category: "defaults",
  },
  "defaults.responseTemplate": {
    value: { contentPath: "response" },
    category: "defaults",
  },
};

const UpdateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

/**
 * GET /api/settings
 * Returns all settings grouped by category
 */
export async function GET() {
  try {
    const settings = await prisma.setting.findMany({
      orderBy: { key: "asc" },
    });

    // Merge with defaults (DB values override defaults)
    const settingsMap = new Map<string, { key: string; value: unknown; category: string; updatedAt?: Date }>();

    // Add defaults first
    for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
      settingsMap.set(key, { key, ...config });
    }

    // Override with DB values
    for (const setting of settings) {
      settingsMap.set(setting.key, {
        key: setting.key,
        value: setting.value,
        category: setting.category,
        updatedAt: setting.updatedAt,
      });
    }

    // Group by category
    const grouped: Record<string, Array<{ key: string; value: unknown; updatedAt?: Date }>> = {};
    for (const setting of settingsMap.values()) {
      if (!grouped[setting.category]) {
        grouped[setting.category] = [];
      }
      grouped[setting.category].push({
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt,
      });
    }

    return NextResponse.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings", message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Update a single setting by key
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = UpdateSettingSchema.parse(body);

    // Determine category from key prefix or default settings
    const defaultConfig = DEFAULT_SETTINGS[validated.key];
    const category = defaultConfig?.category ?? validated.key.split(".")[0] ?? "general";

    const setting = await prisma.setting.upsert({
      where: { key: validated.key },
      update: { value: validated.value as any, category },
      create: { key: validated.key, value: validated.value as any, category },
    });

    return NextResponse.json({
      success: true,
      data: setting,
      message: "Setting updated successfully",
    });
  } catch (error) {
    console.error("PUT /api/settings error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to update setting", message: (error as Error).message },
      { status: 500 }
    );
  }
}
