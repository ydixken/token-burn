import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { checkRedisHealth } from "@/lib/cache/redis";

export async function GET() {
  const startTime = Date.now();

  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      api: {
        status: "healthy",
        responseTimeMs: 0,
      },
      database: {
        status: "unknown",
        responseTimeMs: 0,
        error: null as string | null,
      },
      redis: {
        status: "unknown",
        responseTimeMs: 0,
        error: null as string | null,
      },
      mockServer: {
        status: "unknown",
        responseTimeMs: 0,
        error: null as string | null,
      },
    },
  };

  // Check database health
  const dbStartTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database.status = "healthy";
    health.services.database.responseTimeMs = Date.now() - dbStartTime;
  } catch (error) {
    health.services.database.status = "unhealthy";
    health.services.database.responseTimeMs = Date.now() - dbStartTime;
    health.services.database.error = (error as Error).message;
    health.status = "unhealthy";
  }

  // Check Redis health
  const redisStartTime = Date.now();
  try {
    const isHealthy = await checkRedisHealth();
    health.services.redis.status = isHealthy ? "healthy" : "unhealthy";
    health.services.redis.responseTimeMs = Date.now() - redisStartTime;

    if (!isHealthy) {
      health.status = "degraded";
    }
  } catch (error) {
    health.services.redis.status = "unhealthy";
    health.services.redis.responseTimeMs = Date.now() - redisStartTime;
    health.services.redis.error = (error as Error).message;
    health.status = "unhealthy";
  }

  // Check mock server health
  const mockStartTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const mockRes = await fetch("http://localhost:3001/health", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    health.services.mockServer = {
      status: mockRes.ok ? "healthy" : "unhealthy",
      responseTimeMs: Date.now() - mockStartTime,
      error: null,
    };
  } catch {
    health.services.mockServer = {
      status: "unreachable",
      responseTimeMs: Date.now() - mockStartTime,
      error: null, // Not an error - mock server is optional
    };
  }

  // Calculate total API response time
  health.services.api.responseTimeMs = Date.now() - startTime;

  // Return appropriate status code
  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
