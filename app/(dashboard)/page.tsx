"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  Target,
  Activity,
  Play,
  Eye,
  Clock,
  MessageSquare,
  RefreshCw,
  Zap,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalTargets: number;
  totalScenarios: number;
  activeSessions: number;
  totalTestsRun: number;
  errorRate: number;
}

interface RecentSession {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  target: { name: string } | null;
  targetName?: string;
  scenario: { name: string } | null;
  scenarioName?: string;
}

interface LiveSession {
  id: string;
  targetName: string;
  scenarioName: string | null;
  startedAt: string | null;
  messageCount: number;
  lastMessages?: string[];
}

interface TargetOption {
  id: string;
  name: string;
}

interface ScenarioOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, "success" | "error" | "warning" | "info" | "neutral"> = {
  COMPLETED: "success",
  FAILED: "error",
  RUNNING: "info",
  QUEUED: "warning",
  PENDING: "neutral",
  CANCELLED: "neutral",
};

const STATUS_ICON: Record<string, string> = {
  COMPLETED: "\u2713",
  FAILED: "\u2717",
  RUNNING: "\u25CF",
  QUEUED: "\u25CB",
  PENDING: "\u2014",
  CANCELLED: "\u2014",
};

// ---------------------------------------------------------------------------
// Live elapsed timer
// ---------------------------------------------------------------------------

function LiveElapsed({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = Date.now() - new Date(startedAt).getTime();
      const s = Math.floor(diff / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m ${s % 60}s`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return <span className="font-mono text-blue-400 text-xs">{elapsed}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-skeleton rounded bg-gray-800 ${className}`} />;
}

// ---------------------------------------------------------------------------
// Queue indicator for Live Sessions header
// ---------------------------------------------------------------------------

function QueueIndicator() {
  const [queued, setQueued] = useState(0);
  const [refreshActive, setRefreshActive] = useState(0);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch("/api/queue/status");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setQueued(data.data.sessionQueue.waiting);
            setRefreshActive(data.data.tokenRefreshQueue?.active ?? 0);
          }
        }
      } catch { /* silent */ }
    };

    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {queued > 0 && (
        <Badge variant="warning" size="sm">
          {queued} queued
        </Badge>
      )}
      {refreshActive > 0 && (
        <Badge variant="info" size="sm">
          {refreshActive} refreshing
        </Badge>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();

  // Data state
  const [stats, setStats] = useState<DashboardStats>({
    totalTargets: 0,
    totalScenarios: 0,
    activeSessions: 0,
    totalTestsRun: 0,
    errorRate: 0,
  });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Quick Execute state
  const [selectedTarget, setSelectedTarget] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const d = json.data;

          // Compute error rate from recent sessions
          const recent: RecentSession[] = d.recentSessions ?? [];
          const total = recent.length;
          const failed = recent.filter(
            (s: RecentSession) => s.status === "FAILED"
          ).length;

          setStats({
            totalTargets: d.counts?.targets ?? d.totalTargets ?? 0,
            totalScenarios: d.counts?.scenarios ?? d.totalScenarios ?? 0,
            activeSessions:
              d.counts?.activeSessions ?? d.activeSessions ?? 0,
            totalTestsRun:
              d.counts?.totalSessions ?? d.totalTestsRun ?? 0,
            errorRate: total > 0 ? Math.round((failed / total) * 100) : 0,
          });

          if (d.recentSessions) setRecentSessions(d.recentSessions);
          if (d.liveSessions) setLiveSessions(d.liveSessions);
          setLastUpdated(new Date());
          setLoading(false);
          return;
        }
      }
    } catch {
      // fallback below
    }
    await fetchFallback();
  }, []);

  const fetchFallback = async () => {
    try {
      const [tRes, sRes, sessRes] = await Promise.allSettled([
        fetch("/api/targets"),
        fetch("/api/scenarios"),
        fetch("/api/sessions?limit=10"),
      ]);

      let totalTargets = 0;
      let totalScenarios = 0;

      if (tRes.status === "fulfilled" && tRes.value.ok) {
        const d = await tRes.value.json();
        if (d.success) {
          totalTargets = d.count ?? d.data?.length ?? 0;
          setTargets(
            (d.data || []).map((t: TargetOption) => ({
              id: t.id,
              name: t.name,
            }))
          );
        }
      }

      if (sRes.status === "fulfilled" && sRes.value.ok) {
        const d = await sRes.value.json();
        if (d.success) {
          totalScenarios = d.count ?? d.data?.length ?? 0;
          setScenarios(
            (d.data || []).map((s: ScenarioOption) => ({
              id: s.id,
              name: s.name,
            }))
          );
        }
      }

      const sessions: RecentSession[] = [];
      if (sessRes.status === "fulfilled" && sessRes.value.ok) {
        const d = await sessRes.value.json();
        if (d.success) sessions.push(...(d.data || []));
      }
      setRecentSessions(sessions);

      const active = sessions.filter(
        (s) => s.status === "RUNNING" || s.status === "QUEUED"
      ).length;
      const failed = sessions.filter((s) => s.status === "FAILED").length;

      setStats({
        totalTargets,
        totalScenarios,
        activeSessions: active,
        totalTestsRun: 0,
        errorRate:
          sessions.length > 0
            ? Math.round((failed / sessions.length) * 100)
            : 0,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data.liveSessions) {
          setLiveSessions(json.data.liveSessions);
          if (json.data.counts?.activeSessions !== undefined) {
            setStats((prev) => ({
              ...prev,
              activeSessions: json.data.counts.activeSessions,
            }));
          }
        }
      }
    } catch {
      /* silent */
    }
  }, []);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetchDashboardData();
    const full = setInterval(fetchDashboardData, 30000);
    liveIntervalRef.current = setInterval(fetchLiveSessions, 3000);
    return () => {
      clearInterval(full);
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [fetchDashboardData, fetchLiveSessions]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, sRes] = await Promise.allSettled([
          fetch("/api/targets"),
          fetch("/api/scenarios"),
        ]);
        if (tRes.status === "fulfilled" && tRes.value.ok) {
          const d = await tRes.value.json();
          if (d.success)
            setTargets(
              (d.data || []).map((t: TargetOption) => ({
                id: t.id,
                name: t.name,
              }))
            );
        }
        if (sRes.status === "fulfilled" && sRes.value.ok) {
          const d = await sRes.value.json();
          if (d.success)
            setScenarios(
              (d.data || []).map((s: ScenarioOption) => ({
                id: s.id,
                name: s.name,
              }))
            );
        }
      } catch {
        /* silent */
      }
    };
    load();
  }, []);

  // Auto-redirect to guide on fresh install
  useEffect(() => {
    if (loading) return;
    if (stats.totalTargets === 0 && stats.totalScenarios === 0) {
      try {
        if (sessionStorage.getItem("krawall-fresh-redirect-done")) return;
        const wizardState = localStorage.getItem("krawall-guide-v2");
        if (!wizardState || JSON.parse(wizardState).completedSteps?.length === 0) {
          sessionStorage.setItem("krawall-fresh-redirect-done", "true");
          router.push("/guide");
        }
      } catch { /* silent */ }
    }
  }, [loading, stats.totalTargets, stats.totalScenarios, router]);

  // -------------------------------------------------------------------------
  // Quick Execute
  // -------------------------------------------------------------------------

  const handleQuickExecute = async () => {
    if (!selectedTarget || !selectedScenario) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: selectedTarget,
          scenarioId: selectedScenario,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExecuteResult({
          success: true,
          message: `Session queued: ${data.data?.sessionId?.slice(0, 8) ?? "OK"}`,
        });
        setSelectedTarget("");
        setSelectedScenario("");
        setTimeout(fetchDashboardData, 1000);
      } else {
        setExecuteResult({
          success: false,
          message: data.error || "Failed to start session",
        });
      }
    } catch {
      setExecuteResult({ success: false, message: "Failed to start session" });
    } finally {
      setExecuting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const sessionTarget = (s: RecentSession) =>
    s.target?.name || s.targetName || "Unknown";
  const sessionScenario = (s: RecentSession) =>
    s.scenario?.name || s.scenarioName || null;

  const runningSessions = liveSessions.length > 0 ? liveSessions : [];
  const activeSessionsFromRecent = recentSessions.filter(
    (s) => s.status === "RUNNING"
  );

  // Check if user completed the guided setup
  const [guideCompleted, setGuideCompleted] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("krawall-guide-v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        setGuideCompleted(parsed.completedAt != null);
      }
    } catch { /* silent */ }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <PageHeader
        title="Command Center"
        description="Real-time overview of all chatbot testing operations"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-gray-500 tabular-nums">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchDashboardData()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      {/* Guide CTA - prominent hero when fresh install */}
      {!loading &&
        stats.totalTargets === 0 &&
        stats.totalScenarios === 0 && (
          <Link href="/guide" className="block">
            <div className="rounded-xl border border-blue-800/50 bg-gradient-to-br from-blue-950/50 via-indigo-950/40 to-purple-950/30 p-8 mb-6 hover:border-blue-700/60 transition-colors group">
              <div className="flex items-center gap-6">
                <div className="rounded-2xl bg-blue-500/15 p-5 group-hover:bg-blue-500/20 transition-colors">
                  <BookOpen className="h-10 w-10 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    New here? Start the Guided Setup
                  </h2>
                  <p className="text-base text-gray-400 mb-3">
                    Set up your first chatbot target, create a test scenario, and run your first
                    stress test - all in about 5 minutes.
                  </p>
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 group-hover:text-blue-300 transition-colors">
                    <BookOpen className="h-4 w-4" />
                    Launch Guide
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ============================================================= */}
        {/* LEFT COLUMN - Live Sessions (tall tile) */}
        {/* ============================================================= */}
        <Card
          variant="bordered"
          className="lg:row-span-2 border-blue-900/50 bg-gray-900"
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-base">Live Sessions</CardTitle>
              <span className="relative ml-1">
                <Badge
                  variant={runningSessions.length > 0 ? "info" : "neutral"}
                  size="sm"
                >
                  {runningSessions.length}
                </Badge>
                {runningSessions.length > 0 && (
                  <span className="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping" />
                )}
              </span>
              <QueueIndicator />
            </div>
            <Link
              href="/sessions"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              View all
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : runningSessions.length === 0 ? (
              <EmptyState
                icon={Radio}
                title="No Live Sessions"
                description="Start a test to see real-time session monitoring here."
                className="py-10"
              />
            ) : (
              <div className="space-y-3">
                {runningSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-lg border border-blue-800/40 bg-gray-800/60 p-3 hover:border-blue-700/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <StatusIndicator status="running" size="sm" />
                        <span className="text-sm font-medium text-gray-100 truncate">
                          {session.targetName}
                        </span>
                      </div>
                      <Link href={`/sessions/${session.id}`}>
                        <Button variant="primary" size="sm">
                          <Eye className="h-3 w-3" />
                          Watch Live
                        </Button>
                      </Link>
                    </div>

                    {session.scenarioName && (
                      <p className="text-xs text-gray-500 mb-2 truncate pl-4">
                        {session.scenarioName}
                      </p>
                    )}

                    <div className="flex items-center gap-4 pl-4 text-xs text-gray-500">
                      {session.startedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <LiveElapsed startedAt={session.startedAt} />
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {session.messageCount} msg
                        {session.messageCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================= */}
        {/* CENTER + RIGHT - Quick Stats (4 compact metric cards) */}
        {/* ============================================================= */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <Link href="/targets" className="group">
                <MetricCard
                  label="Total Targets"
                  value={stats.totalTargets}
                  className="group-hover:border-gray-700 transition-colors h-full"
                />
              </Link>
              <Link href="/scenarios" className="group">
                <MetricCard
                  label="Scenarios"
                  value={stats.totalScenarios}
                  className="group-hover:border-gray-700 transition-colors h-full"
                />
              </Link>
              <Link href="/sessions" className="group">
                <MetricCard
                  label="Total Sessions"
                  value={stats.totalTestsRun}
                  className="group-hover:border-gray-700 transition-colors h-full"
                />
              </Link>
              <MetricCard
                label="Error Rate"
                value={`${stats.errorRate}%`}
                className={
                  stats.errorRate > 20
                    ? "border-red-800/50"
                    : ""
                }
                trend={
                  stats.errorRate > 0
                    ? { direction: "down", value: `${stats.errorRate}%` }
                    : undefined
                }
              />
            </>
          )}
        </div>

        {/* ============================================================= */}
        {/* Quick Execute + Recent Activity side by side */}
        {/* ============================================================= */}

        {/* Quick Execute */}
        <Card variant="default" className="bg-gray-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-base">Quick Execute</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Target
                </label>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select target...</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Scenario
                </label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select scenario...</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                className="w-full"
                size="md"
                onClick={handleQuickExecute}
                disabled={!selectedTarget || !selectedScenario}
                loading={executing}
              >
                <Play className="h-3.5 w-3.5" />
                {executing ? "Starting..." : "Run Test"}
              </Button>

              {executeResult && (
                <div
                  className={`text-xs p-2 rounded-md border ${
                    executeResult.success
                      ? "bg-emerald-900/10 text-emerald-400 border-emerald-800/30"
                      : "bg-red-900/10 text-red-400 border-red-800/30"
                  }`}
                >
                  {executeResult.message}
                </div>
              )}

              {targets.length === 0 &&
                scenarios.length === 0 &&
                !loading && (
                  <p className="text-[11px] text-gray-600">
                    Create a{" "}
                    <Link
                      href="/targets/new"
                      className="text-blue-400 hover:underline"
                    >
                      target
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/scenarios/new"
                      className="text-blue-400 hover:underline"
                    >
                      scenario
                    </Link>{" "}
                    to get started.
                  </p>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card variant="default" className="bg-gray-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-400" />
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </div>
            <Link
              href="/sessions"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              View all
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-600">
                No sessions yet. Run a test to see activity.
              </div>
            ) : (
              <div className="space-y-1">
                {recentSessions.slice(0, 10).map((session) => (
                  <Link
                    key={session.id}
                    href={`/sessions/${session.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-gray-800/60 transition-colors group"
                  >
                    <span className="text-xs w-4 text-center shrink-0">
                      {STATUS_ICON[session.status] || "\u2014"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-200 truncate">
                          {sessionTarget(session)}
                        </span>
                        {sessionScenario(session) && (
                          <span className="text-[11px] text-gray-600 truncate hidden sm:inline">
                            / {sessionScenario(session)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-600 tabular-nums shrink-0">
                      {session.startedAt
                        ? relativeTime(session.startedAt)
                        : "pending"}
                    </span>
                    <Badge
                      variant={
                        STATUS_VARIANT[session.status] || "neutral"
                      }
                      size="sm"
                    >
                      {session.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================= */}
        {/* Active Sessions Section (full width bottom) */}
        {/* ============================================================= */}
        {activeSessionsFromRecent.length > 0 && (
          <Card
            variant="bordered"
            className="lg:col-span-3 border-blue-900/40 bg-gray-900"
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIndicator status="running" size="md" />
                <CardTitle className="text-base">Active Sessions</CardTitle>
                <Badge variant="info" size="sm">
                  {activeSessionsFromRecent.length}
                </Badge>
              </div>
              <Link
                href="/sessions?status=RUNNING"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Open Full View
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeSessionsFromRecent.map((session) => {
                  const live = liveSessions.find(
                    (ls) => ls.id === session.id
                  );
                  return (
                    <Link
                      key={session.id}
                      href={`/sessions/${session.id}`}
                      className="block rounded-lg border-l-2 border-l-blue-500 border border-gray-800 bg-gray-800/40 p-3 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIndicator status="running" size="sm" />
                          <span className="text-sm font-medium text-gray-100 truncate">
                            {sessionTarget(session)}
                          </span>
                        </div>
                        {live && (
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {live.messageCount} msgs
                          </span>
                        )}
                      </div>

                      {sessionScenario(session) && (
                        <p className="text-xs text-gray-500 mb-2 pl-4 truncate">
                          {sessionScenario(session)}
                        </p>
                      )}

                      {session.startedAt && (
                        <div className="flex items-center gap-1 pl-4 text-xs text-gray-600">
                          <Clock className="h-3 w-3" />
                          <LiveElapsed startedAt={session.startedAt} />
                        </div>
                      )}

                      {/* Mini log preview */}
                      {live?.lastMessages && live.lastMessages.length > 0 && (
                        <div className="mt-2 pl-4 border-l border-gray-700 ml-1 space-y-0.5">
                          {live.lastMessages.slice(-3).map((msg, i) => (
                            <p
                              key={i}
                              className="text-[11px] text-gray-600 truncate font-mono"
                            >
                              {msg}
                            </p>
                          ))}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {/* Continue Guide link - when user has data but guide is incomplete */}
      {!loading &&
        (stats.totalTargets > 0 || stats.totalScenarios > 0) &&
        !guideCompleted && (
          <div className="flex items-center justify-end mt-2">
            <Link
              href="/guide"
              className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              Continue Guided Setup
            </Link>
          </div>
        )}
    </div>
  );
}
