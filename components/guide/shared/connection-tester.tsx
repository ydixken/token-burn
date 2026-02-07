"use client";

import { useState, useEffect } from "react";
import { Check, X, Loader2, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

type TestStatus = "idle" | "testing" | "success" | "failure";

interface ConnectionTesterProps {
  targetId: string | null;
  targetName?: string;
  targetEndpoint?: string;
  autoRun?: boolean;
  onSuccess?: () => void;
}

export function ConnectionTester({
  targetId,
  targetName,
  targetEndpoint,
  autoRun = false,
  onSuccess,
}: ConnectionTesterProps) {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (!targetId) return;
    setStatus("testing");
    setError(null);
    setLatency(null);

    try {
      const res = await fetch(`/api/targets/${targetId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: 10000 }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setLatency(data.data?.latency?.total || data.data?.latencyMs || null);
        onSuccess?.();
      } else {
        setStatus("failure");
        setError(data.error || data.message || "Connection test failed");
      }
    } catch (err) {
      setStatus("failure");
      setError(err instanceof Error ? err.message : "Network error");
    }
  };

  useEffect(() => {
    if (autoRun && targetId) {
      runTest();
    }
  }, [autoRun, targetId]);

  if (!targetId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
          <Wifi className="h-8 w-8 text-gray-600" />
        </div>
        <p className="text-sm text-gray-400">You need to create a target first</p>
        <p className="text-xs text-gray-600 mt-1">Go back to Step 3 to set up a target endpoint</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8">
      {/* Status circle */}
      <div
        className={`h-24 w-24 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${
          status === "idle"
            ? "bg-gray-800 border-2 border-gray-700"
            : status === "testing"
            ? "bg-blue-500/10 border-2 border-blue-500/30 animate-pulse"
            : status === "success"
            ? "bg-emerald-500/10 border-2 border-emerald-500/30"
            : "bg-red-500/10 border-2 border-red-500/30"
        }`}
      >
        {status === "idle" && <Wifi className="h-10 w-10 text-gray-500" />}
        {status === "testing" && <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />}
        {status === "success" && <Check className="h-10 w-10 text-emerald-400" />}
        {status === "failure" && <X className="h-10 w-10 text-red-400" />}
      </div>

      {/* Status text */}
      <div className="text-center mb-6">
        {status === "idle" && (
          <p className="text-sm text-gray-400">Ready to test connection</p>
        )}
        {status === "testing" && (
          <p className="text-sm text-blue-400">Testing connection...</p>
        )}
        {status === "success" && (
          <>
            <p className="text-sm font-medium text-emerald-400">Connection successful</p>
            {latency !== null && (
              <p className="text-xs text-gray-500 mt-1">Response time: {Math.round(latency)}ms</p>
            )}
          </>
        )}
        {status === "failure" && (
          <>
            <p className="text-sm font-medium text-red-400">Connection failed</p>
            {error && <p className="text-xs text-gray-500 mt-1 max-w-sm">{error}</p>}
          </>
        )}
      </div>

      {/* Target info */}
      {(targetName || targetEndpoint) && (
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-6 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-800">
          {targetName && <span className="font-medium text-gray-400">{targetName}</span>}
          {targetEndpoint && <span className="truncate max-w-xs">{targetEndpoint}</span>}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {status === "idle" && (
          <Button onClick={runTest}>
            <Wifi className="h-4 w-4 mr-1" />
            Test Connection
          </Button>
        )}
        {status === "failure" && (
          <Button onClick={runTest}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Re-test
          </Button>
        )}
        {status === "success" && (
          <Button variant="ghost" size="sm" onClick={runTest}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Test Again
          </Button>
        )}
      </div>

      {/* Troubleshooting tips */}
      {status === "failure" && (
        <div className="mt-6 w-full max-w-md space-y-2">
          <p className="text-xs font-medium text-gray-400">Troubleshooting:</p>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-gray-600 mt-0.5">•</span>
              Is the mock server running? Start it with <code className="px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[10px]">pnpm run mock-server</code>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-600 mt-0.5">•</span>
              Check that the endpoint URL is correct and accessible
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-600 mt-0.5">•</span>
              Ensure Docker containers are running: <code className="px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[10px]">task docker:up</code>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
