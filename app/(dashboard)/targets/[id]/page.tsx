"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useTestConnectionStream } from "@/lib/hooks/use-test-connection-stream";
import { DiscoveryProgressTimeline } from "@/components/discovery-progress-timeline";
import { RawResponseViewer } from "@/components/targets/raw-response-viewer";

interface TargetData {
  id: string;
  name: string;
  description?: string;
  connectorType: string;
  endpoint: string;
  authType: string;
  authConfig: Record<string, unknown>;
  requestTemplate: {
    messagePath: string;
    structure: Record<string, unknown>;
    variables?: Record<string, unknown>;
  };
  responseTemplate: {
    responsePath: string;
    tokenUsagePath?: string;
    errorPath?: string;
    transform?: string;
  };
  protocolConfig?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  lastTestError?: string;
  sessionCount?: number;
  scenarioCount?: number;
}

interface TestResult {
  healthy: boolean;
  latencyMs: number;
  connectLatencyMs?: number;
  healthCheckLatencyMs?: number;
  testResponse?: string;
  connectorType?: string;
  error?: string;
}

interface TokenRefreshData {
  targetId: string;
  isActive: boolean;
  isScheduled: boolean;
  lastRefreshAt: string | null;
  lastRefreshStatus: "success" | "failed" | null;
  lastRefreshError: string | null;
  consecutiveFailures: number;
  nextRefreshAt: string | null;
  refreshIntervalMs: number | null;
  queueStats: { waiting: number; active: number; completed: number; failed: number; total: number };
}

const getConnectorBadgeColor = (type: string) => {
  const colors: Record<string, string> = {
    HTTP_REST: "bg-blue-900 text-blue-300",
    WEBSOCKET: "bg-purple-900 text-purple-300",
    GRPC: "bg-green-900 text-green-300",
    SSE: "bg-yellow-900 text-yellow-300",
  };
  return colors[type] || "bg-gray-900 text-gray-300";
};

const getStatusBadge = (target: TargetData) => {
  if (target.lastTestAt == null) {
    return { color: "bg-gray-700 text-gray-400", dot: "bg-gray-400", label: "Never Tested" };
  }
  if (target.lastTestSuccess) {
    return { color: "bg-green-900/30 text-green-400", dot: "bg-green-400", label: "Healthy" };
  }
  return { color: "bg-red-900/30 text-red-400", dot: "bg-red-400", label: "Failing" };
};

export default function TargetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params.id as string;

  const [target, setTarget] = useState<TargetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [refreshData, setRefreshData] = useState<TokenRefreshData | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshActionLoading, setRefreshActionLoading] = useState(false);
  const { events: streamEvents, status: streamStatus, result: streamResult, rawResponse: streamRawResponse, startTest: startStreamTest } = useTestConnectionStream(targetId);

  useEffect(() => {
    fetchTarget();
  }, [targetId]);

  const fetchTarget = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/targets/${targetId}`);
      const result = await response.json();

      if (result.success) {
        setTarget(result.data);
      } else {
        setError(result.error || "Failed to fetch target");
      }
    } catch {
      setError("Failed to fetch target");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/targets/${targetId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMessage: "Hello, this is a connection test." }),
      });

      const result = await response.json();
      if (result.success) {
        setTestResult(result.data);
        // Refresh target to get updated lastTest fields
        fetchTarget();
      } else {
        setTestResult({
          healthy: false,
          latencyMs: result.data?.latencyMs || 0,
          error: result.error || result.data?.error || "Connection test failed",
        });
      }
    } catch {
      setTestResult({
        healthy: false,
        latencyMs: 0,
        error: "Failed to reach test endpoint",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this target? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/targets/${targetId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        router.push("/targets");
      } else {
        alert(result.error || "Failed to delete target");
      }
    } catch {
      alert("Failed to delete target");
    } finally {
      setDeleting(false);
    }
  };

  const fetchRefreshStatus = async () => {
    try {
      const res = await fetch(`/api/targets/${targetId}/token-refresh`);
      const data = await res.json();
      if (data.success) setRefreshData(data.data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (target?.connectorType !== "BROWSER_WEBSOCKET") return;
    setRefreshLoading(true);
    fetchRefreshStatus().finally(() => setRefreshLoading(false));
    const interval = setInterval(fetchRefreshStatus, 5000);
    return () => clearInterval(interval);
  }, [target?.connectorType, targetId]);

  const handleRefreshAction = async (action: "start" | "stop" | "force") => {
    setRefreshActionLoading(true);
    try {
      await fetch(`/api/targets/${targetId}/token-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await fetchRefreshStatus();
    } catch { /* silent */ }
    finally { setRefreshActionLoading(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="animate-skeleton h-4 w-14 rounded bg-gray-800" />
              <span className="text-gray-600">/</span>
              <div className="animate-skeleton h-4 w-28 rounded bg-gray-800" />
            </div>
            <div className="animate-skeleton h-8 w-52 rounded bg-gray-800 mb-2" />
            <div className="animate-skeleton h-4 w-72 rounded bg-gray-800" />
          </div>
          <div className="animate-skeleton h-7 w-24 rounded-full bg-gray-800" />
        </div>

        {/* Quick Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="animate-skeleton h-3 w-20 rounded bg-gray-700 mb-2" />
              <div className="animate-skeleton h-5 w-16 rounded bg-gray-700" />
            </div>
          ))}
        </div>

        {/* Connection Details skeleton */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="animate-skeleton h-5 w-40 rounded bg-gray-700 mb-4" />
          <div className="space-y-3">
            <div>
              <div className="animate-skeleton h-3 w-16 rounded bg-gray-700 mb-1" />
              <div className="animate-skeleton h-9 w-full rounded bg-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="animate-skeleton h-3 w-20 rounded bg-gray-700 mb-1" />
                <div className="animate-skeleton h-4 w-24 rounded bg-gray-700" />
              </div>
              <div>
                <div className="animate-skeleton h-3 w-24 rounded bg-gray-700 mb-1" />
                <div className="animate-skeleton h-4 w-20 rounded bg-gray-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Request Template skeleton */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="animate-skeleton h-5 w-36 rounded bg-gray-700 mb-4" />
          <div className="space-y-3">
            <div>
              <div className="animate-skeleton h-3 w-24 rounded bg-gray-700 mb-1" />
              <div className="animate-skeleton h-9 w-full rounded bg-gray-900" />
            </div>
            <div>
              <div className="animate-skeleton h-3 w-16 rounded bg-gray-700 mb-1" />
              <div className="animate-skeleton h-24 w-full rounded bg-gray-900" />
            </div>
          </div>
        </div>

        {/* Response Template skeleton */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="animate-skeleton h-5 w-40 rounded bg-gray-700 mb-4" />
          <div className="space-y-3">
            <div>
              <div className="animate-skeleton h-3 w-20 rounded bg-gray-700 mb-1" />
              <div className="animate-skeleton h-9 w-full rounded bg-gray-900" />
            </div>
          </div>
        </div>

        {/* Actions skeleton */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="animate-skeleton h-5 w-16 rounded bg-gray-700 mb-4" />
          <div className="flex gap-3">
            <div className="animate-skeleton h-9 w-24 rounded-lg bg-gray-700" />
            <div className="animate-skeleton h-9 w-28 rounded-lg bg-gray-700" />
            <div className="animate-skeleton h-9 w-28 rounded-lg bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !target) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
          <p className="text-red-300">{error || "Target not found"}</p>
        </div>
        <Link href="/targets" className="inline-block px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
          Back to Targets
        </Link>
      </div>
    );
  }

  const status = getStatusBadge(target);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/targets" className="text-gray-400 hover:text-white text-sm">
              Targets
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white text-sm">{target.name}</span>
          </div>
          <h1 className="text-3xl font-bold text-white">{target.name}</h1>
          {target.description && (
            <p className="text-gray-400 mt-1">{target.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${status.color}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {status.label}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Connector Type</div>
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getConnectorBadgeColor(target.connectorType)}`}>
            {target.connectorType.replace("_", " ")}
          </span>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Auth Type</div>
          <div className="text-white text-sm font-medium">{target.authType.replace(/_/g, " ")}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Sessions</div>
          <div className="text-white text-sm font-medium">{target.sessionCount ?? 0}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Scenarios</div>
          <div className="text-white text-sm font-medium">{target.scenarioCount ?? 0}</div>
        </div>
      </div>

      {/* Connection Details */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Connection Details</h3>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">Endpoint</div>
            <div className="bg-gray-900 rounded px-3 py-2 font-mono text-sm text-gray-200 break-all">
              {target.endpoint}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Connector</div>
              <div className="text-sm text-gray-300">{target.connectorType.replace("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Authentication</div>
              <div className="text-sm text-gray-300">{target.authType.replace(/_/g, " ")}</div>
            </div>
          </div>
          {target.authConfig && Object.keys(target.authConfig).length > 0 && target.authType !== "NONE" && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Auth Configuration (masked)</div>
              <pre className="bg-gray-900 rounded px-3 py-2 text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(target.authConfig, null, 2)}
              </pre>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Status:</span>
            <span className={`flex items-center gap-1.5 ${target.isActive ? "text-green-400" : "text-gray-400"}`}>
              <span className={`w-2 h-2 rounded-full ${target.isActive ? "bg-green-400" : "bg-gray-500"}`} />
              {target.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Request Template */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Request Template</h3>
        <div className="space-y-3">
          {target.requestTemplate?.messagePath && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Message Path</div>
              <div className="bg-gray-900 rounded px-3 py-2 font-mono text-sm text-gray-200">
                {target.requestTemplate.messagePath}
              </div>
            </div>
          )}
          {target.requestTemplate?.structure && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Structure</div>
              <pre className="bg-gray-900 rounded px-3 py-2 text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto">
                {JSON.stringify(target.requestTemplate.structure, null, 2)}
              </pre>
            </div>
          )}
          {target.requestTemplate?.variables && Object.keys(target.requestTemplate.variables).length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Variables</div>
              <pre className="bg-gray-900 rounded px-3 py-2 text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(target.requestTemplate.variables, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Response Template */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Response Template</h3>
        <div className="space-y-3">
          {target.responseTemplate?.responsePath && (
            <div>
              <div className="text-xs text-gray-400 mb-1">
                Content Path <span className="text-green-400">(content)</span>
              </div>
              <div className="bg-gray-900 rounded px-3 py-2 font-mono text-sm text-gray-200">
                {target.responseTemplate.responsePath}
              </div>
            </div>
          )}
          {target.responseTemplate?.tokenUsagePath && (
            <div>
              <div className="text-xs text-gray-400 mb-1">
                Token Usage Path <span className="text-blue-400">(tokens)</span>
              </div>
              <div className="bg-gray-900 rounded px-3 py-2 font-mono text-sm text-gray-200">
                {target.responseTemplate.tokenUsagePath}
              </div>
            </div>
          )}
          {target.responseTemplate?.errorPath && (
            <div>
              <div className="text-xs text-gray-400 mb-1">
                Error Path <span className="text-red-400">(errors)</span>
              </div>
              <div className="bg-gray-900 rounded px-3 py-2 font-mono text-sm text-gray-200">
                {target.responseTemplate.errorPath}
              </div>
            </div>
          )}
          {target.responseTemplate?.transform && target.responseTemplate.transform !== "none" && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Transform</div>
              <div className="text-sm text-gray-300">{target.responseTemplate.transform}</div>
            </div>
          )}
        </div>
      </div>

      {/* Last Test Result */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Last Test Result</h3>
        {target.lastTestAt ? (
          <div
            className={`rounded-lg border p-4 text-sm ${
              target.lastTestSuccess
                ? "bg-green-900/20 border-green-800"
                : "bg-red-900/20 border-red-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${target.lastTestSuccess ? "bg-green-400" : "bg-red-400"}`} />
              <span className={target.lastTestSuccess ? "text-green-300 font-medium" : "text-red-300 font-medium"}>
                {target.lastTestSuccess ? "Test Passed" : "Test Failed"}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {new Date(target.lastTestAt).toLocaleString()}
              </span>
            </div>
            {target.lastTestError && (
              <div className="text-xs text-red-400 mt-1">{target.lastTestError}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No tests have been run yet. Click &quot;Test Connection&quot; below to verify connectivity.
          </div>
        )}
      </div>

      {/* Token Refresh — only for BROWSER_WEBSOCKET */}
      {target.connectorType === "BROWSER_WEBSOCKET" && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Token Refresh</h3>
              {refreshData?.isActive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {refreshData?.isActive ? (
                <>
                  <button
                    onClick={() => handleRefreshAction("force")}
                    disabled={refreshActionLoading}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-md text-xs font-medium transition-colors"
                  >
                    Force Refresh
                  </button>
                  <button
                    onClick={() => handleRefreshAction("stop")}
                    disabled={refreshActionLoading}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-md text-xs font-medium transition-colors"
                  >
                    Stop
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleRefreshAction("start")}
                  disabled={refreshActionLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white rounded-md text-xs font-medium transition-colors"
                >
                  Start Refresh
                </button>
              )}
            </div>
          </div>

          {refreshLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-skeleton h-4 w-full rounded bg-gray-700" />
              ))}
            </div>
          ) : refreshData ? (
            <div className="space-y-3">
              {/* Status grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase mb-1">Status</div>
                  <div className={`text-sm font-medium ${refreshData.isActive ? "text-emerald-400" : "text-gray-400"}`}>
                    {refreshData.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase mb-1">Last Refresh</div>
                  <div className="text-sm text-gray-300">
                    {refreshData.lastRefreshAt
                      ? new Date(refreshData.lastRefreshAt).toLocaleTimeString()
                      : "Never"}
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase mb-1">Result</div>
                  <div className={`text-sm font-medium ${
                    refreshData.lastRefreshStatus === "success" ? "text-emerald-400" :
                    refreshData.lastRefreshStatus === "failed" ? "text-red-400" : "text-gray-400"
                  }`}>
                    {refreshData.lastRefreshStatus ?? "N/A"}
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase mb-1">Interval</div>
                  <div className="text-sm text-gray-300">
                    {refreshData.refreshIntervalMs
                      ? `${Math.round(refreshData.refreshIntervalMs / 1000)}s`
                      : "N/A"}
                  </div>
                </div>
              </div>

              {/* Error display */}
              {refreshData.lastRefreshError && (
                <div className="rounded-md border border-red-800/50 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                  {refreshData.lastRefreshError}
                </div>
              )}

              {/* Consecutive failures warning */}
              {refreshData.consecutiveFailures > 0 && (
                <div className="rounded-md border border-amber-800/50 bg-amber-900/10 px-3 py-2 text-xs text-amber-400">
                  {refreshData.consecutiveFailures} consecutive failure{refreshData.consecutiveFailures > 1 ? "s" : ""}
                </div>
              )}

              {/* Next refresh time */}
              {refreshData.nextRefreshAt && refreshData.isActive && (
                <div className="text-xs text-gray-500">
                  Next refresh: {new Date(refreshData.nextRefreshAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Token refresh is not configured for this target. Run a connection test to auto-start.
            </div>
          )}
        </div>
      )}

      {/* Test Connection */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3">Test Connection</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-2 ${
              testing
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
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

          {target.connectorType === "BROWSER_WEBSOCKET" && (
            <button
              onClick={() => startStreamTest()}
              disabled={streamStatus === "streaming"}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {streamStatus === "streaming" ? "Streaming..." : "Stream Discovery Test"}
            </button>
          )}
        </div>

        {testResult && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              testResult.healthy
                ? "bg-green-900/20 border-green-800"
                : "bg-red-900/20 border-red-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${testResult.healthy ? "bg-green-400" : "bg-red-400"}`} />
              <span className={testResult.healthy ? "text-green-300 font-medium" : "text-red-300 font-medium"}>
                {testResult.healthy ? "Connection Successful" : "Connection Failed"}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{Math.round(testResult.latencyMs)}ms</span>
            </div>
            {testResult.testResponse && (
              <div className="mt-2">
                <div className="text-xs text-gray-500 mb-1">Response:</div>
                <div className="text-sm text-gray-300 bg-gray-900 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {testResult.testResponse}
                </div>
              </div>
            )}
            {testResult.error && (
              <div className="text-red-400 text-xs mt-2">{testResult.error}</div>
            )}
          </div>
        )}

        {/* Streaming Discovery Timeline - Browser WebSocket only */}
        {target.connectorType === "BROWSER_WEBSOCKET" && (streamEvents.length > 0 || streamStatus === "streaming") && (
          <DiscoveryProgressTimeline events={streamEvents} status={streamStatus} />
        )}

        {target.connectorType === "BROWSER_WEBSOCKET" && streamRawResponse && (
              <RawResponseViewer
                rawResponse={streamRawResponse.data}
                extractedContent={streamRawResponse.extractedContent}
                currentResponsePath={target?.responseTemplate?.responsePath}
              />
        )}

        {target.connectorType === "BROWSER_WEBSOCKET" && streamResult && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              streamResult.success
                ? "bg-green-900/20 border-green-800"
                : "bg-red-900/20 border-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${streamResult.success ? "bg-green-400" : "bg-red-400"}`} />
              <span className={streamResult.success ? "text-green-300" : "text-red-300"}>
                {streamResult.success ? "Discovery Successful" : "Discovery Failed"}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{Math.round(streamResult.data.latencyMs)}ms</span>
            </div>
            {streamResult.data.error && (
              <div className="text-red-400 text-xs mt-2">{streamResult.data.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/targets/${target.id}/edit`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Edit Target
          </Link>
          <Link
            href={`/sessions?targetId=${target.id}`}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Sessions
          </Link>
          <Link
            href={`/scenarios?targetId=${target.id}`}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Scenarios
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors ml-auto"
          >
            {deleting ? "Deleting..." : "Delete Target"}
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="text-xs text-gray-500 flex items-center gap-4">
        <span>Created: {new Date(target.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(target.updatedAt).toLocaleString()}</span>
        <span className="font-mono">ID: {target.id}</span>
      </div>
    </div>
  );
}
