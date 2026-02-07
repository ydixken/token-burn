"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
  startedAt?: string;
}

function useElapsedTime(startedAt: string | undefined, isActive: boolean) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startedAt) return;

    const update = () => {
      const start = new Date(startedAt).getTime();
      const diff = Date.now() - start;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds % 60}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    update();

    if (!isActive) return;

    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  return elapsed;
}

export default function LogViewer({ sessionId, startedAt }: LogViewerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isPausedRef = useRef(false);
  const isUserScrolledUpRef = useRef(false);

  const isActive = status === "RUNNING" || status === "QUEUED";
  const elapsed = useElapsedTime(startedAt, isActive);

  // Keep ref in sync with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessageCount(0);
    setShowScrollButton(false);
    isUserScrolledUpRef.current = false;
  }, []);

  // Handle scroll events to detect user scrolling up
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 80;

    isUserScrolledUpRef.current = !isNearBottom;
    setShowScrollButton(!isNearBottom && messages.length > 0);

    // If user scrolled back to bottom, clear new message count
    if (isNearBottom) {
      setNewMessageCount(0);
    }
  }, [messages.length]);

  useEffect(() => {
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId]);

  // Auto-scroll when new messages arrive (unless paused or user scrolled up)
  useEffect(() => {
    if (!isPausedRef.current && !isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
              // Track new messages when paused or scrolled up
              if (isPausedRef.current || isUserScrolledUpRef.current) {
                setNewMessageCount((prev) => prev + 1);
              }
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

  const handlePauseToggle = () => {
    const next = !isPaused;
    setIsPaused(next);
    if (!next) {
      // Resuming: scroll to bottom and clear count
      setNewMessageCount(0);
      isUserScrolledUpRef.current = false;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
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

          {elapsed && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Elapsed:</span>
              <span className="text-sm font-mono text-blue-400">{elapsed}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Pause/Resume button */}
          {isConnected && (
            <button
              onClick={handlePauseToggle}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isPaused
                  ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {isPaused ? "Resume Auto-scroll" : "Pause Auto-scroll"}
            </button>
          )}

          <div className="text-sm text-gray-400">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {/* New messages indicator when paused */}
      {(isPaused || isUserScrolledUpRef.current) && newMessageCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="w-full py-2 bg-blue-600/20 border border-blue-700 rounded-lg text-blue-300 text-sm font-medium hover:bg-blue-600/30 transition-colors"
        >
          {newMessageCount} new message{newMessageCount !== 1 ? "s" : ""} below
        </button>
      )}

      {/* Messages Log */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="bg-gray-800 rounded-lg border border-gray-700 h-[600px] overflow-y-auto"
        >
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
                        <span>Response: {message.responseTimeMs}ms</span>
                      )}
                      {message.tokenUsage?.totalTokens && (
                        <span>Tokens: {message.tokenUsage.totalTokens}</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Scroll to bottom floating button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-lg transition-colors flex items-center gap-1.5"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
            Scroll to bottom
            {newMessageCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-500 rounded-full text-[10px]">
                {newMessageCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
