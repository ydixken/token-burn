"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  flowConfig?: unknown[];
  repetitions: number;
  concurrency: number;
  delayBetweenMs: number;
}

interface Target {
  id: string;
  name: string;
  connectorType: string;
  isActive: boolean;
}

export default function ExecuteScenarioPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Execution config
  const [selectedTarget, setSelectedTarget] = useState("");
  const [repetitions, setRepetitions] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [delayBetweenMs, setDelayBetweenMs] = useState(0);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    Promise.all([fetchScenario(), fetchTargets()]).finally(() =>
      setLoading(false)
    );
  }, [scenarioId]);

  const fetchScenario = async () => {
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}`);
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        setScenario(s);
        setRepetitions(s.repetitions ?? 1);
        setConcurrency(s.concurrency ?? 1);
        setDelayBetweenMs(s.delayBetweenMs ?? 0);
      } else {
        setError(data.error || "Failed to load scenario");
      }
    } catch {
      setError("Failed to load scenario");
    }
  };

  const fetchTargets = async () => {
    try {
      const res = await fetch("/api/targets");
      const data = await res.json();
      if (data.success) {
        setTargets((data.data || []).filter((t: Target) => t.isActive));
      }
    } catch {
      // silent
    }
  };

  const handleExecute = async () => {
    if (!selectedTarget) {
      setError("Please select a target");
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: selectedTarget,
          scenarioId,
          executionConfig: {
            repetitions,
            concurrency,
            delayBetweenMs,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/sessions/${data.data.sessionId}`);
      } else {
        setError(data.error || "Failed to start execution");
      }
    } catch {
      setError("Failed to start execution");
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading scenario...</div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
          <p className="text-red-300">{error || "Scenario not found"}</p>
        </div>
        <Link
          href="/scenarios"
          className="inline-block px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          &larr; Back to Scenarios
        </Link>
      </div>
    );
  }

  const stepCount = Array.isArray(scenario.flowConfig)
    ? scenario.flowConfig.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Execute Scenario"
        description={scenario.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Scenarios", href: "/scenarios" },
          { label: scenario.name, href: `/scenarios/${scenarioId}/edit` },
          { label: "Execute" },
        ]}
      />

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-300 ml-2"
          >
            &times;
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenario Summary */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base">Scenario Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Name</span>
                <span className="text-sm text-gray-100 font-medium">
                  {scenario.name}
                </span>
              </div>
              {scenario.category && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Category</span>
                  <Badge variant="neutral" size="sm">
                    {scenario.category}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Steps</span>
                <span className="text-sm text-gray-100">{stepCount}</span>
              </div>
              {scenario.description && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-xs text-gray-500">{scenario.description}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Default Repetitions</span>
                <span className="text-sm text-gray-100">
                  {scenario.repetitions}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Default Concurrency</span>
                <span className="text-sm text-gray-100">
                  {scenario.concurrency}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Default Delay</span>
                <span className="text-sm text-gray-100">
                  {scenario.delayBetweenMs}ms
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Execution Config */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base">Execution Config</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Target Selector */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Target <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select target...</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.connectorType.replace("_", " ")})
                    </option>
                  ))}
                </select>
                {targets.length === 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    No active targets.{" "}
                    <Link href="/targets/new" className="text-blue-400 hover:underline">
                      Create one
                    </Link>
                  </p>
                )}
              </div>

              {/* Repetitions */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Repetitions
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={repetitions}
                  onChange={(e) =>
                    setRepetitions(parseInt(e.target.value) || 1)
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Concurrency */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Concurrency
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={concurrency}
                  onChange={(e) =>
                    setConcurrency(parseInt(e.target.value) || 1)
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Delay */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Delay Between Messages (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={100}
                  value={delayBetweenMs}
                  onChange={(e) =>
                    setDelayBetweenMs(parseInt(e.target.value) || 0)
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Execute Button */}
              <Button
                variant="primary"
                className="w-full mt-2"
                size="md"
                onClick={handleExecute}
                disabled={!selectedTarget || executing}
                loading={executing}
              >
                <Play className="h-3.5 w-3.5" />
                {executing ? "Starting..." : "Execute Test"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
