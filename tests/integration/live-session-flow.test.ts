import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * Integration tests for the live session flow.
 *
 * Tests:
 * - GET /api/sessions/[id] returns correct session data with included relations
 * - GET /api/sessions/[id] returns 404 for non-existent ID
 * - GET /api/dashboard/stats returns expected shape with live session fields
 * - GET /api/sessions filters correctly by status
 *
 * Requires: Docker PostgreSQL container running on port 5432.
 */

// ---------- helpers ----------

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const init: RequestInit = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (options.body) {
    init.body = JSON.stringify(options.body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

function validTargetPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Live Session Test Target",
    description: "Target for live session integration tests",
    connectorType: "HTTP_REST",
    endpoint: "http://localhost:3001/chat",
    authType: "NONE",
    authConfig: {},
    requestTemplate: {
      messagePath: "$.message",
      structure: { message: "" },
    },
    responseTemplate: {
      contentPath: "$.response",
    },
    ...overrides,
  };
}

function validScenarioPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Live Session Test Scenario",
    description: "Scenario for live session integration tests",
    category: "test",
    flowConfig: [
      { id: "step1", type: "message", config: { message: "Hello" } },
    ],
    repetitions: 1,
    concurrency: 1,
    delayBetweenMs: 0,
    verbosityLevel: "normal",
    messageTemplates: {},
    ...overrides,
  };
}

// ---------- test data tracking for cleanup ----------

const createdTargetIds: string[] = [];
const createdScenarioIds: string[] = [];
const createdSessionIds: string[] = [];

afterAll(async () => {
  // Clean up in reverse dependency order
  if (createdSessionIds.length > 0) {
    await prisma.sessionMetric.deleteMany({
      where: { sessionId: { in: createdSessionIds } },
    });
    await prisma.session.deleteMany({
      where: { id: { in: createdSessionIds } },
    });
  }
  if (createdScenarioIds.length > 0) {
    await prisma.scenario.deleteMany({
      where: { id: { in: createdScenarioIds } },
    });
  }
  if (createdTargetIds.length > 0) {
    await prisma.target.deleteMany({
      where: { id: { in: createdTargetIds } },
    });
  }
});

// ============================================================
// Seed data: create target, scenario, and a session directly
// ============================================================

let targetId: string;
let scenarioId: string;
let sessionId: string;

// Use beforeAll-style setup via describe ordering
describe("Live Session Flow", () => {
  describe("setup: create test data", () => {
    it("should create a target for session tests", async () => {
      const { POST } = await import("@/app/api/targets/route");
      const req = makeRequest("http://localhost:3000/api/targets", {
        method: "POST",
        body: validTargetPayload(),
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      targetId = body.data.id;
      createdTargetIds.push(targetId);
    });

    it("should create a scenario for session tests", async () => {
      const { POST } = await import("@/app/api/scenarios/route");
      const req = makeRequest("http://localhost:3000/api/scenarios", {
        method: "POST",
        body: validScenarioPayload({ targetId }),
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      scenarioId = body.data.id;
      createdScenarioIds.push(scenarioId);
    });

    it("should create a session via /api/execute", async () => {
      const { POST } = await import("@/app/api/execute/route");
      const req = makeRequest("http://localhost:3000/api/execute", {
        method: "POST",
        body: {
          targetId,
          scenarioId,
          executionConfig: {
            customMessages: ["Hello from live session test"],
            repetitions: 1,
            verbosityLevel: "normal",
          },
        },
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBeDefined();
      sessionId = body.data.sessionId;
      createdSessionIds.push(sessionId);
    });
  });

  // ============================================================
  // GET /api/sessions/[id]
  // ============================================================

  describe("GET /api/sessions/[id]", () => {
    it("should return session data with target and scenario relations", async () => {
      const { GET } = await import("@/app/api/sessions/[id]/route");
      const req = makeRequest(
        `http://localhost:3000/api/sessions/${sessionId}`
      );

      const response = await GET(req, {
        params: Promise.resolve({ id: sessionId }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Session fields
      expect(body.data.id).toBe(sessionId);
      expect(body.data.targetId).toBe(targetId);
      expect(body.data.status).toBeDefined();
      expect(body.data.executionConfig).toBeDefined();

      // Target relation included
      expect(body.data.target).toBeDefined();
      expect(body.data.target.id).toBe(targetId);
      expect(body.data.target.name).toBe("Live Session Test Target");
      expect(body.data.target.connectorType).toBe("HTTP_REST");

      // Scenario relation included (may be null if scenarioId was not linked)
      if (body.data.scenarioId) {
        expect(body.data.scenario).toBeDefined();
        expect(body.data.scenario.name).toBeDefined();
      }
    });

    it("should return correct session status", async () => {
      const { GET } = await import("@/app/api/sessions/[id]/route");
      const req = makeRequest(
        `http://localhost:3000/api/sessions/${sessionId}`
      );

      const response = await GET(req, {
        params: Promise.resolve({ id: sessionId }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      // Status should be one of the valid SessionStatus values
      expect([
        "PENDING",
        "QUEUED",
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ]).toContain(body.data.status);
    });

    it("should return 404 for non-existent session ID", async () => {
      const { GET } = await import("@/app/api/sessions/[id]/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions/clxxxxxxxxxxxxxxxxxx"
      );

      const response = await GET(req, {
        params: Promise.resolve({ id: "clxxxxxxxxxxxxxxxxxx" }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Session not found");
    });

    it("should return 404 for empty session ID", async () => {
      const { GET } = await import("@/app/api/sessions/[id]/route");
      const req = makeRequest("http://localhost:3000/api/sessions/");

      const response = await GET(req, {
        params: Promise.resolve({ id: "" }),
      });
      const body = await response.json();

      // Should return 404 (no session with empty ID exists)
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/dashboard/stats
  // ============================================================

  describe("GET /api/dashboard/stats", () => {
    it("should return dashboard stats with expected shape", async () => {
      const { GET } = await import("@/app/api/dashboard/stats/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      // Counts section
      expect(body.data.counts).toBeDefined();
      expect(typeof body.data.counts.targets).toBe("number");
      expect(typeof body.data.counts.scenarios).toBe("number");
      expect(typeof body.data.counts.activeSessions).toBe("number");
      expect(typeof body.data.counts.totalSessions).toBe("number");

      // Metrics section
      expect(body.data.metrics).toBeDefined();
      expect(typeof body.data.metrics.avgResponseTimeMs).toBe("number");
      expect(typeof body.data.metrics.totalTokensConsumed).toBe("number");
      expect(typeof body.data.metrics.errorRate).toBe("number");
      expect(typeof body.data.metrics.sessionsLast24h).toBe("number");

      // Recent sessions section
      expect(body.data.recentSessions).toBeDefined();
      expect(Array.isArray(body.data.recentSessions)).toBe(true);
    });

    it("should include at least one session in counts after execution", async () => {
      const { GET } = await import("@/app/api/dashboard/stats/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.counts.totalSessions).toBeGreaterThanOrEqual(1);
    });

    it("should count active sessions (RUNNING + QUEUED)", async () => {
      const { GET } = await import("@/app/api/dashboard/stats/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      // activeSessions should be a non-negative number
      expect(body.data.counts.activeSessions).toBeGreaterThanOrEqual(0);
    });

    it("should include recent sessions with correct shape", async () => {
      const { GET } = await import("@/app/api/dashboard/stats/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);

      if (body.data.recentSessions.length > 0) {
        const recent = body.data.recentSessions[0];
        expect(recent.id).toBeDefined();
        expect(recent.targetName).toBeDefined();
        expect(recent.status).toBeDefined();
        // scenarioName may be null
        expect("scenarioName" in recent).toBe(true);
        expect("startedAt" in recent).toBe(true);
      }
    });

    it("should return error rate between 0 and 1", async () => {
      const { GET } = await import("@/app/api/dashboard/stats/route");
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(body.data.metrics.errorRate).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // GET /api/sessions - status filter
  // ============================================================

  describe("GET /api/sessions - filtering", () => {
    it("should filter sessions by QUEUED status", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?status=QUEUED"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      body.data.forEach((s: any) => {
        expect(s.status).toBe("QUEUED");
      });
    });

    it("should filter sessions by RUNNING status", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?status=RUNNING"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      body.data.forEach((s: any) => {
        expect(s.status).toBe("RUNNING");
      });
    });

    it("should filter sessions by COMPLETED status", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?status=COMPLETED"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      body.data.forEach((s: any) => {
        expect(s.status).toBe("COMPLETED");
      });
    });

    it("should filter sessions by FAILED status", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?status=FAILED"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      body.data.forEach((s: any) => {
        expect(s.status).toBe("FAILED");
      });
    });

    it("should filter sessions by targetId", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        `http://localhost:3000/api/sessions?targetId=${targetId}`
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      body.data.forEach((s: any) => {
        expect(s.targetId).toBe(targetId);
      });
    });

    it("should return empty results for non-existent targetId filter", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?targetId=clxxxxxxxxxxxxxxxxxx"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(0);
      expect(body.pagination.total).toBe(0);
    });

    it("should include target and scenario names in session list", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        `http://localhost:3000/api/sessions?targetId=${targetId}`
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const session = body.data[0];
      // Target relation should be included
      expect(session.target).toBeDefined();
      expect(session.target.name).toBe("Live Session Test Target");
      expect(session.target.connectorType).toBe("HTTP_REST");
    });

    it("should support pagination with limit and offset", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = makeRequest(
        "http://localhost:3000/api/sessions?limit=1&offset=0"
      );

      const response = await GET(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(1);
      expect(body.pagination.limit).toBe(1);
      expect(body.pagination.offset).toBe(0);
    });
  });
});
