"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FlowBuilder, { FlowStep } from "@/components/scenarios/FlowBuilder";
import { SCENARIO_TEMPLATES, type ScenarioTemplate } from "@/lib/scenarios/templates";

interface StatusCodeRule {
  codes: string;
  action: "skip" | "abort" | "retry";
  maxRetries: number;
  delayMs: number;
}

interface Target {
  id: string;
  name: string;
  connectorType: string;
}

const CATEGORIES = [
  "Stress Test",
  "Functional Test",
  "Edge Case",
  "Load Test",
  "Regression",
  "Integration",
  "Custom",
];

const VERBOSITY_LEVELS = [
  { value: "minimal", label: "Minimal" },
  { value: "basic", label: "Basic" },
  { value: "normal", label: "Normal" },
  { value: "verbose", label: "Verbose" },
  { value: "extreme", label: "Extreme" },
];

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  STRESS_TEST: "bg-red-500/10 text-red-400 border-red-500/20",
  EDGE_CASE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CONTEXT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PERFORMANCE: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  LOGIC: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  KRAWALL: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ATTACK_SURFACE: "bg-red-500/10 text-red-400 border-red-500/20",
};

function getCategoryBadgeColor(category: string): string {
  return CATEGORY_BADGE_COLORS[category] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

let stepCounter = 0;
function generateId(): string {
  stepCounter++;
  return "tpl_" + stepCounter + "_" + Math.random().toString(36).substring(2, 7);
}

/**
 * Convert template flowConfig entries into FlowStep[] format
 * compatible with the FlowBuilder component.
 */
function convertTemplateFlow(flowConfig: any[]): FlowStep[] {
  return flowConfig.map((entry) => {
    if (entry.type === "message") {
      return {
        id: generateId(),
        type: "message" as const,
        config: { content: entry.content || "" },
      };
    }
    if (entry.type === "loop") {
      return {
        id: generateId(),
        type: "loop" as const,
        config: {
          iterations: entry.iterations || 1,
          bodySteps: convertTemplateFlow(entry.steps || []),
        },
      };
    }
    if (entry.type === "conditional") {
      return {
        id: generateId(),
        type: "conditional" as const,
        config: {
          condition: entry.condition || "",
          thenSteps: convertTemplateFlow(entry.thenSteps || []),
          elseSteps: convertTemplateFlow(entry.elseSteps || []),
        },
      };
    }
    if (entry.type === "delay") {
      return {
        id: generateId(),
        type: "delay" as const,
        config: { durationMs: entry.durationMs || 1000 },
      };
    }
    // Fallback: treat unknown as message
    return {
      id: generateId(),
      type: "message" as const,
      config: { content: String(entry.content || "") },
    };
  });
}


export default function NewScenarioPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<ScenarioTemplate | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const [flowBuilderKey, setFlowBuilderKey] = useState(0);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [targetId, setTargetId] = useState("");
  const [repetitions, setRepetitions] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [delayBetweenMs, setDelayBetweenMs] = useState(0);
  const [verbosityLevel, setVerbosityLevel] = useState("normal");
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);

  // Error handling state
  const [onError, setOnError] = useState<"skip" | "abort" | "retry">("skip");
  const [retryMaxRetries, setRetryMaxRetries] = useState(3);
  const [retryDelayMs, setRetryDelayMs] = useState(1000);
  const [retryBackoffMultiplier, setRetryBackoffMultiplier] = useState(1.5);
  const [statusCodeRules, setStatusCodeRules] = useState<StatusCodeRule[]>([]);

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    try {
      const response = await fetch("/api/targets");
      const data = await response.json();
      if (data.success) {
        setTargets(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch targets:", err);
    }
  };

  const applyTemplate = (template: ScenarioTemplate) => {
    setSelectedTemplate(template);
    setName(template.name);
    setDescription(template.description);
    setCategory(template.category);
    setRepetitions(template.repetitions);
    setConcurrency(template.concurrency);
    setDelayBetweenMs(template.delayBetweenMs);
    setVerbosityLevel(template.verbosityLevel || "normal");

    const converted = convertTemplateFlow(template.flowConfig);
    setFlowSteps(converted);
    setFlowBuilderKey((k) => k + 1);
    setShowTemplates(false);
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setName("");
    setDescription("");
    setCategory("");
    setRepetitions(1);
    setConcurrency(1);
    setDelayBetweenMs(0);
    setVerbosityLevel("normal");
    setFlowSteps([]);
    setFlowBuilderKey((k) => k + 1);
    setShowTemplates(true);
    setOnError("skip");
    setRetryMaxRetries(3);
    setRetryDelayMs(1000);
    setRetryBackoffMultiplier(1.5);
    setStatusCodeRules([]);
  };

  const buildFlowConfig = (steps: FlowStep[]): FlowStep[] => {
    return steps.map((step, index) => ({
      ...step,
      next: index < steps.length - 1 ? steps[index + 1].id : undefined,
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Scenario name is required");
      return;
    }
    if (flowSteps.length === 0) {
      setError("At least one flow step is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const errorHandling: Record<string, unknown> = {
        onError,
        retryConfig: {
          maxRetries: retryMaxRetries,
          delayMs: retryDelayMs,
          backoffMultiplier: retryBackoffMultiplier,
          maxDelayMs: 30000,
        },
        statusCodeRules: statusCodeRules.map((r) => ({
          codes: r.codes
            .split(",")
            .map((c) => parseInt(c.trim(), 10))
            .filter((c) => !isNaN(c)),
          action: r.action,
          ...(r.action === "retry"
            ? { retryConfig: { maxRetries: r.maxRetries, delayMs: r.delayMs } }
            : {}),
        })),
      };

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        flowConfig: buildFlowConfig(flowSteps),
        repetitions,
        concurrency,
        delayBetweenMs,
        verbosityLevel,
        errorHandling,
      };

      const response = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        router.push("/scenarios");
      } else if (data.details && Array.isArray(data.details)) {
        const messages = data.details
          .map((d: { path?: string[]; message?: string }) =>
            `${d.path?.join(".") || "unknown"}: ${d.message || "invalid"}`
          )
          .join("; ");
        setError(messages);
      } else {
        setError(data.error || "Failed to create scenario");
      }
    } catch (err) {
      console.error("Failed to save scenario:", err);
      setError("Failed to save scenario");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/scenarios")}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            &larr; Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">New Scenario</h1>
            <p className="text-sm text-gray-400">Design a conversation flow for testing</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/scenarios")}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save Scenario"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm mb-4 flex-shrink-0">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">
            x
          </button>
        </div>
      )}

      {/* Start from Template Section */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300">Start from Template</h2>
            {selectedTemplate && (
              <span className="text-xs text-gray-500">
                Using: <span className="text-blue-400">{selectedTemplate.name}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedTemplate && (
              <button
                onClick={clearTemplate}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Clear Template
              </button>
            )}
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              {showTemplates ? "Hide Templates" : "Show Templates"}
            </button>
          </div>
        </div>

        {showTemplates && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1">
            {SCENARIO_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => applyTemplate(template)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  selectedTemplate?.id === template.id
                    ? "bg-blue-900/20 border-blue-500/50 ring-1 ring-blue-500/30"
                    : "bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-medium text-gray-200 leading-tight">
                    {template.name}
                  </h4>
                  <span
                    className={`inline-flex items-center shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getCategoryBadgeColor(template.category)}`}
                  >
                    {formatCategoryLabel(template.category)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {template.description}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600">
                  <span>{template.flowConfig.length} steps</span>
                  <span>{template.repetitions}x reps</span>
                  <span>{template.concurrency} concurrency</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedTemplate && !showTemplates && (
          <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getCategoryBadgeColor(selectedTemplate.category)}`}
              >
                {formatCategoryLabel(selectedTemplate.category)}
              </span>
              <span className="text-sm text-gray-300">{selectedTemplate.name}</span>
              <span className="text-xs text-gray-500">{selectedTemplate.description}</span>
            </div>
            <button
              onClick={() => setShowTemplates(true)}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              Customize
            </button>
          </div>
        )}
      </div>

      {/* Metadata + Flow Builder */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Scenario metadata sidebar */}
        <div className="w-64 flex-shrink-0 bg-gray-800 rounded-lg border border-gray-700 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Scenario Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Test Scenario"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this scenario tests..."
                rows={3}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select category...</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Target</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select target...</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.connectorType})
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-3">Execution Settings</h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Repetitions</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={repetitions}
                    onChange={(e) => setRepetitions(parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Concurrency</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Delay Between Messages (ms)</label>
                  <input
                    type="number"
                    min={0}
                    max={60000}
                    step={100}
                    value={delayBetweenMs}
                    onChange={(e) => setDelayBetweenMs(parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Verbosity Level</label>
                  <select
                    value={verbosityLevel}
                    onChange={(e) => setVerbosityLevel(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {VERBOSITY_LEVELS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Error Handling */}
            <div className="border-t border-gray-700 pt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-3">Error Handling</h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">On Error</label>
                  <select
                    value={onError}
                    onChange={(e) => setOnError(e.target.value as "skip" | "abort" | "retry")}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="skip">Skip</option>
                    <option value="abort">Abort</option>
                    <option value="retry">Retry</option>
                  </select>
                </div>

                {onError === "retry" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Max Retries</label>
                      <input
                        type="number"
                        min={0}
                        value={retryMaxRetries}
                        onChange={(e) => setRetryMaxRetries(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-gray-500">0 = unlimited</span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Delay (ms)</label>
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={retryDelayMs}
                        onChange={(e) => setRetryDelayMs(parseInt(e.target.value) || 100)}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Backoff Multiplier</label>
                      <input
                        type="number"
                        min={1}
                        step={0.1}
                        value={retryBackoffMultiplier}
                        onChange={(e) => setRetryBackoffMultiplier(parseFloat(e.target.value) || 1)}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                {/* Status Code Rules */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-400">Status Code Rules</label>
                    {statusCodeRules.length < 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setStatusCodeRules([
                            ...statusCodeRules,
                            { codes: "", action: "retry", maxRetries: 3, delayMs: 1000 },
                          ])
                        }
                        className="text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        + Add Rule
                      </button>
                    )}
                  </div>

                  {statusCodeRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-900 border border-gray-700 rounded p-2 mb-2 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Rule {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setStatusCodeRules(statusCodeRules.filter((_, i) => i !== idx))
                          }
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">
                          Status Codes (comma-separated)
                        </label>
                        <input
                          value={rule.codes}
                          onChange={(e) => {
                            const updated = [...statusCodeRules];
                            updated[idx] = { ...updated[idx], codes: e.target.value };
                            setStatusCodeRules(updated);
                          }}
                          placeholder="429, 503"
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Action</label>
                        <select
                          value={rule.action}
                          onChange={(e) => {
                            const updated = [...statusCodeRules];
                            updated[idx] = {
                              ...updated[idx],
                              action: e.target.value as "skip" | "abort" | "retry",
                            };
                            setStatusCodeRules(updated);
                          }}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="skip">Skip</option>
                          <option value="abort">Abort</option>
                          <option value="retry">Retry</option>
                        </select>
                      </div>
                      {rule.action === "retry" && (
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">
                              Max Retries
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={rule.maxRetries}
                              onChange={(e) => {
                                const updated = [...statusCodeRules];
                                updated[idx] = {
                                  ...updated[idx],
                                  maxRetries: parseInt(e.target.value) || 0,
                                };
                                setStatusCodeRules(updated);
                              }}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">
                              Delay (ms)
                            </label>
                            <input
                              type="number"
                              min={100}
                              step={100}
                              value={rule.delayMs}
                              onChange={(e) => {
                                const updated = [...statusCodeRules];
                                updated[idx] = {
                                  ...updated[idx],
                                  delayMs: parseInt(e.target.value) || 100,
                                };
                                setStatusCodeRules(updated);
                              }}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flow Builder */}
        <div className="flex-1 min-w-0">
          <FlowBuilder key={flowBuilderKey} initialSteps={flowSteps} onChange={setFlowSteps} />
        </div>
      </div>
    </div>
  );
}
