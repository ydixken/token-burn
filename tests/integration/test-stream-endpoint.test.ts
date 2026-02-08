import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before imports
const mockTarget = vi.hoisted(() => ({
  id: "target-1",
  name: "Test Target",
  connectorType: "HTTP_REST",
  endpoint: "http://localhost:3000/api",
  authType: "NONE",
  authConfig: {},
  requestTemplate: { messagePath: "message", structure: { message: "" } },
  responseTemplate: { responsePath: "response" },
  protocolConfig: null,
  isActive: true,
}));

const mockPrisma = vi.hoisted(() => ({
  target: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const mockConnector = vi.hoisted(() => ({
  setOnProgress: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 10, timestamp: new Date() }),
  sendMessage: vi.fn().mockResolvedValue({ content: "Hello back", metadata: { responseTimeMs: 50 } }),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/utils/crypto", () => ({
  decrypt: vi.fn((v: string) => v),
}));

vi.mock("@/lib/connectors/registry", () => ({
  ConnectorRegistry: {
    create: vi.fn().mockResolvedValue(mockConnector),
  },
}));

// Mock redis to prevent REDIS_URL error
vi.mock("@/lib/cache/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    duplicate: vi.fn().mockReturnValue({
      subscribe: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
    }),
    publish: vi.fn(),
  },
}));

import { GET } from "@/app/api/targets/[id]/test/stream/route";
import { NextRequest } from "next/server";

function createRequest(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/targets/${id}/test/stream`);
  return [req, { params: Promise.resolve({ id }) }];
}

async function readSSEEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<Record<string, unknown>> = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {
          // skip
        }
      }
    }
  }

  return events;
}

describe("GET /api/targets/[id]/test/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.target.findUnique.mockResolvedValue(mockTarget);
    mockPrisma.target.update.mockResolvedValue(mockTarget);
    mockConnector.connect.mockResolvedValue(undefined);
    mockConnector.healthCheck.mockResolvedValue({ healthy: true, latencyMs: 10, timestamp: new Date() });
    mockConnector.sendMessage.mockResolvedValue({ content: "Hello back", metadata: { responseTimeMs: 50 } });
    mockConnector.disconnect.mockResolvedValue(undefined);
  });

  it("should return 404 for non-existent target", async () => {
    mockPrisma.target.findUnique.mockResolvedValue(null);
    const [req, context] = createRequest("nonexistent");
    const response = await GET(req, context);
    expect(response.status).toBe(404);
  });

  it("should return 400 for inactive target", async () => {
    mockPrisma.target.findUnique.mockResolvedValue({ ...mockTarget, isActive: false });
    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    expect(response.status).toBe(400);
  });

  it("should return SSE response headers", async () => {
    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
  });

  it("should stream events and end with result", async () => {
    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    const events = await readSSEEvents(response);

    // Should have step events and a final result
    expect(events.length).toBeGreaterThanOrEqual(4); // connect, health, message, result

    const resultEvent = events.find((e) => e.type === "result");
    expect(resultEvent).toBeDefined();
    expect(resultEvent!.success).toBe(true);
  });

  it("should stream failure result when health check fails", async () => {
    mockConnector.healthCheck.mockResolvedValue({ healthy: false, error: "Unhealthy", timestamp: new Date() });

    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    const events = await readSSEEvents(response);

    const resultEvent = events.find((e) => e.type === "result");
    expect(resultEvent).toBeDefined();
    expect(resultEvent!.success).toBe(false);
  });

  it("should update target with test results", async () => {
    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    await readSSEEvents(response); // consume the stream

    expect(mockPrisma.target.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target-1" },
        data: expect.objectContaining({
          lastTestAt: expect.any(Date),
          lastTestSuccess: true,
        }),
      })
    );
  });

  it("should handle connection errors gracefully", async () => {
    mockConnector.connect.mockRejectedValue(new Error("Connection refused"));

    const [req, context] = createRequest("target-1");
    const response = await GET(req, context);
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();

    const resultEvent = events.find((e) => e.type === "result");
    expect(resultEvent).toBeDefined();
    expect(resultEvent!.success).toBe(false);
  });
});
