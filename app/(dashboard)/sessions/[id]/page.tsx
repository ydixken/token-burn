"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Trash2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import LogViewer from "@/components/sessions/LogViewer";
import SessionReplay from "@/components/sessions/SessionReplay";

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

function QueueStatusBanner() {
  const [queueInfo, setQueueInfo] = useState<{ waiting: number; active: number; workerRunning: boolean } | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch("/api/queue/status");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setQueueInfo({
              waiting: data.data.sessionQueue.waiting,
              active: data.data.sessionQueue.active,
              workerRunning: data.data.sessionQueue.workerRunning,
            });
          }
        }
      } catch { /* silent */ }
    };

    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-900/30 p-2">
          <AlertTriangle className="h-4 w-4 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-300">Session Queued</p>
          {queueInfo ? (
            <>
              <p className="text-xs text-gray-400">
                {queueInfo.waiting} session{queueInfo.waiting !== 1 ? "s" : ""} in queue, {queueInfo.active} processing
              </p>
              {!queueInfo.workerRunning && (
                <p className="text-xs text-amber-500 mt-1">Workers may not be running. Check server logs.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">Waiting for worker to pick up this session...</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"live" | "replay">("live");

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
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/sessions"
              className="text-gray-400 hover:text-white text-sm"
            >
              ← Sessions
            </Link>
            <h1 className="text-xl font-semibold text-white">Session Details</h1>
          </div>
          <p className="text-gray-400 mt-1">
            {session.target.name}
            {session.scenario && ` • ${session.scenario.name}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(session.status === "RUNNING" || session.status === "QUEUED") && (
            <Tooltip content="Cancel Session">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await fetch(`/api/sessions/${sessionId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "cancel" }),
                  });
                  fetchSession();
                }}
              >
                <Square className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </Tooltip>
          )}
          {["COMPLETED", "FAILED", "CANCELLED"].includes(session.status) && (
            <>
              <Tooltip content="Restart Session">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const res = await fetch(`/api/sessions/${sessionId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "restart" }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      router.push(`/sessions/${data.data.sessionId}`);
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Restart
                </Button>
              </Tooltip>
              <Tooltip content="Delete Session">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Are you sure you want to delete this session?")) return;
                    const res = await fetch(`/api/sessions/${sessionId}`, {
                      method: "DELETE",
                    });
                    const data = await res.json();
                    if (data.success) {
                      router.push("/sessions");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </Tooltip>
            </>
          )}
          {session.summaryMetrics && (
            <Link
              href={`/api/metrics/export?sessionId=${sessionId}&format=csv`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Export Metrics
            </Link>
          )}
        </div>
      </div>

      {/* Session Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-[10px] font-medium text-gray-400">Started</p>
          <p className="text-sm font-semibold text-gray-100 truncate mt-0.5">
            {new Date(session.startedAt).toLocaleString()}
          </p>
        </div>
        {session.completedAt && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Completed</p>
            <p className="text-sm font-semibold text-gray-100 truncate mt-0.5">
              {new Date(session.completedAt).toLocaleString()}
            </p>
          </div>
        )}
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-[10px] font-medium text-gray-400">Target</p>
          <p className="text-sm font-semibold text-gray-100 truncate mt-0.5">{session.target.name}</p>
          <p className="text-[10px] text-gray-500">{session.target.connectorType}</p>
        </div>
        {session.scenario && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Scenario</p>
            <p className="text-sm font-semibold text-gray-100 truncate mt-0.5">{session.scenario.name}</p>
          </div>
        )}
      </div>

      {/* Queue Status Banner */}
      {(session.status === "QUEUED" || session.status === "PENDING") && (
        <QueueStatusBanner />
      )}

      {/* Summary Metrics */}
      {session.summaryMetrics && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Messages</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">
              {session.summaryMetrics.messageCount || 0}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Total Tokens</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">
              {(session.summaryMetrics.totalTokens || 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Avg Response</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">
              {Math.round(session.summaryMetrics.avgResponseTimeMs || 0)}ms
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">P95 Response</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">
              {Math.round(session.summaryMetrics.p95ResponseTimeMs || 0)}ms
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <p className="text-[10px] font-medium text-gray-400">Error Rate</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">
              {(session.summaryMetrics.errorRate || 0).toFixed(2)}%
            </p>
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode("live")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === "live"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Live Log
        </button>
        <button
          onClick={() => setViewMode("replay")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === "replay"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Replay
        </button>
      </div>

      {/* Content based on view mode — takes remaining space */}
      <div className="flex-1 min-h-0">
        {viewMode === "live" ? (
          <LogViewer sessionId={sessionId} startedAt={session.startedAt} />
        ) : (
          <SessionReplay sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
