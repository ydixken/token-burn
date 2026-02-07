import { NextRequest } from "next/server";
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

  try {
    // Fetch session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404 }
      );
    }

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const send = (data: object) =>
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

    const close = () => writer.close().catch(() => {});

    // Detached async — runs independently, doesn't block the response
    (async () => {
      try {
        // Send initial session status
        await send({
          type: "status",
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        });

        // If session hasn't started yet (no logPath), wait for it
        if (!session.logPath || !fs.existsSync(path.join(session.logPath, "messages.jsonl"))) {
          if (session.status === "PENDING" || session.status === "QUEUED") {
            // Poll until session starts or is no longer pending
            const waitInterval = setInterval(async () => {
              try {
                const updated = await prisma.session.findUnique({ where: { id: sessionId } });
                if (!updated) {
                  clearInterval(waitInterval);
                  await send({ type: "complete", status: "FAILED" });
                  close();
                  return;
                }

                await send({
                  type: "status",
                  status: updated.status,
                  startedAt: updated.startedAt,
                });

                if (updated.status !== "PENDING" && updated.status !== "QUEUED") {
                  clearInterval(waitInterval);
                  await send({ type: "reconnect" });
                  close();
                }
              } catch {
                // silent
              }
            }, 2000);

            request.signal.addEventListener("abort", () => {
              clearInterval(waitInterval);
              close();
            });
            return;
          }

          // Session is completed/failed but has no log path
          await send({
            type: "complete",
            status: session.status,
            completedAt: session.completedAt,
          });
          close();
          return;
        }

        const messagesPath = path.join(session.logPath, "messages.jsonl");

        // Read and send existing messages
        try {
          const content = fs.readFileSync(messagesPath, "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const message = JSON.parse(line);
              await send({ type: "message", data: message });
            } catch (parseError) {
              console.error("Failed to parse message:", parseError);
            }
          }
        } catch (readError) {
          console.error("Failed to read messages file:", readError);
        }

        // Watch for new messages if session is still running
        if (session.status === "RUNNING" || session.status === "QUEUED") {
          let lastSize = fs.statSync(messagesPath).size;
          let partialLineBuffer = "";
          let checkInterval: NodeJS.Timeout;

          const checkForUpdates = async () => {
            try {
              const currentSize = fs.statSync(messagesPath).size;

              if (currentSize > lastSize) {
                // Read only new bytes synchronously to prevent race condition
                const fd = fs.openSync(messagesPath, "r");
                const readBuffer = Buffer.alloc(currentSize - lastSize);
                fs.readSync(fd, readBuffer, 0, readBuffer.length, lastSize);
                fs.closeSync(fd);

                // Update lastSize immediately to prevent duplicate reads
                lastSize = currentSize;

                const newContent = readBuffer.toString("utf-8");
                const allLines = (partialLineBuffer + newContent).split("\n");
                partialLineBuffer = allLines.pop() || "";

                for (const line of allLines) {
                  if (line.trim()) {
                    try {
                      const message = JSON.parse(line);
                      await send({ type: "message", data: message });
                    } catch (parseError) {
                      console.error("Failed to parse message:", parseError);
                    }
                  }
                }
              }

              // Check if session completed
              try {
                const updatedSession = await prisma.session.findUnique({ where: { id: sessionId } });
                if (updatedSession &&
                    updatedSession.status !== "RUNNING" &&
                    updatedSession.status !== "QUEUED") {
                  await send({
                    type: "complete",
                    status: updatedSession.status,
                    completedAt: updatedSession.completedAt,
                  });
                  clearInterval(checkInterval);
                  close();
                }
              } catch (err) {
                console.error("Failed to check session status:", err);
              }
            } catch (error) {
              console.error("Error checking for updates:", error);
            }
          };

          // Check for updates every 500ms
          checkInterval = setInterval(checkForUpdates, 500);

          // Cleanup on client disconnect
          request.signal.addEventListener("abort", () => {
            clearInterval(checkInterval);
            close();
          });
        } else {
          // Session already completed, send completion event
          await send({
            type: "complete",
            status: session.status,
            completedAt: session.completedAt,
          });
          close();
        }
      } catch (err) {
        console.error("Stream error:", err);
        close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Encoding": "none",
      },
    });
  } catch (error) {
    console.error("Stream API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to stream logs" }),
      { status: 500 }
    );
  }
}
