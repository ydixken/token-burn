"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LogViewer from "@/components/sessions/LogViewer";

interface Session {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summaryMetrics: any;
  target: {
    name: string;
    connectorType: string;
  };
  scenario: {
    name: string;
  } | null;
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        setSession(data.data);
      } else {
        setError(data.error || "Failed to fetch session");
      }
    } catch (err) {
      console.error("Failed to fetch session:", err);
      setError("Failed to fetch session");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
          <p className="text-red-300">{error || "Session not found"}</p>
        </div>
        <Link
          href="/sessions"
          className="inline-block px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/sessions"
              className="text-gray-400 hover:text-white"
            >
              ← Sessions
            </Link>
            <h1 className="text-3xl font-bold text-white">Session Details</h1>
          </div>
          <p className="text-gray-400 mt-1">
            {session.target.name}
            {session.scenario && ` • ${session.scenario.name}`}
          </p>
        </div>

        {session.summaryMetrics && (
          <Link
            href={`/api/metrics/export?sessionId=${sessionId}&format=csv`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Export Metrics
          </Link>
        )}
      </div>

      {/* Session Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Started</div>
          <div className="text-lg font-semibold text-white">
            {new Date(session.startedAt).toLocaleString()}
          </div>
        </div>

        {session.completedAt && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-1">Completed</div>
            <div className="text-lg font-semibold text-white">
              {new Date(session.completedAt).toLocaleString()}
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Target</div>
          <div className="text-lg font-semibold text-white">{session.target.name}</div>
          <div className="text-xs text-gray-500 mt-1">{session.target.connectorType}</div>
        </div>

        {session.scenario && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-1">Scenario</div>
            <div className="text-lg font-semibold text-white">{session.scenario.name}</div>
          </div>
        )}
      </div>

      {/* Summary Metrics */}
      {session.summaryMetrics && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Summary Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div>
              <div className="text-sm text-gray-400">Messages</div>
              <div className="text-2xl font-bold text-white">
                {session.summaryMetrics.messageCount || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Total Tokens</div>
              <div className="text-2xl font-bold text-white">
                {(session.summaryMetrics.totalTokens || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Avg Response</div>
              <div className="text-2xl font-bold text-white">
                {session.summaryMetrics.avgResponseTimeMs || 0}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">P95 Response</div>
              <div className="text-2xl font-bold text-white">
                {session.summaryMetrics.p95ResponseTimeMs || 0}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Error Rate</div>
              <div className="text-2xl font-bold text-white">
                {(session.summaryMetrics.errorRate || 0).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Log Viewer */}
      <LogViewer sessionId={sessionId} />
    </div>
  );
}
