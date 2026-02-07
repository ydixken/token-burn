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

interface Anomaly {
  index: number;
  type: "slow_response" | "error" | "repetition";
  label: string;
}

interface SessionReplayProps {
  sessionId: string;
}

type PlaybackSpeed = 1 | 2 | 5 | 0;

function detectAnomalies(messages: Message[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const responseTimes = messages
    .map((m) => m.responseTimeMs)
    .filter((t): t is number => t !== undefined && t > 0);
  const avgResponseTime =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
  const threshold = Math.max(avgResponseTime * 2, 1000);

  const seenContents = new Set<string>();

  messages.forEach((msg, i) => {
    if (msg.success === false || msg.error) {
      anomalies.push({ index: i, type: "error", label: "Error" });
    }
    if (msg.responseTimeMs && msg.responseTimeMs > threshold) {
      anomalies.push({ index: i, type: "slow_response", label: `Slow (${Math.round(msg.responseTimeMs)}ms)` });
    }
    const contentKey = `${msg.direction}:${msg.content.trim().substring(0, 100)}`;
    if (seenContents.has(contentKey)) {
      anomalies.push({ index: i, type: "repetition", label: "Repeated" });
    }
    seenContents.add(contentKey);
  });

  return anomalies;
}

function getAnomalyColor(type: Anomaly["type"]): string {
  switch (type) {
    case "error":
      return "bg-red-500";
    case "slow_response":
      return "bg-yellow-500";
    case "repetition":
      return "bg-orange-500";
  }
}

function getAnomalyBadge(type: Anomaly["type"]): string {
  switch (type) {
    case "error":
      return "bg-red-900/50 text-red-300 border-red-700";
    case "slow_response":
      return "bg-yellow-900/50 text-yellow-300 border-yellow-700";
    case "repetition":
      return "bg-orange-900/50 text-orange-300 border-orange-700";
  }
}

export default function SessionReplay({ sessionId }: SessionReplayProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  // Load messages via SSE
  useEffect(() => {
    const allMessages: Message[] = [];
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "message") {
            allMessages.push(data.data);
            setMessages([...allMessages]);
          }
          if (data.type === "complete") {
            eventSource?.close();
            setLoadingMessages(false);
          }
        } catch {
          // skip parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        // If we got messages, consider loading done
        if (allMessages.length > 0) {
          setLoadingMessages(false);
        }
      };
    } catch {
      setLoadingMessages(false);
    }

    // Also try fetching session data directly for completed sessions
    const fetchSessionMessages = async () => {
      try {
        const resp = await fetch(`/api/sessions/${sessionId}`);
        const data = await resp.json();
        if (data.success && data.data?.messages?.length > 0) {
          setMessages(data.data.messages);
          setLoadingMessages(false);
          eventSource?.close();
        }
      } catch {
        // rely on SSE
      }
    };
    fetchSessionMessages();

    return () => {
      eventSource?.close();
    };
  }, [sessionId]);

  // Detect anomalies when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setAnomalies(detectAnomalies(messages));
    }
  }, [messages]);

  // Scroll current message into view
  useEffect(() => {
    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  // Playback logic
  const advancePlayback = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= messages.length - 1) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!playing || messages.length === 0) return;

    if (speed === 0) {
      // Instant: jump to end
      setCurrentIndex(messages.length - 1);
      setPlaying(false);
      return;
    }

    // Calculate delay based on real time gap between messages
    const currentMsg = messages[currentIndex];
    const nextMsg = messages[currentIndex + 1];
    let delay = 1000;

    if (currentMsg && nextMsg) {
      const gap = new Date(nextMsg.timestamp).getTime() - new Date(currentMsg.timestamp).getTime();
      delay = Math.max(gap / speed, 100);
      // Cap max delay at 3 seconds even at 1x
      delay = Math.min(delay, 3000 / speed);
    }

    playTimerRef.current = setTimeout(advancePlayback, delay);
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [playing, currentIndex, speed, messages, advancePlayback]);

  const handlePlay = () => {
    if (currentIndex >= messages.length - 1) {
      setCurrentIndex(0);
    }
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  const handlePrev = () => {
    setPlaying(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setPlaying(false);
    setCurrentIndex((prev) => Math.min(messages.length - 1, prev + 1));
  };

  const handleScrub = (index: number) => {
    setPlaying(false);
    setCurrentIndex(index);
  };

  const currentMessage = messages[currentIndex] || null;

  // Compute timeline stats
  const timelineStart = messages.length > 0 ? new Date(messages[0].timestamp).getTime() : 0;
  const timelineEnd =
    messages.length > 0 ? new Date(messages[messages.length - 1].timestamp).getTime() : 0;
  const timelineSpan = timelineEnd - timelineStart || 1;

  // Get anomalies for current message
  const currentAnomalies = anomalies.filter((a) => a.index === currentIndex);

  if (loadingMessages && messages.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
        <div className="text-gray-400 mb-2">Loading session messages for replay...</div>
        <div className="text-xs text-gray-500">Connecting to session stream</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
        <div className="text-gray-400">No messages to replay</div>
        <div className="text-xs text-gray-500 mt-1">This session has no recorded messages</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Prev */}
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-sm transition"
              title="Previous message"
            >
              Prev
            </button>

            {/* Play/Pause */}
            {playing ? (
              <button
                onClick={handlePause}
                className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-medium transition"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={handlePlay}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition"
              >
                Play
              </button>
            )}

            {/* Next */}
            <button
              onClick={handleNext}
              disabled={currentIndex >= messages.length - 1}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-sm transition"
              title="Next message"
            >
              Next
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-600 mx-2" />

            {/* Speed */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 mr-1">Speed:</span>
              {([1, 2, 5, 0] as PlaybackSpeed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    speed === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                  }`}
                >
                  {s === 0 ? "Instant" : `${s}x`}
                </button>
              ))}
            </div>
          </div>

          {/* Position info */}
          <div className="text-sm text-gray-400">
            Message{" "}
            <span className="text-white font-medium">{currentIndex + 1}</span> of{" "}
            <span className="text-white font-medium">{messages.length}</span>
            {anomalies.length > 0 && (
              <span className="ml-3 text-xs text-yellow-400">
                {anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="relative h-10">
          {/* Track background */}
          <div className="absolute inset-x-0 top-4 h-2 bg-gray-700 rounded-full" />

          {/* Anomaly markers */}
          {anomalies.map((anomaly, i) => {
            const msgTime = new Date(messages[anomaly.index].timestamp).getTime();
            const pos = ((msgTime - timelineStart) / timelineSpan) * 100;
            return (
              <button
                key={`${anomaly.index}-${anomaly.type}-${i}`}
                onClick={() => handleScrub(anomaly.index)}
                className={`absolute top-2.5 w-3 h-3 rounded-full ${getAnomalyColor(anomaly.type)} hover:scale-125 transition-transform z-10`}
                style={{ left: `calc(${pos}% - 6px)` }}
                title={`${anomaly.label} (message #${anomaly.index + 1})`}
              />
            );
          })}

          {/* Message position dots */}
          {messages.map((msg, i) => {
            const msgTime = new Date(msg.timestamp).getTime();
            const pos = ((msgTime - timelineStart) / timelineSpan) * 100;
            const isActive = i === currentIndex;
            const isPast = i < currentIndex;
            return (
              <button
                key={i}
                onClick={() => handleScrub(i)}
                className={`absolute top-3 w-2 h-2 rounded-full transition-all ${
                  isActive
                    ? "bg-blue-400 scale-150 ring-2 ring-blue-400/50 z-20"
                    : isPast
                    ? "bg-gray-500 hover:bg-gray-400 z-0"
                    : "bg-gray-600 hover:bg-gray-500 z-0"
                }`}
                style={{ left: `calc(${pos}% - 4px)` }}
                title={`Message #${i + 1}: ${msg.direction === "sent" ? "Sent" : "Received"}`}
              />
            );
          })}

          {/* Progress bar */}
          {currentIndex > 0 && (
            <div
              className="absolute top-4 h-2 bg-blue-600/40 rounded-full"
              style={{
                left: 0,
                width: `${
                  ((new Date(messages[currentIndex].timestamp).getTime() - timelineStart) /
                    timelineSpan) *
                  100
                }%`,
              }}
            />
          )}
        </div>

        {/* Time labels */}
        <div className="flex justify-between mt-2 text-[10px] text-gray-500">
          <span>{messages.length > 0 ? new Date(messages[0].timestamp).toLocaleTimeString() : ""}</span>
          <span>
            {messages.length > 0
              ? new Date(messages[messages.length - 1].timestamp).toLocaleTimeString()
              : ""}
          </span>
        </div>
      </div>

      {/* Main content: Message view + Metrics panel */}
      <div className="flex gap-4">
        {/* Message viewer */}
        <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {/* Visible messages (show context around current) */}
          <div className="h-[500px] overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => {
              const isActive = i === currentIndex;
              const isVisible = i <= currentIndex;
              const msgAnomalies = anomalies.filter((a) => a.index === i);

              if (!isVisible) return null;

              return (
                <div
                  key={i}
                  ref={isActive ? messageRef : undefined}
                  onClick={() => handleScrub(i)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    msg.direction === "sent"
                      ? "bg-blue-900/20 border border-blue-800"
                      : "bg-gray-700/50 border border-gray-600"
                  } ${
                    isActive
                      ? "ring-2 ring-blue-500 shadow-lg shadow-blue-500/10"
                      : "opacity-60 hover:opacity-80"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">#{i + 1}</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          msg.direction === "sent"
                            ? "bg-blue-700 text-blue-100"
                            : "bg-gray-600 text-gray-100"
                        }`}
                      >
                        {msg.direction === "sent" ? "SENT" : "RECEIVED"}
                      </span>
                      {msg.success === false && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-700 text-red-100">
                          ERROR
                        </span>
                      )}
                      {msgAnomalies.map((a, ai) => (
                        <span
                          key={ai}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getAnomalyBadge(a.type)}`}
                        >
                          {a.label}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>

                  {msg.error && (
                    <div className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded">
                      {msg.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel: Per-message metrics */}
        <div className="w-64 flex-shrink-0 bg-gray-800 rounded-lg border border-gray-700 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Message Metrics</h3>

          {currentMessage ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Direction</div>
                <div className={`text-sm font-medium ${currentMessage.direction === "sent" ? "text-blue-400" : "text-gray-200"}`}>
                  {currentMessage.direction === "sent" ? "Sent" : "Received"}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Timestamp</div>
                <div className="text-sm text-gray-200">
                  {new Date(currentMessage.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-[10px] text-gray-500">
                  {new Date(currentMessage.timestamp).toLocaleDateString()}
                </div>
              </div>

              {currentMessage.responseTimeMs !== undefined && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Response Time</div>
                  <div className={`text-lg font-bold ${
                    currentMessage.responseTimeMs > 2000
                      ? "text-red-400"
                      : currentMessage.responseTimeMs > 1000
                      ? "text-yellow-400"
                      : "text-green-400"
                  }`}>
                    {Math.round(currentMessage.responseTimeMs)}ms
                  </div>
                </div>
              )}

              {currentMessage.tokenUsage && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Token Usage</div>
                  <div className="space-y-1 text-sm">
                    {currentMessage.tokenUsage.promptTokens !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Prompt</span>
                        <span className="text-gray-200">{currentMessage.tokenUsage.promptTokens}</span>
                      </div>
                    )}
                    {currentMessage.tokenUsage.completionTokens !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Completion</span>
                        <span className="text-gray-200">{currentMessage.tokenUsage.completionTokens}</span>
                      </div>
                    )}
                    {currentMessage.tokenUsage.totalTokens !== undefined && (
                      <div className="flex justify-between pt-1 border-t border-gray-700">
                        <span className="text-gray-300 font-medium">Total</span>
                        <span className="text-white font-medium">{currentMessage.tokenUsage.totalTokens}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentMessage.success === false && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <div className="text-sm text-red-400 font-medium">Failed</div>
                </div>
              )}

              {currentMessage.error && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Error</div>
                  <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                    {currentMessage.error}
                  </div>
                </div>
              )}

              {currentAnomalies.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Anomalies</div>
                  <div className="space-y-1">
                    {currentAnomalies.map((a, i) => (
                      <div
                        key={i}
                        className={`text-xs px-2 py-1 rounded border ${getAnomalyBadge(a.type)}`}
                      >
                        {a.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Context from adjacent messages */}
              {currentIndex > 0 && (
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Time since previous</div>
                  <div className="text-sm text-gray-300">
                    {Math.max(
                      0,
                      new Date(currentMessage.timestamp).getTime() -
                        new Date(messages[currentIndex - 1].timestamp).getTime()
                    )}
                    ms
                  </div>
                </div>
              )}

              {/* Content length */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Content Length</div>
                <div className="text-sm text-gray-300">{currentMessage.content.length} chars</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">No message selected</div>
          )}

          {/* Anomaly legend */}
          {anomalies.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="text-xs text-gray-500 mb-2">Anomaly Legend</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-gray-400">Error</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-gray-400">Slow response</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-gray-400">Repeated message</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
