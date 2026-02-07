"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Session {
  id: string;
  targetId: string;
  scenarioId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summaryMetrics: {
    messageCount?: number;
    totalTokens?: number;
    avgResponseTimeMs?: number;
    errorCount?: number;
  } | null;
  target: {
    name: string;
    connectorType: string;
  };
  scenario: {
    name: string;
  } | null;
}

function useElapsedTime(startedAt: string, isActive: boolean) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!isActive) {
      return;
    }

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
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  return elapsed;
}

function SessionCard({ session }: { session: Session }) {
  const isRunning = session.status === "RUNNING";
  const isQueued = session.status === "QUEUED";
  const elapsed = useElapsedTime(session.startedAt, isRunning);

  const borderClass = isRunning
    ? "border-l-4 border-l-blue-500"
    : isQueued
    ? "border-l-4 border-l-yellow-500"
    : "";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "RUNNING":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "QUEUED":
      case "PENDING":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "FAILED":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const formatDuration = (startedAt: string, completedAt: string | null) => {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const durationMs = end - start;

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div
      className={`block bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors ${borderClass}`}
    >
      <Link
        href={`/sessions/${session.id}`}
        className="block p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-white">
                {session.scenario?.name || "Custom Execution"}
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(
                  session.status
                )}`}
              >
                {isRunning && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                )}
                {session.status}
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Target: {session.target.name} ({session.target.connectorType})
            </p>
          </div>
          <div className="text-right text-sm text-gray-400">
            <div>Started: {new Date(session.startedAt).toLocaleString()}</div>
            <div>
              Duration:{" "}
              {isRunning ? (
                <span className="text-blue-400 font-medium">{elapsed}</span>
              ) : (
                formatDuration(session.startedAt, session.completedAt)
              )}
            </div>
          </div>
        </div>

        {/* Metrics Summary */}
        {session.summaryMetrics && (
          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-700">
            <div>
              <div className="text-xs text-gray-500 mb-1">Messages</div>
              <div className="text-lg font-semibold text-white">
                {session.summaryMetrics.messageCount || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Total Tokens</div>
              <div className="text-lg font-semibold text-white">
                {session.summaryMetrics.totalTokens?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Avg Response</div>
              <div className="text-lg font-semibold text-white">
                {session.summaryMetrics.avgResponseTimeMs?.toFixed(0) || 0}ms
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Errors</div>
              <div className="text-lg font-semibold text-white">
                {session.summaryMetrics.errorCount || 0}
              </div>
            </div>
          </div>
        )}
      </Link>

      {/* Watch Live button for RUNNING sessions */}
      {isRunning && (
        <div className="px-6 pb-4">
          <Link
            href={`/sessions/${session.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            Watch Live
          </Link>
        </div>
      )}
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }

      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setSessions(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Sort: RUNNING first, then QUEUED, then the rest by startedAt desc
  const sortedSessions = [...sessions].sort((a, b) => {
    const priority: Record<string, number> = { RUNNING: 0, QUEUED: 1 };
    const aPriority = priority[a.status] ?? 2;
    const bPriority = priority[b.status] ?? 2;

    if (aPriority !== bPriority) return aPriority - bPriority;

    // Within same priority, sort by startedAt desc
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Sessions</h1>
          <p className="text-gray-400 mt-1">
            View and manage test execution sessions
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "PENDING", "QUEUED", "RUNNING", "COMPLETED", "FAILED"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {status === "all" ? "All" : status}
          </button>
        ))}
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading sessions...</div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">No sessions found</div>
          <p className="text-sm text-gray-500">
            Execute a scenario to create a new session
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
