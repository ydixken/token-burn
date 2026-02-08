"use client";

import { useEffect, useRef } from "react";
import {
  Check,
  X,
  Loader2,
  Globe,
  Wifi,
  Search,
  MessageSquare,
  Shield,
} from "lucide-react";
import type { StreamEvent } from "@/lib/hooks/use-test-connection-stream";

interface DiscoveryProgressTimelineProps {
  events: StreamEvent[];
  status: "idle" | "streaming" | "success" | "failure";
}

function getEventIcon(event: StreamEvent) {
  const type = event.type;
  const message = event.message.toLowerCase();

  if (type === "error" || message.includes("failed")) {
    return <X className="h-3.5 w-3.5 text-red-400" />;
  }
  if (type === "result") {
    return event.success ? (
      <Check className="h-3.5 w-3.5 text-emerald-400" />
    ) : (
      <X className="h-3.5 w-3.5 text-red-400" />
    );
  }
  if (message.includes("navigat")) {
    return <Globe className="h-3.5 w-3.5 text-blue-400" />;
  }
  if (message.includes("websocket") || message.includes("connected")) {
    return <Wifi className="h-3.5 w-3.5 text-purple-400" />;
  }
  if (
    message.includes("widget") ||
    message.includes("selector") ||
    message.includes("detect")
  ) {
    return <Search className="h-3.5 w-3.5 text-amber-400" />;
  }
  if (message.includes("health")) {
    return <Shield className="h-3.5 w-3.5 text-cyan-400" />;
  }
  if (message.includes("message") || message.includes("test")) {
    return <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />;
  }
  return <Loader2 className="h-3.5 w-3.5 text-gray-400" />;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function DiscoveryProgressTimeline({
  events,
  status,
}: DiscoveryProgressTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (events.length === 0 && status === "idle") {
    return null;
  }

  return (
    <div className="mt-4">
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50"
      >
        <div className="p-3 space-y-1.5">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const isStreaming = isLast && status === "streaming";

            return (
              <div
                key={index}
                className={`flex items-start gap-2.5 text-xs ${
                  event.type === "error"
                    ? "text-red-400"
                    : event.type === "result"
                      ? event.success
                        ? "text-emerald-400"
                        : "text-red-400"
                      : "text-gray-300"
                }`}
              >
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {isStreaming ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                  ) : (
                    getEventIcon(event)
                  )}
                </div>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <span className={isStreaming ? "text-blue-300" : ""}>
                    {event.message}
                  </span>

                  {/* Debug data for widget detection failures */}
                  {event.data && event.message.includes("detection failed") && (
                    <div className="mt-1.5 p-2 rounded bg-gray-800 border border-gray-700 text-[10px] space-y-1">
                      {event.data.pageTitle != null && (
                        <div>
                          <span className="text-gray-500">Page:</span>{" "}
                          <span className="text-gray-300">
                            {String(event.data.pageTitle)}
                          </span>
                        </div>
                      )}
                      {event.data.pageUrl != null && (
                        <div>
                          <span className="text-gray-500">URL:</span>{" "}
                          <span className="text-gray-300 break-all">
                            {String(event.data.pageUrl)}
                          </span>
                        </div>
                      )}
                      {event.data.iframeCount !== undefined && (
                        <div>
                          <span className="text-gray-500">Iframes:</span>{" "}
                          <span className="text-gray-300">
                            {String(event.data.iframeCount)}
                          </span>
                        </div>
                      )}
                      {event.data.selectorsTried !== undefined && (
                        <div>
                          <span className="text-gray-500">
                            Selectors tried:
                          </span>{" "}
                          <span className="text-gray-300">
                            {String(event.data.selectorsTried)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="flex-shrink-0 text-gray-600 tabular-nums">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            );
          })}

          {/* Streaming indicator */}
          {status === "streaming" && events.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Starting test...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
