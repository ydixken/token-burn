"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Session {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  target: {
    name: string;
    connectorType: string;
  } | null;
  scenario: {
    name: string;
  } | null;
  summaryMetrics: {
    messageCount?: number;
    totalTokens?: number;
    avgResponseTimeMs?: number;
  } | null;
}

export default function NewComparisonPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sessionAId, setSessionAId] = useState("");
  const [sessionBId, setSessionBId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch("/api/sessions?status=COMPLETED&limit=100");
      if (!response.ok) {
        if (response.status === 404) {
          setSessions([]);
          return;
        }
        throw new Error("Failed to fetch");
      }
      const data = await response.json();
      if (data.success) {
        setSessions(data.data || []);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!sessionAId) {
      setError("Select Session A");
      return;
    }
    if (!sessionBId) {
      setError("Select Session B");
      return;
    }
    if (sessionAId === sessionBId) {
      setError("Cannot compare a session with itself");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          sessionAId,
          sessionBId,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("Comparison API not available yet");
          return;
        }
        const data = await response.json().catch(() => null);
        setError(data?.error || "Failed to create comparison");
        return;
      }

      const data = await response.json();
      if (data.success) {
        router.push(`/compare/${data.data.id}`);
      } else {
        setError(data.error || "Failed to create comparison");
      }
    } catch {
      setError("Failed to create comparison");
    } finally {
      setSubmitting(false);
    }
  };

  const getSessionLabel = (s: Session) => {
    const target = s.target?.name || "Unknown target";
    const scenario = s.scenario?.name || "Unknown scenario";
    const date = s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "";
    return `${target} — ${scenario} (${date})`;
  };

  const getSessionPreview = (id: string) => {
    const s = sessions.find((s) => s.id === id);
    if (!s) return null;
    return s;
  };

  const sessionAPreview = getSessionPreview(sessionAId);
  const sessionBPreview = getSessionPreview(sessionBId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/compare" className="text-gray-400 hover:text-white text-sm">
            &larr; Comparisons
          </Link>
          <h1 className="text-3xl font-bold text-white">New Comparison</h1>
        </div>
        <p className="text-gray-400">Select two completed sessions to compare side-by-side</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Comparison Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. GPT-4 vs Claude — Customer Support"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about this comparison..."
            rows={2}
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            maxLength={1000}
          />
        </div>

        {/* Session selectors */}
        <div className="grid grid-cols-2 gap-4">
          {/* Session A */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Session A <span className="text-red-400">*</span>
            </label>
            <select
              value={sessionAId}
              onChange={(e) => setSessionAId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select session...</option>
              {sessions
                .filter((s) => s.id !== sessionBId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSessionLabel(s)}
                  </option>
                ))}
            </select>

            {/* Preview */}
            {sessionAPreview && (
              <div className="mt-2 bg-gray-900 rounded border border-gray-700 p-3">
                <div className="text-xs text-gray-500 mb-1">Preview</div>
                <div className="text-sm text-gray-200 font-medium">
                  {sessionAPreview.target?.name}
                </div>
                <div className="text-[10px] text-gray-500">
                  {sessionAPreview.target?.connectorType}
                </div>
                {sessionAPreview.summaryMetrics && (
                  <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                    {sessionAPreview.summaryMetrics.avgResponseTimeMs !== undefined && (
                      <span>{sessionAPreview.summaryMetrics.avgResponseTimeMs.toFixed(0)}ms avg</span>
                    )}
                    {sessionAPreview.summaryMetrics.totalTokens !== undefined && (
                      <span>{sessionAPreview.summaryMetrics.totalTokens.toLocaleString()} tokens</span>
                    )}
                    {sessionAPreview.summaryMetrics.messageCount !== undefined && (
                      <span>{sessionAPreview.summaryMetrics.messageCount} msgs</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Session B */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Session B <span className="text-red-400">*</span>
            </label>
            <select
              value={sessionBId}
              onChange={(e) => setSessionBId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select session...</option>
              {sessions
                .filter((s) => s.id !== sessionAId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSessionLabel(s)}
                  </option>
                ))}
            </select>

            {/* Preview */}
            {sessionBPreview && (
              <div className="mt-2 bg-gray-900 rounded border border-gray-700 p-3">
                <div className="text-xs text-gray-500 mb-1">Preview</div>
                <div className="text-sm text-gray-200 font-medium">
                  {sessionBPreview.target?.name}
                </div>
                <div className="text-[10px] text-gray-500">
                  {sessionBPreview.target?.connectorType}
                </div>
                {sessionBPreview.summaryMetrics && (
                  <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                    {sessionBPreview.summaryMetrics.avgResponseTimeMs !== undefined && (
                      <span>{sessionBPreview.summaryMetrics.avgResponseTimeMs.toFixed(0)}ms avg</span>
                    )}
                    {sessionBPreview.summaryMetrics.totalTokens !== undefined && (
                      <span>{sessionBPreview.summaryMetrics.totalTokens.toLocaleString()} tokens</span>
                    )}
                    {sessionBPreview.summaryMetrics.messageCount !== undefined && (
                      <span>{sessionBPreview.summaryMetrics.messageCount} msgs</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {sessions.length === 0 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 text-yellow-400 text-sm">
            No completed sessions available. Run some test sessions first.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !sessionAId || !sessionBId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition"
          >
            {submitting ? "Creating..." : "Compare Sessions"}
          </button>
          <Link
            href="/compare"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
