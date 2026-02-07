import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ValidateTemplateSchema = z.object({
  requestTemplate: z
    .object({
      messagePath: z.string().min(1),
      structure: z.record(z.unknown()).optional(),
    })
    .optional(),
  responseTemplate: z
    .object({
      contentPath: z.string().min(1),
      tokenUsagePath: z.string().optional(),
      errorPath: z.string().optional(),
    })
    .optional(),
  sampleResponse: z.record(z.unknown()).optional(),
});

/**
 * POST /api/templates/validate
 * Validates request and response templates against a sample response
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ValidateTemplateSchema.parse(body);

    const results: ValidationResult[] = [];

    // Validate request template
    if (validated.requestTemplate) {
      const { messagePath, structure } = validated.requestTemplate;

      if (structure) {
        // Try setting value at messagePath in a cloned structure
        try {
          const cloned = JSON.parse(JSON.stringify(structure));
          setValueAtPath(cloned, messagePath, "test_message");
          const retrieved = getValueAtPath(cloned, messagePath);
          if (retrieved === "test_message") {
            results.push({
              field: "requestTemplate.messagePath",
              valid: true,
              message: `Path "${messagePath}" is valid and writable`,
            });
          } else {
            results.push({
              field: "requestTemplate.messagePath",
              valid: false,
              message: `Path "${messagePath}" was set but could not be read back`,
              suggestion: suggestPaths(structure),
            });
          }
        } catch (err) {
          results.push({
            field: "requestTemplate.messagePath",
            valid: false,
            message: `Failed to set value at "${messagePath}": ${(err as Error).message}`,
            suggestion: suggestPaths(structure),
          });
        }
      } else {
        results.push({
          field: "requestTemplate.messagePath",
          valid: true,
          message: `Path "${messagePath}" accepted (no structure to validate against)`,
        });
      }
    }

    // Validate response template against sample response
    if (validated.responseTemplate && validated.sampleResponse) {
      const { contentPath, tokenUsagePath, errorPath } = validated.responseTemplate;
      const sample = validated.sampleResponse;

      // Validate contentPath
      const contentValue = getValueAtPath(sample, contentPath);
      if (contentValue !== undefined && contentValue !== null) {
        results.push({
          field: "responseTemplate.contentPath",
          valid: true,
          message: `Found content at "${contentPath}": ${truncate(String(contentValue), 100)}`,
        });
      } else {
        results.push({
          field: "responseTemplate.contentPath",
          valid: false,
          message: `No value found at "${contentPath}"`,
          suggestion: suggestPaths(sample),
        });
      }

      // Validate tokenUsagePath
      if (tokenUsagePath) {
        const tokenValue = getValueAtPath(sample, tokenUsagePath);
        if (tokenValue !== undefined && tokenValue !== null) {
          results.push({
            field: "responseTemplate.tokenUsagePath",
            valid: true,
            message: `Found token usage at "${tokenUsagePath}": ${truncate(JSON.stringify(tokenValue), 100)}`,
          });
        } else {
          results.push({
            field: "responseTemplate.tokenUsagePath",
            valid: false,
            message: `No value found at "${tokenUsagePath}"`,
            suggestion: suggestPaths(sample),
          });
        }
      }

      // Validate errorPath
      if (errorPath) {
        // Error path may not have a value in a success response - just check it's a valid path structure
        const errorValue = getValueAtPath(sample, errorPath);
        results.push({
          field: "responseTemplate.errorPath",
          valid: true,
          message: errorValue !== undefined
            ? `Found value at "${errorPath}" (may indicate error in sample): ${truncate(String(errorValue), 100)}`
            : `Path "${errorPath}" is structurally valid (no error in sample response)`,
        });
      }
    } else if (validated.responseTemplate && !validated.sampleResponse) {
      results.push({
        field: "responseTemplate",
        valid: true,
        message: "Response template accepted (no sample response to validate against)",
      });
    }

    const allValid = results.every((r) => r.valid);

    return NextResponse.json({
      success: true,
      data: {
        valid: allValid,
        results,
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

    console.error("POST /api/templates/validate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to validate templates",
      },
      { status: 500 }
    );
  }
}

// --- Helper types and functions ---

interface ValidationResult {
  field: string;
  valid: boolean;
  message: string;
  suggestion?: string[];
}

/**
 * Parse a JSON path (supports $.foo.bar[0] or foo.bar.0)
 */
function parsePath(path: string): string[] {
  const cleanPath = path.startsWith("$.") ? path.slice(2) : path;
  return cleanPath.split(/[.\[\]]/).filter(Boolean);
}

/**
 * Get value at a dot-notation JSON path
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = parsePath(path);
  let current: any = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set value at a dot-notation JSON path
 */
function setValueAtPath(obj: any, path: string, value: unknown): void {
  const parts = parsePath(path);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Suggest available paths in an object (up to 2 levels deep)
 */
function suggestPaths(obj: unknown, prefix = ""): string[] {
  const paths: string[] = [];
  if (typeof obj !== "object" || obj === null) return paths;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    paths.push(currentPath);

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "object" && first !== null) {
        for (const subKey of Object.keys(first)) {
          paths.push(`${currentPath}.0.${subKey}`);
        }
      } else {
        paths.push(`${currentPath}.0`);
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const subKey of Object.keys(value)) {
        paths.push(`${currentPath}.${subKey}`);
      }
    }
  }

  return paths;
}

/**
 * Truncate a string to a max length
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}
