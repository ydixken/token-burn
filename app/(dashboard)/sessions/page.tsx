"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Radio, Eye, Activity, RefreshCw, Trash2, Square } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Tooltip } from "@/components/ui/tooltip";

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

const STATUS_BADGE: Record<string, "success" | "error" | "warning" | "info" | "neutral"> = {
  COMPLETED: "success",
  FAILED: "error",
  RUNNING: "info",
  QUEUED: "warning",
  PENDING: "warning",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "RUNNING", label: "Running" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
  { key: "QUEUED", label: "Queued" },
];

function useElapsedTime(startedAt: string, isActive: boolean) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!isActive) return;
    const update = () => {
      const diff = Date.now() - new Date(startedAt).getTime();
      const s = Math.floor(diff / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m ${s % 60}s`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  return elapsed;
}

function formatDuration(startedAt: string, completedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const s = Math.floor((end - start) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function RunningSessionCard({ session }: { session: Session }) {
  const elapsed = useElapsedTime(session.startedAt, true);

  return (
    <div className="rounded-lg border border-gray-800 border-l-4 border-l-blue-500 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIndicator status="running" size="lg" />
          <div>
            <div className="font-medium text-gray-100">
              {session.scenario?.name || "Custom Execution"}
            </div>
            <div className="text-xs text-gray-500">
              {session.target.name} &middot; {elapsed}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session.summaryMetrics && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400 mr-4">
              <span>{session.summaryMetrics.messageCount || 0} msgs</span>
              <span>{(session.summaryMetrics.totalTokens || 0).toLocaleString()} tokens</span>
            </div>
          )}
          <Link href={`/sessions/${session.id}`}>
            <Button size="sm">
              <Radio className="h-3.5 w-3.5" />
              Watch Live
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const response = await fetch(`/api/sessions?${params.toString()}`);
      const data = await response.json();
      if (data.success) setSessions(data.data);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Sort: RUNNING first, then QUEUED, then by startedAt desc
  const sortedSessions = [...sessions].sort((a, b) => {
    const priority: Record<string, number> = { RUNNING: 0, QUEUED: 1 };
    const ap = priority[a.status] ?? 2;
    const bp = priority[b.status] ?? 2;
    if (ap !== bp) return ap - bp;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  const runningSessions = sortedSessions.filter((s) => s.status === "RUNNING");
  const otherSessions = sortedSessions.filter((s) => s.status !== "RUNNING");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        description="View and manage test execution sessions"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sessions" },
        ]}
      />

      {/* Status Filter Pills */}
      <div className="flex gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Skeleton for running sessions */}
          <div className="space-y-3">
            <div className="animate-skeleton h-4 w-40 rounded bg-gray-800" />
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-skeleton h-2.5 w-2.5 rounded-full bg-gray-800" />
                  <div className="space-y-1.5">
                    <div className="animate-skeleton h-4 w-36 rounded bg-gray-800" />
                    <div className="animate-skeleton h-3 w-48 rounded bg-gray-800" />
                  </div>
                </div>
                <div className="animate-skeleton h-8 w-24 rounded-md bg-gray-800" />
              </div>
            </div>
          </div>
          {/* Skeleton for sessions table */}
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Scenario</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Messages</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Tokens</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><div className="animate-skeleton h-5 w-20 rounded-full bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-28 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-32 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-16 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-14 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-8 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-4 w-12 rounded bg-gray-800" /></td>
                    <td className="px-4 py-3"><div className="animate-skeleton h-7 w-7 rounded bg-gray-800" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No sessions found"
          description="Execute a scenario to create a new session."
        />
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {/* Running Sessions */}
          {runningSessions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                Live Sessions ({runningSessions.length})
              </h2>
              {runningSessions.map((session) => (
                <RunningSessionCard key={session.id} session={session} />
              ))}
            </div>
          )}

          {/* Sessions Table */}
          {otherSessions.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Scenario</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Messages</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Tokens</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {otherSessions.map((session) => (
                    <tr
                      key={session.id}
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="cursor-pointer transition-colors hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[session.status] || "neutral"} size="sm">
                          {session.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{session.target.name}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {session.scenario?.name || "Custom"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{timeAgo(session.startedAt)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDuration(session.startedAt, session.completedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {session.summaryMetrics?.messageCount || 0}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {(session.summaryMetrics?.totalTokens || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {(session.status === "RUNNING" || session.status === "QUEUED") && (
                            <Tooltip content="Cancel">
                              <Button
                                variant="icon"
                                size="sm"
                                onClick={async () => {
                                  await fetch(`/api/sessions/${session.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "cancel" }),
                                  });
                                  fetchSessions();
                                }}
                              >
                                <Square className="h-3.5 w-3.5" />
                              </Button>
                            </Tooltip>
                          )}
                          {["COMPLETED", "FAILED", "CANCELLED"].includes(session.status) && (
                            <>
                              <Tooltip content="Restart">
                                <Button
                                  variant="icon"
                                  size="sm"
                                  onClick={async () => {
                                    const res = await fetch(`/api/sessions/${session.id}`, {
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
                                </Button>
                              </Tooltip>
                              <Tooltip content="Delete">
                                <Button
                                  variant="icon"
                                  size="sm"
                                  onClick={async () => {
                                    if (!confirm("Are you sure you want to delete this session?")) return;
                                    await fetch(`/api/sessions/${session.id}`, {
                                      method: "DELETE",
                                    });
                                    fetchSessions();
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip content="View">
                            <Link href={`/sessions/${session.id}`}>
                              <Button variant="icon" size="sm">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
