"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface StreamEvent {
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  success?: boolean;
}

export interface TestStreamResult {
  success: boolean;
  data: {
    healthy: boolean;
    latencyMs: number;
    connectLatencyMs?: number;
    healthCheckLatencyMs?: number;
    testResponse?: string;
    connectorType?: string;
    error?: string;
  };
}

type StreamStatus = "idle" | "streaming" | "success" | "failure";

export function useTestConnectionStream(targetId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [result, setResult] = useState<TestStreamResult | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setEvents([]);
    setStatus("idle");
    setResult(null);
  }, [cleanup]);

  const startTest = useCallback(() => {
    if (!targetId) return;

    // Reset state
    setEvents([]);
    setStatus("streaming");
    setResult(null);
    cleanup();

    const es = new EventSource(`/api/targets/${targetId}/test/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: StreamEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, data]);

        if (data.type === "result") {
          const testResult: TestStreamResult = {
            success: data.success ?? false,
            data: (data.data as TestStreamResult["data"]) ?? {
              healthy: false,
              latencyMs: 0,
            },
          };
          setResult(testResult);
          setStatus(testResult.success ? "success" : "failure");
          es.close();
          eventSourceRef.current = null;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setStatus("failure");
      es.close();
      eventSourceRef.current = null;
    };
  }, [targetId, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { events, status, result, startTest, reset };
}
