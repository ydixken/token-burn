import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  const afterParam = request.nextUrl.searchParams.get("after");
  const after = afterParam !== null ? parseInt(afterParam, 10) : -1;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let messages: unknown[] = [];

    if (session.logPath) {
      const messagesPath = path.join(session.logPath, "messages.jsonl");

      if (fs.existsSync(messagesPath)) {
        try {
          const content = fs.readFileSync(messagesPath, "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const message = JSON.parse(line);
              if (typeof message.index === "number" && message.index > after) {
                messages.push(message);
              }
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // File read error — return empty messages
        }
      }
    }

    return NextResponse.json({
      messages,
      status: session.status,
      completedAt: session.completedAt,
    });
  } catch (error) {
    console.error("Messages API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
