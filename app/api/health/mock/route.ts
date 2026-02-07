import { NextResponse } from "next/server";

export async function GET() {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch("http://localhost:3001/health", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      return NextResponse.json({
        reachable: true,
        latencyMs,
        status: res.status,
      });
    }

    return NextResponse.json({
      reachable: false,
      latencyMs,
      status: res.status,
    });
  } catch {
    return NextResponse.json({
      reachable: false,
      latencyMs: Date.now() - startTime,
      error: "Mock server not reachable at localhost:3001",
    });
  }
}
