"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp, ArrowDown, Loader2, ExternalLink } from "lucide-react";

interface LogMessage {
  direction: "sent" | "received";
  content: string;
  timestamp: string;
  responseTimeMs?: number;
  tokenCount?: number;
}

interface MiniLogViewerProps {
  sessionId: string;
  onComplete?: () => void;
}

export function MiniLogViewer({ sessionId, onComplete }: MiniLogViewerProps) {
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [status, setStatus] = useState<string>("connecting");
  const [totalMessages, setTotalMessages] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("status", (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status || "running");
      } catch {
        // ignore
      }
    });

    es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const msg: LogMessage = {
          direction: data.direction || (data.role === "user" ? "sent" : "received"),
          content: data.content || data.message || "",
          timestamp: data.timestamp || new Date().toISOString(),
          responseTimeMs: data.responseTimeMs || data.latencyMs,
          tokenCount: data.tokenCount || data.tokens,
        };
        setMessages((prev) => [...prev, msg]);
        setTotalMessages((prev) => prev + 1);
      } catch {
        // ignore
      }
    });

    es.addEventListener("complete", () => {
      setStatus("completed");
      es.close();
      onComplete?.();
    });

    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("completed");
        onComplete?.();
      }
    });

    es.onerror = () => {
      setStatus("completed");
      es.close();
      onComplete?.();
    };

    return () => {
      es.close();
    };
  }, [sessionId, onComplete]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isRunning = status === "running" || status === "connecting";

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs">
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="text-blue-400">
                {status === "connecting" ? "Connecting..." : `Running... ${totalMessages} messages`}
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-400">
                Complete — {totalMessages} messages
              </span>
            </>
          )}
        </div>
        <a
          href={`/sessions/${sessionId}`}
          className="text-[10px] text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          Full view
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/50">
        {messages.length === 0 && isRunning && (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            Waiting for messages...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="px-3 py-2 hover:bg-gray-800/30 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              {msg.direction === "sent" ? (
                <ArrowUp className="h-3 w-3 text-blue-400 shrink-0" />
              ) : (
                <ArrowDown className="h-3 w-3 text-emerald-400 shrink-0" />
              )}
              <span className={`text-[10px] font-medium ${
                msg.direction === "sent" ? "text-blue-400" : "text-emerald-400"
              }`}>
                {msg.direction === "sent" ? "Sent" : "Received"}
              </span>
              {msg.responseTimeMs != null && (
                <span className="text-[10px] text-gray-600">{Math.round(msg.responseTimeMs)}ms</span>
              )}
              {msg.tokenCount != null && (
                <span className="text-[10px] text-gray-600">{msg.tokenCount} tokens</span>
              )}
            </div>
            <p className="text-xs text-gray-400 line-clamp-3 pl-5">{msg.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
