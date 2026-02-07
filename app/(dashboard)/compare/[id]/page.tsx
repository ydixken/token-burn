"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionSummaryMetrics {
  messageCount?: number;
  totalTokens?: number;
  avgResponseTimeMs?: number;
  errorCount?: number;
  errorRate?: number;
  p50ResponseTimeMs?: number;
  p95ResponseTimeMs?: number;
  p99ResponseTimeMs?: number;
}

interface ComparisonSession {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  target: { id: string; name: string; connectorType: string };
  scenario: { id: string; name: string; category: string } | null;
  summaryMetrics: SessionSummaryMetrics | null;
}

interface ComparisonResults {
  responseTime: { a: number; b: number; diff: number; diffPercent: number };
  tokenUsage: { a: number; b: number; diff: number; diffPercent: number };
  errorRate: { a: number; b: number; diff: number };
  messageCount: { a: number; b: number; diff: number };
  winner: "A" | "B" | "tie";
}

interface ComparisonDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  sessionA: ComparisonSession;
  sessionB: ComparisonSession;
  results: ComparisonResults | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const chartOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#9ca3af" } },
  },
  scales: {
    x: { ticks: { color: "#9ca3af" }, grid: { color: "#374151" } },
    y: { ticks: { color: "#9ca3af" }, grid: { color: "#374151" } },
  },
};

function winnerFor(a: number, b: number, lowerIsBetter: boolean): "A" | "B" | "tie" {
  if (a === b) return "tie";
  if (lowerIsBetter) return a < b ? "A" : "B";
  return a > b ? "A" : "B";
}

function WinnerBadge({ side }: { side: "A" | "B" | "tie" }) {
  if (side === "tie") return null;
  return (
    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-900/60 text-green-300">
      WINNER
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ComparisonDetailPage() {
  const params = useParams();
  const comparisonId = params.id as string;

  const [comparison, setComparison] = useState<ComparisonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      try {
        const response = await fetch(`/api/compare/${comparisonId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Comparison not found");
            return;
          }
          throw new Error("Failed to fetch comparison");
        }
        const data = await response.json();
        if (data.success) {
          setComparison(data.data);
        } else {
          setError(data.error || "Failed to load comparison");
        }
      } catch {
        setError("Failed to fetch comparison");
      } finally {
        setLoading(false);
      }
    };
    fetchComparison();
  }, [comparisonId]);

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading comparison...</div>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
          <p className="text-red-300">{error || "Comparison not found"}</p>
        </div>
        <Link
          href="/compare"
          className="inline-block px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          &larr; Back to Comparisons
        </Link>
      </div>
    );
  }

  const { sessionA, sessionB, results } = comparison;
  const metricsA = sessionA.summaryMetrics || ({} as SessionSummaryMetrics);
  const metricsB = sessionB.summaryMetrics || ({} as SessionSummaryMetrics);

  // ── Chart data ──

  const responseTimeChartData = {
    labels: ["Avg", "P50", "P95", "P99"],
    datasets: [
      {
        label: `A: ${sessionA.target.name}`,
        data: [
          metricsA.avgResponseTimeMs ?? 0,
          metricsA.p50ResponseTimeMs ?? 0,
          metricsA.p95ResponseTimeMs ?? 0,
          metricsA.p99ResponseTimeMs ?? 0,
        ],
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 1,
      },
      {
        label: `B: ${sessionB.target.name}`,
        data: [
          metricsB.avgResponseTimeMs ?? 0,
          metricsB.p50ResponseTimeMs ?? 0,
          metricsB.p95ResponseTimeMs ?? 0,
          metricsB.p99ResponseTimeMs ?? 0,
        ],
        backgroundColor: "rgba(168, 85, 247, 0.7)",
        borderColor: "rgb(168, 85, 247)",
        borderWidth: 1,
      },
    ],
  };

  const tokenChartData = {
    labels: ["Total Tokens", "Messages"],
    datasets: [
      {
        label: `A: ${sessionA.target.name}`,
        data: [metricsA.totalTokens ?? 0, metricsA.messageCount ?? 0],
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 1,
      },
      {
        label: `B: ${sessionB.target.name}`,
        data: [metricsB.totalTokens ?? 0, metricsB.messageCount ?? 0],
        backgroundColor: "rgba(168, 85, 247, 0.7)",
        borderColor: "rgb(168, 85, 247)",
        borderWidth: 1,
      },
    ],
  };

  const errorRateA = metricsA.errorRate ?? (results?.errorRate.a ?? 0);
  const errorRateB = metricsB.errorRate ?? (results?.errorRate.b ?? 0);

  const errorChartData = {
    labels: ["Error Rate (%)"],
    datasets: [
      {
        label: `A: ${sessionA.target.name}`,
        data: [errorRateA * 100],
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 1,
      },
      {
        label: `B: ${sessionB.target.name}`,
        data: [errorRateB * 100],
        backgroundColor: "rgba(168, 85, 247, 0.7)",
        borderColor: "rgb(168, 85, 247)",
        borderWidth: 1,
      },
    ],
  };

  // ── Metric row helper ──

  const metricRows: {
    label: string;
    a: string;
    b: string;
    winner: "A" | "B" | "tie";
    diff: string;
  }[] = results
    ? [
        {
          label: "Avg Response Time",
          a: `${results.responseTime.a.toFixed(1)}ms`,
          b: `${results.responseTime.b.toFixed(1)}ms`,
          winner: winnerFor(results.responseTime.a, results.responseTime.b, true),
          diff: `${results.responseTime.diffPercent > 0 ? "+" : ""}${results.responseTime.diffPercent.toFixed(1)}%`,
        },
        {
          label: "Total Tokens",
          a: results.tokenUsage.a.toLocaleString(),
          b: results.tokenUsage.b.toLocaleString(),
          winner: winnerFor(results.tokenUsage.a, results.tokenUsage.b, true),
          diff: `${results.tokenUsage.diffPercent > 0 ? "+" : ""}${results.tokenUsage.diffPercent.toFixed(1)}%`,
        },
        {
          label: "Error Rate",
          a: `${(results.errorRate.a * 100).toFixed(2)}%`,
          b: `${(results.errorRate.b * 100).toFixed(2)}%`,
          winner: winnerFor(results.errorRate.a, results.errorRate.b, true),
          diff: `${results.errorRate.diff > 0 ? "+" : ""}${(results.errorRate.diff * 100).toFixed(2)}pp`,
        },
        {
          label: "Messages",
          a: String(results.messageCount.a),
          b: String(results.messageCount.b),
          winner: "tie" as const,
          diff: String(results.messageCount.diff),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/compare" className="text-gray-400 hover:text-white">
              &larr; Comparisons
            </Link>
            <h1 className="text-3xl font-bold text-white">{comparison.name}</h1>
          </div>
          {comparison.description && (
            <p className="text-gray-400 mt-1">{comparison.description}</p>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {new Date(comparison.createdAt).toLocaleString()}
        </div>
      </div>

      {/* Summary Verdict */}
      {results && (
        <div
          className={`rounded-lg p-6 border ${
            results.winner === "tie"
              ? "bg-gray-800 border-gray-600"
              : "bg-green-900/10 border-green-800/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Overall Verdict
              </div>
              <div className="text-2xl font-bold text-white">
                {results.winner === "tie" ? (
                  "Tie — No Clear Winner"
                ) : (
                  <>
                    <span
                      className={
                        results.winner === "A" ? "text-blue-400" : "text-purple-400"
                      }
                    >
                      {results.winner === "A"
                        ? sessionA.target.name
                        : sessionB.target.name}
                    </span>{" "}
                    wins
                  </>
                )}
              </div>
            </div>
            <div
              className={`text-6xl font-black ${
                results.winner === "A"
                  ? "text-blue-500/20"
                  : results.winner === "B"
                  ? "text-purple-500/20"
                  : "text-gray-700"
              }`}
            >
              {results.winner === "tie" ? "=" : results.winner}
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Session Info */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { session: sessionA, label: "Session A", side: "A" as const, color: "blue" },
          { session: sessionB, label: "Session B", side: "B" as const, color: "purple" },
        ].map(({ session, label, side, color }) => (
          <div
            key={session.id}
            className={`bg-gray-800 rounded-lg p-5 border ${
              results?.winner === side
                ? color === "blue"
                  ? "border-blue-500/50"
                  : "border-purple-500/50"
                : "border-gray-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  color === "blue"
                    ? "bg-blue-900/60 text-blue-300"
                    : "bg-purple-900/60 text-purple-300"
                }`}
              >
                {label}
              </span>
              {results?.winner === side && <WinnerBadge side={side} />}
            </div>
            <div className="text-lg font-semibold text-white mb-1">
              {session.target.name}
            </div>
            <div className="text-xs text-gray-500 mb-2">
              {session.target.connectorType}
              {session.scenario && ` · ${session.scenario.name}`}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-gray-500">Started</div>
                <div className="text-gray-300">
                  {session.startedAt
                    ? new Date(session.startedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Completed</div>
                <div className="text-gray-300">
                  {session.completedAt
                    ? new Date(session.completedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Metrics Comparison Table */}
      {metricRows.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">
              Metric-by-Metric Comparison
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left px-6 py-3">Metric</th>
                <th className="text-right px-6 py-3">
                  <span className="text-blue-400">A</span>:{" "}
                  {sessionA.target.name}
                </th>
                <th className="text-right px-6 py-3">
                  <span className="text-purple-400">B</span>:{" "}
                  {sessionB.target.name}
                </th>
                <th className="text-right px-6 py-3">Diff (A−B)</th>
                <th className="text-center px-6 py-3">Winner</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-gray-700/50"
                >
                  <td className="px-6 py-3 text-gray-300 font-medium">
                    {row.label}
                  </td>
                  <td
                    className={`px-6 py-3 text-right ${
                      row.winner === "A"
                        ? "text-green-400 font-semibold"
                        : "text-gray-300"
                    }`}
                  >
                    {row.a}
                    {row.winner === "A" && <WinnerBadge side="A" />}
                  </td>
                  <td
                    className={`px-6 py-3 text-right ${
                      row.winner === "B"
                        ? "text-green-400 font-semibold"
                        : "text-gray-300"
                    }`}
                  >
                    {row.b}
                    {row.winner === "B" && <WinnerBadge side="B" />}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-400">
                    {row.diff}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {row.winner === "tie" ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <span
                        className={
                          row.winner === "A"
                            ? "text-blue-400 font-bold"
                            : "text-purple-400 font-bold"
                        }
                      >
                        {row.winner}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Time Distribution */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Response Time Distribution
          </h2>
          <div style={{ height: "300px" }}>
            <Bar
              data={responseTimeChartData}
              options={{
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  title: {
                    display: true,
                    text: "Response Time (ms) — lower is better",
                    color: "#9ca3af",
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Token Usage */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Token Usage Comparison
          </h2>
          <div style={{ height: "300px" }}>
            <Bar
              data={tokenChartData}
              options={{
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  title: {
                    display: true,
                    text: "Token & Message Count",
                    color: "#9ca3af",
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Error Rate */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Error Rate Comparison
          </h2>
          <div style={{ height: "300px" }}>
            <Bar
              data={errorChartData}
              options={{
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  title: {
                    display: true,
                    text: "Error Rate (%) — lower is better",
                    color: "#9ca3af",
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Percentile Detail */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Response Time Percentiles
          </h2>
          <div className="space-y-4">
            {[
              { label: "P50", a: metricsA.p50ResponseTimeMs, b: metricsB.p50ResponseTimeMs },
              { label: "P95", a: metricsA.p95ResponseTimeMs, b: metricsB.p95ResponseTimeMs },
              { label: "P99", a: metricsA.p99ResponseTimeMs, b: metricsB.p99ResponseTimeMs },
            ].map(({ label, a, b }) => {
              const aVal = a ?? 0;
              const bVal = b ?? 0;
              const maxVal = Math.max(aVal, bVal, 1);
              const w = winnerFor(aVal, bVal, true);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>{label}</span>
                    <span>
                      {aVal.toFixed(0)}ms vs {bVal.toFixed(0)}ms
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div
                        className={`h-4 rounded ${
                          w === "A" ? "bg-blue-500" : "bg-blue-500/40"
                        }`}
                        style={{ width: `${(aVal / maxVal) * 100}%` }}
                      />
                    </div>
                    <div className="flex-1">
                      <div
                        className={`h-4 rounded ${
                          w === "B" ? "bg-purple-500" : "bg-purple-500/40"
                        }`}
                        style={{ width: `${(bVal / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex gap-4 text-[10px] text-gray-500 mt-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-500 inline-block" /> A:{" "}
                {sessionA.target.name}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-purple-500 inline-block" /> B:{" "}
                {sessionB.target.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Session Links */}
      <div className="flex gap-4">
        <Link
          href={`/sessions/${sessionA.id}`}
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm"
        >
          View Session A Details
        </Link>
        <Link
          href={`/sessions/${sessionB.id}`}
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm"
        >
          View Session B Details
        </Link>
      </div>
    </div>
  );
}
