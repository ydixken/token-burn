"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface DashboardStats {
  totalTargets: number;
  totalScenarios: number;
  activeSessions: number;
  totalTestsRun: number;
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
}

interface ScheduledJob {
  id: string;
  cronExpression: string;
  isEnabled: boolean;
  nextRunAt: string | null;
  scenario: { name: string };
}

interface Target {
  id: string;
  name: string;
}

interface Scenario {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-900/50 text-green-300",
  FAILED: "bg-red-900/50 text-red-300",
  RUNNING: "bg-blue-900/50 text-blue-300",
  QUEUED: "bg-yellow-900/50 text-yellow-300",
  PENDING: "bg-gray-700 text-gray-300",
  CANCELLED: "bg-gray-700 text-gray-400",
};

function LiveSessionElapsed({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
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
  }, [startedAt]);

  return <span className="font-mono text-blue-400">{elapsed}</span>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalTargets: 0,
    totalScenarios: 0,
    activeSessions: 0,
    totalTestsRun: 0,
  });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [nextJob, setNextJob] = useState<ScheduledJob | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Quick Execute state
  const [selectedTarget, setSelectedTarget] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ success: boolean; message: string } | null>(null);

  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Try the dashboard stats endpoint first
      const statsResponse = await fetch("/api/dashboard/stats");
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          const d = statsData.data;
          setStats({
            totalTargets: d.counts?.targets ?? d.totalTargets ?? 0,
            totalScenarios: d.counts?.scenarios ?? d.totalScenarios ?? 0,
            activeSessions: d.counts?.activeSessions ?? d.activeSessions ?? 0,
            totalTestsRun: d.counts?.totalSessions ?? d.totalTestsRun ?? 0,
          });

          if (d.recentSessions) {
            setRecentSessions(d.recentSessions);
          }
          if (d.liveSessions) {
            setLiveSessions(d.liveSessions);
          }
          if (d.nextScheduledJob) {
            setNextJob(d.nextScheduledJob);
          }

          setLastUpdated(new Date());
          setLoading(false);
          return;
        }
      }
    } catch {
      // Stats endpoint not available, fall back to individual endpoints
    }

    // Fallback: fetch from individual endpoints
    await fetchFromIndividualEndpoints();
  }, []);

  // Separate fast refresh for live sessions only (every 3s)
  const fetchLiveSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/stats");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.liveSessions) {
          setLiveSessions(data.data.liveSessions);
          // Also update active session count
          if (data.data.liveSessionCount !== undefined) {
            setStats((prev) => ({
              ...prev,
              activeSessions: data.data.counts?.activeSessions ?? data.data.liveSessionCount ?? prev.activeSessions,
            }));
          }
        }
      }
    } catch {
      // silent - main refresh will catch up
    }
  }, []);

  const fetchFromIndividualEndpoints = async () => {
    try {
      const [targetsRes, scenariosRes, sessionsRes, jobsRes] = await Promise.allSettled([
        fetch("/api/targets"),
        fetch("/api/scenarios"),
        fetch("/api/sessions?limit=5"),
        fetch("/api/scheduled-jobs"),
      ]);

      let totalTargets = 0;
      let totalScenarios = 0;
      const targetsList: Target[] = [];
      const scenariosList: Scenario[] = [];

      if (targetsRes.status === "fulfilled" && targetsRes.value.ok) {
        const data = await targetsRes.value.json();
        if (data.success) {
          totalTargets = data.count ?? data.data?.length ?? 0;
          targetsList.push(
            ...(data.data || []).map((t: Target) => ({ id: t.id, name: t.name }))
          );
        }
      }

      if (scenariosRes.status === "fulfilled" && scenariosRes.value.ok) {
        const data = await scenariosRes.value.json();
        if (data.success) {
          totalScenarios = data.count ?? data.data?.length ?? 0;
          scenariosList.push(
            ...(data.data || []).map((s: Scenario) => ({ id: s.id, name: s.name }))
          );
        }
      }

      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        const data = await sessionsRes.value.json();
        if (data.success) {
          setRecentSessions(data.data || []);
        }
      }

      let activeSessions = 0;
      const activeSess = recentSessions.filter(
        (s) => s.status === "RUNNING" || s.status === "QUEUED"
      );
      activeSessions = activeSess.length;

      if (jobsRes.status === "fulfilled" && jobsRes.value.ok) {
        const data = await jobsRes.value.json();
        if (data.success && data.data?.length > 0) {
          const enabledJobs = data.data
            .filter((j: ScheduledJob) => j.isEnabled && j.nextRunAt)
            .sort(
              (a: ScheduledJob, b: ScheduledJob) =>
                new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime()
            );
          setNextJob(enabledJobs[0] || null);
        }
      }

      setStats({
        totalTargets,
        totalScenarios,
        activeSessions,
        totalTestsRun: 0,
      });
      setTargets(targetsList);
      setScenarios(scenariosList);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Full refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);

    // Live sessions fast refresh every 3 seconds
    liveIntervalRef.current = setInterval(fetchLiveSessions, 3000);

    return () => {
      clearInterval(interval);
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
      }
    };
  }, [fetchDashboardData, fetchLiveSessions]);

  // Also fetch targets/scenarios for Quick Execute (always needed)
  useEffect(() => {
    const fetchPickerData = async () => {
      try {
        const [tRes, sRes] = await Promise.allSettled([
          fetch("/api/targets"),
          fetch("/api/scenarios"),
        ]);
        if (tRes.status === "fulfilled" && tRes.value.ok) {
          const d = await tRes.value.json();
          if (d.success) setTargets(d.data?.map((t: Target) => ({ id: t.id, name: t.name })) || []);
        }
        if (sRes.status === "fulfilled" && sRes.value.ok) {
          const d = await sRes.value.json();
          if (d.success) setScenarios(d.data?.map((s: Scenario) => ({ id: s.id, name: s.name })) || []);
        }
      } catch {
        // silent
      }
    };
    fetchPickerData();
  }, []);

  const handleQuickExecute = async () => {
    if (!selectedTarget || !selectedScenario) return;

    setExecuting(true);
    setExecuteResult(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: selectedTarget,
          scenarioId: selectedScenario,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setExecuteResult({ success: true, message: `Session started: ${data.data?.id || "OK"}` });
        setSelectedTarget("");
        setSelectedScenario("");
        // Refresh dashboard data
        setTimeout(fetchDashboardData, 1000);
      } else {
        setExecuteResult({ success: false, message: data.error || "Failed to start session" });
      }
    } catch {
      setExecuteResult({ success: false, message: "Failed to start session" });
    } finally {
      setExecuting(false);
    }
  };

  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getSessionTargetName = (session: RecentSession) => {
    return session.target?.name || session.targetName || "Unknown Target";
  };

  const getSessionScenarioName = (session: RecentSession) => {
    return session.scenario?.name || session.scenarioName || null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fadeIn">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-2">
            Welcome to Token-Burn - Your Chatbot Testing Platform
          </p>
        </div>
        {lastUpdated && (
          <div className="text-xs text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString()}
            <button
              onClick={fetchDashboardData}
              className="ml-2 text-gray-400 hover:text-white transition"
              title="Refresh now"
            >
              &#8635;
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slideIn">
        <StatCard label="Total Targets" value={stats.totalTargets} loading={loading} href="/targets" />
        <StatCard label="Total Scenarios" value={stats.totalScenarios} loading={loading} href="/scenarios" />
        <StatCard
          label="Active Sessions"
          value={stats.activeSessions}
          loading={loading}
          href="/sessions"
          highlight={stats.activeSessions > 0}
        />
        <StatCard label="Total Tests Run" value={stats.totalTestsRun} loading={loading} href="/sessions" />
      </div>

      {/* Live Sessions Panel */}
      <div className="bg-gray-800 rounded-lg p-6 border border-blue-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">Live Sessions</h3>
            <span className="relative flex items-center justify-center">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                liveSessions.length > 0
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}>
                {liveSessions.length}
              </span>
              {liveSessions.length > 0 && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-30 animate-ping" />
              )}
            </span>
          </div>
          <Link href="/sessions" className="text-sm text-blue-400 hover:text-blue-300">
            View all sessions
          </Link>
        </div>

        {liveSessions.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            No active sessions running
          </div>
        ) : (
          <div className="space-y-3">
            {liveSessions.map((session) => (
              <div
                key={session.id}
                className="bg-gray-700/50 rounded-lg p-4 border border-blue-800/50 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <span className="text-sm font-medium text-white truncate">
                      {session.targetName}
                    </span>
                    {session.scenarioName && (
                      <span className="text-xs text-gray-400 truncate">
                        / {session.scenarioName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 ml-4">
                    {session.startedAt && (
                      <span>
                        Elapsed: <LiveSessionElapsed startedAt={session.startedAt} />
                      </span>
                    )}
                    <span>{session.messageCount} message{session.messageCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <Link
                  href={`/sessions/${session.id}`}
                  className="shrink-0 ml-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                  Watch Live
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sessions */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Sessions</h3>
            <Link href="/sessions" className="text-sm text-blue-400 hover:text-blue-300">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="text-gray-500 text-center py-8">Loading...</div>
          ) : recentSessions.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No sessions yet. Use Quick Execute to start one.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.slice(0, 5).map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="block bg-gray-700/50 rounded-lg p-3 border border-gray-600 hover:border-gray-500 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {getSessionTargetName(session)}
                      </span>
                      {getSessionScenarioName(session) && (
                        <span className="text-xs text-gray-400">
                          / {getSessionScenarioName(session)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        STATUS_STYLES[session.status] || STATUS_STYLES.PENDING
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {session.startedAt ? getRelativeTime(session.startedAt) : "Not started"}
                    {session.completedAt && ` - completed ${getRelativeTime(session.completedAt)}`}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Quick Execute + Next Job */}
        <div className="space-y-6">
          {/* Quick Execute */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Quick Execute</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Target</label>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <label className="block text-xs font-medium text-gray-400 mb-1">Scenario</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select scenario...</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleQuickExecute}
                disabled={!selectedTarget || !selectedScenario || executing}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition"
              >
                {executing ? "Starting..." : "Run Test"}
              </button>
              {executeResult && (
                <div
                  className={`text-xs p-2 rounded ${
                    executeResult.success
                      ? "bg-green-900/20 text-green-400 border border-green-800"
                      : "bg-red-900/20 text-red-400 border border-red-800"
                  }`}
                >
                  {executeResult.message}
                </div>
              )}
            </div>

            {targets.length === 0 && scenarios.length === 0 && !loading && (
              <div className="mt-3 text-xs text-gray-500">
                Create a <Link href="/targets/new" className="text-blue-400 hover:underline">target</Link> and{" "}
                <Link href="/scenarios/new" className="text-blue-400 hover:underline">scenario</Link> first.
              </div>
            )}
          </div>

          {/* Next Scheduled Job */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Next Scheduled Job</h3>
            {nextJob ? (
              <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                <div className="text-sm font-medium text-white mb-1">{nextJob.scenario.name}</div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>
                    Schedule: <span className="text-gray-300 font-mono">{nextJob.cronExpression}</span>
                  </div>
                  {nextJob.nextRunAt && (
                    <div>
                      Next run:{" "}
                      <span className="text-gray-300">
                        {new Date(nextJob.nextRunAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4 text-sm">No scheduled jobs</div>
            )}
          </div>
        </div>
      </div>

      {/* Getting Started - show only when no data */}
      {!loading && stats.totalTargets === 0 && stats.totalScenarios === 0 && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">Getting Started</h3>
          <p className="text-gray-300 mb-4">
            Start testing your chatbots by following these steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>
              <Link href="/targets/new" className="text-blue-400 hover:underline">
                Create a target
              </Link>{" "}
              chatbot endpoint
            </li>
            <li>
              <Link href="/scenarios/new" className="text-blue-400 hover:underline">
                Design a test scenario
              </Link>{" "}
              with conversation flows
            </li>
            <li>Execute the scenario and monitor results</li>
            <li>Analyze metrics and optimize your chatbot</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// --- Stat Card Component ---

function StatCard({
  label,
  value,
  loading,
  href,
  highlight,
}: {
  label: string;
  value: number;
  loading: boolean;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`bg-gray-800 rounded-lg p-6 border transition hover:border-gray-500 ${
        highlight ? "border-blue-700" : "border-gray-700"
      }`}
    >
      <h3 className="text-sm font-medium text-gray-400">{label}</h3>
      {loading ? (
        <div className="h-9 mt-2 bg-gray-700 rounded animate-pulse w-16" />
      ) : (
        <p className={`text-3xl font-bold mt-2 ${highlight ? "text-blue-400" : "text-white"}`}>
          {value}
        </p>
      )}
    </Link>
  );
}
