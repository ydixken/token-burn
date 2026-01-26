import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;

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

    if (!session.logPath) {
      return new Response(
        JSON.stringify({ error: "No logs available for this session" }),
        { status: 404 }
      );
    }

    const messagesPath = path.join(session.logPath, "messages.jsonl");

    // Check if log file exists
    if (!fs.existsSync(messagesPath)) {
      return new Response(
        JSON.stringify({ error: "Log file not found" }),
        { status: 404 }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send initial session status
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: "status",
            status: session.status,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
          })}\n\n`)
        );

        // Read and send existing messages
        try {
          const content = fs.readFileSync(messagesPath, "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const message = JSON.parse(line);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "message",
                  data: message,
                })}\n\n`)
              );
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
          let checkInterval: NodeJS.Timeout;

          const checkForUpdates = () => {
            try {
              const currentSize = fs.statSync(messagesPath).size;

              if (currentSize > lastSize) {
                // Read only new content
                const stream = fs.createReadStream(messagesPath, {
                  start: lastSize,
                  encoding: "utf-8",
                });

                let buffer = "";

                stream.on("data", (chunk) => {
                  buffer += chunk;
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || ""; // Keep incomplete line in buffer

                  for (const line of lines) {
                    if (line.trim()) {
                      try {
                        const message = JSON.parse(line);
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({
                            type: "message",
                            data: message,
                          })}\n\n`)
                        );
                      } catch (parseError) {
                        console.error("Failed to parse message:", parseError);
                      }
                    }
                  }
                });

                stream.on("end", () => {
                  lastSize = currentSize;
                });
              }

              // Check if session completed
              prisma.session.findUnique({ where: { id: sessionId } })
                .then((updatedSession) => {
                  if (updatedSession && 
                      updatedSession.status !== "RUNNING" && 
                      updatedSession.status !== "QUEUED") {
                    // Send completion event
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "complete",
                        status: updatedSession.status,
                        completedAt: updatedSession.completedAt,
                      })}\n\n`)
                    );

                    clearInterval(checkInterval);
                    controller.close();
                  }
                })
                .catch((err) => {
                  console.error("Failed to check session status:", err);
                });
            } catch (error) {
              console.error("Error checking for updates:", error);
            }
          };

          // Check for updates every 500ms
          checkInterval = setInterval(checkForUpdates, 500);

          // Cleanup on client disconnect
          request.signal.addEventListener("abort", () => {
            clearInterval(checkInterval);
            controller.close();
          });
        } else {
          // Session already completed, send completion event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "complete",
              status: session.status,
              completedAt: session.completedAt,
            })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
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
