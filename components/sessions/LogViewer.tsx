"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  timestamp: string;
  direction: "sent" | "received";
  content: string;
  success?: boolean;
  error?: string;
  responseTimeMs?: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

interface LogViewerProps {
  sessionId: string;
}

export default function LogViewer({ sessionId }: LogViewerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connectToStream = () => {
    try {
      const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "status":
              setStatus(data.status);
              break;

            case "message":
              setMessages((prev) => [...prev, data.data]);
              break;

            case "complete":
              setStatus(data.status);
              eventSource.close();
              setIsConnected(false);
              break;

            default:
              console.warn("Unknown event type:", data.type);
          }
        } catch (parseError) {
          console.error("Failed to parse SSE message:", parseError);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE error:", err);
        setError("Connection lost. Retrying...");
        setIsConnected(false);
        eventSource.close();

        // Retry after 3 seconds
        setTimeout(() => {
          if (status === "RUNNING" || status === "QUEUED") {
            connectToStream();
          }
        }, 3000);
      };
    } catch (err) {
      console.error("Failed to connect to stream:", err);
      setError("Failed to connect to log stream");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "text-green-400";
      case "FAILED":
        return "text-red-400";
      case "RUNNING":
        return "text-blue-400";
      case "QUEUED":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-900/50 text-green-300";
      case "FAILED":
        return "bg-red-900/50 text-red-300";
      case "RUNNING":
        return "bg-blue-900/50 text-blue-300";
      case "QUEUED":
        return "bg-yellow-900/50 text-yellow-300";
      default:
        return "bg-gray-900/50 text-gray-300";
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm text-gray-400">Status:</span>
            <span className={`ml-2 px-3 py-1 rounded text-sm font-medium ${getStatusBadge(status)}`}>
              {status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-400">
              {isConnected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Messages Log */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 h-[600px] overflow-y-auto">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {status === "PENDING" || status === "QUEUED"
                ? "Waiting for session to start..."
                : "No messages yet"}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.direction === "sent"
                    ? "bg-blue-900/20 border border-blue-800"
                    : "bg-gray-700/50 border border-gray-600"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        message.direction === "sent"
                          ? "bg-blue-700 text-blue-100"
                          : "bg-gray-600 text-gray-100"
                      }`}
                    >
                      {message.direction === "sent" ? "SENT" : "RECEIVED"}
                    </span>

                    {message.success === false && (
                      <span className="text-xs font-medium px-2 py-1 rounded bg-red-700 text-red-100">
                        ERROR
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-gray-400">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                  {message.content}
                </div>

                {message.error && (
                  <div className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded">
                    {message.error}
                  </div>
                )}

                {(message.responseTimeMs || message.tokenUsage) && (
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    {message.responseTimeMs && (
                      <span>⏱️ {message.responseTimeMs}ms</span>
                    )}
                    {message.tokenUsage?.totalTokens && (
                      <span>🪙 {message.tokenUsage.totalTokens} tokens</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
