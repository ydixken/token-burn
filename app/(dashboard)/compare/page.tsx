"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ComparisonSession {
  id: string;
  targetName: string;
  summaryMetrics: {
    messageCount?: number;
    totalTokens?: number;
    avgResponseTimeMs?: number;
    errorCount?: number;
  } | null;
}

interface ComparisonResults {
  responseTime: { a: number; b: number; diff: number; diffPercent: number };
  tokenUsage: { a: number; b: number; diff: number; diffPercent: number };
  errorRate: { a: number; b: number; diff: number };
  messageCount: { a: number; b: number; diff: number };
  winner: "A" | "B" | "tie";
}

interface Comparison {
  id: string;
  name: string;
  description?: string;
  status: string;
  sessionA: ComparisonSession;
  sessionB: ComparisonSession;
  results: ComparisonResults | null;
  createdAt: string;
}

const WINNER_BADGE: Record<string, string> = {
  A: "bg-green-900/50 text-green-300",
  B: "bg-green-900/50 text-green-300",
  tie: "bg-gray-700 text-gray-400",
};

export default function ComparePage() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchComparisons = useCallback(async () => {
    try {
      const response = await fetch(`/api/compare?page=${page}&limit=20`);
      if (!response.ok) {
        if (response.status === 404) {
          setComparisons([]);
          return;
        }
        throw new Error("Failed to fetch");
      }
      const data = await response.json();
      if (data.success) {
        setComparisons(data.data || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
        }
      }
    } catch {
      setComparisons([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this comparison?")) return;
    setDeleting(id);
    try {
      const response = await fetch(`/api/compare/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        setComparisons((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // Ignore
    } finally {
      setDeleting(null);
    }
  };

  const getWinnerLabel = (c: Comparison) => {
    if (!c.results) return null;
    if (c.results.winner === "tie") return "Tie";
    return c.results.winner === "A" ? c.sessionA.targetName : c.sessionB.targetName;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading comparisons...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Comparisons</h1>
          <p className="text-gray-400 mt-1">Side-by-side A/B testing of sessions</p>
        </div>
        <Link
          href="/compare/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          + New Comparison
        </Link>
      </div>

      {comparisons.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
          <h3 className="text-xl font-semibold text-gray-300 mb-2">No comparisons yet</h3>
          <p className="text-gray-400 mb-6">
            Compare two completed sessions to see which target performed better.
          </p>
          <Link
            href="/compare/new"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Create Your First Comparison
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {comparisons.map((c) => {
              const winner = getWinnerLabel(c);
              return (
                <div
                  key={c.id}
                  className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/compare/${c.id}`} className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-white">{c.name}</h3>
                        {c.results && (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              WINNER_BADGE[c.results.winner] || WINNER_BADGE.tie
                            }`}
                          >
                            {c.results.winner === "tie"
                              ? "Tie"
                              : `Winner: ${winner}`}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            c.status === "completed"
                              ? "bg-green-900/50 text-green-300"
                              : c.status === "failed"
                              ? "bg-red-900/50 text-red-300"
                              : "bg-yellow-900/50 text-yellow-300"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-sm text-gray-500 mt-1">{c.description}</p>
                      )}
                    </Link>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
                        className="px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition disabled:opacity-50"
                      >
                        {deleting === c.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Session A vs B */}
                  <Link href={`/compare/${c.id}`} className="block">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex-1 bg-gray-900 rounded p-3 border border-gray-700">
                        <div className="text-[10px] text-gray-500 mb-1">Session A</div>
                        <div className="text-gray-200 font-medium">{c.sessionA.targetName}</div>
                        {c.sessionA.summaryMetrics?.avgResponseTimeMs !== undefined && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.sessionA.summaryMetrics.avgResponseTimeMs.toFixed(0)}ms avg
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600 font-bold text-lg">vs</div>
                      <div className="flex-1 bg-gray-900 rounded p-3 border border-gray-700">
                        <div className="text-[10px] text-gray-500 mb-1">Session B</div>
                        <div className="text-gray-200 font-medium">{c.sessionB.targetName}</div>
                        {c.sessionB.summaryMetrics?.avgResponseTimeMs !== undefined && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.sessionB.summaryMetrics.avgResponseTimeMs.toFixed(0)}ms avg
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick metric diffs */}
                    {c.results && (
                      <div className="flex gap-6 mt-3 text-xs text-gray-500">
                        <span>
                          Response:{" "}
                          <span
                            className={
                              c.results.responseTime.diffPercent < 0
                                ? "text-green-400"
                                : c.results.responseTime.diffPercent > 0
                                ? "text-red-400"
                                : "text-gray-400"
                            }
                          >
                            {c.results.responseTime.diffPercent > 0 ? "+" : ""}
                            {c.results.responseTime.diffPercent.toFixed(1)}%
                          </span>
                        </span>
                        <span>
                          Tokens:{" "}
                          <span
                            className={
                              c.results.tokenUsage.diffPercent < 0
                                ? "text-green-400"
                                : c.results.tokenUsage.diffPercent > 0
                                ? "text-red-400"
                                : "text-gray-400"
                            }
                          >
                            {c.results.tokenUsage.diffPercent > 0 ? "+" : ""}
                            {c.results.tokenUsage.diffPercent.toFixed(1)}%
                          </span>
                        </span>
                        <span>
                          Error diff:{" "}
                          <span className={c.results.errorRate.diff > 0 ? "text-red-400" : "text-green-400"}>
                            {c.results.errorRate.diff > 0 ? "+" : ""}
                            {c.results.errorRate.diff.toFixed(1)}%
                          </span>
                        </span>
                      </div>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
