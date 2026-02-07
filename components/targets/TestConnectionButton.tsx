"use client";

import { useState } from "react";

interface TestResult {
  success: boolean;
  status?: number;
  responseTimeMs?: number;
  message?: string;
  rawResponse?: string;
  error?: string;
}

interface TestConnectionButtonProps {
  targetId: string;
  targetName: string;
}

export default function TestConnectionButton({ targetId, targetName }: TestConnectionButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    setShowDetails(false);

    try {
      const response = await fetch(`/api/targets/${targetId}/test`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          status: data.data?.status,
          responseTimeMs: data.data?.responseTimeMs,
          message: data.data?.message || "Connection successful",
          rawResponse: data.data?.rawResponse
            ? JSON.stringify(data.data.rawResponse, null, 2)
            : undefined,
        });
      } else {
        setResult({
          success: false,
          status: data.data?.status,
          responseTimeMs: data.data?.responseTimeMs,
          error: data.error || data.message || "Connection test failed",
          rawResponse: data.data?.rawResponse
            ? JSON.stringify(data.data.rawResponse, null, 2)
            : undefined,
        });
      }
    } catch (err) {
      setResult({
        success: false,
        error: "Failed to reach test endpoint. The API may not be available yet.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleTest}
        disabled={testing}
        className={`w-full px-3 py-2 text-sm rounded transition flex items-center justify-center gap-2 ${
          testing
            ? "bg-gray-600 text-gray-400 cursor-not-allowed"
            : "bg-emerald-700 hover:bg-emerald-600 text-white"
        }`}
      >
        {testing ? (
          <>
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Testing...
          </>
        ) : (
          "Test Connection"
        )}
      </button>

      {result && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            result.success
              ? "bg-green-900/20 border-green-800"
              : "bg-red-900/20 border-red-800"
          }`}
        >
          {/* Status header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  result.success ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className={result.success ? "text-green-300 font-medium" : "text-red-300 font-medium"}>
                {result.success ? "Connected" : "Failed"}
              </span>
            </div>
            <button
              onClick={() => setResult(null)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Dismiss
            </button>
          </div>

          {/* Details */}
          <div className="space-y-1 text-xs">
            {result.message && (
              <div className="text-green-400">{result.message}</div>
            )}
            {result.error && (
              <div className="text-red-400">{result.error}</div>
            )}
            {result.status !== undefined && (
              <div className="text-gray-400">
                HTTP Status: <span className="text-gray-300">{result.status}</span>
              </div>
            )}
            {result.responseTimeMs !== undefined && (
              <div className="text-gray-400">
                Response Time: <span className="text-gray-300">{Math.round(result.responseTimeMs)}ms</span>
              </div>
            )}
          </div>

          {/* Raw response toggle */}
          {result.rawResponse && (
            <div className="mt-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-gray-400 hover:text-gray-300 underline"
              >
                {showDetails ? "Hide" : "Show"} raw response
              </button>
              {showDetails && (
                <pre className="mt-2 p-2 bg-gray-900 rounded text-[11px] text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                  {result.rawResponse}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
