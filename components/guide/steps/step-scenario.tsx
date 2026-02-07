"use client";

import { useState } from "react";
import { SCENARIO_TEMPLATES, type ScenarioTemplate } from "@/lib/scenarios/templates";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TemplateCard } from "../shared/template-card";
import { JsonPreview } from "../shared/json-preview";
import { StepNavigation } from "../shared/step-navigation";
import { useWizard } from "../wizard-context";
import { useToast } from "@/components/ui/toast";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";

type SubStep = "choose" | "customize" | "review";

const CATEGORIES = ["All", ...new Set(SCENARIO_TEMPLATES.map((t) => t.category))];
const CATEGORY_LABELS: Record<string, string> = {
  All: "All",
  STRESS_TEST: "Stress Test",
  EDGE_CASE: "Edge Case",
  CONTEXT: "Context",
  PERFORMANCE: "Performance",
  LOGIC: "Logic",
  TOKEN_BURN: "Token Burn",
  ATTACK_SURFACE: "Attack Surface",
};

// Quick Start template built into the guide
const QUICK_START: ScenarioTemplate = {
  id: "quick-start",
  name: "Quick Smoke Test",
  description: "A simple 3-message scenario to verify your chatbot responds correctly. Recommended for first-time setup.",
  category: "QUICK_START",
  flowConfig: [
    { type: "message", content: "Hello! Can you introduce yourself?" },
    { type: "message", content: "What is the capital of France?" },
    { type: "message", content: "Thank you for your help!" },
  ],
  verbosityLevel: "normal",
  repetitions: 1,
  concurrency: 1,
  delayBetweenMs: 500,
  messageTemplates: {},
};

interface ScenarioForm {
  name: string;
  description: string;
  flowConfig: any[];
  repetitions: number;
  concurrency: number;
  delayBetweenMs: number;
  messageTemplates: Record<string, string>;
  verbosityLevel: string;
}

function templateToForm(template: ScenarioTemplate): ScenarioForm {
  return {
    name: template.name,
    description: template.description,
    flowConfig: template.flowConfig,
    repetitions: template.repetitions,
    concurrency: template.concurrency,
    delayBetweenMs: template.delayBetweenMs,
    messageTemplates: template.messageTemplates,
    verbosityLevel: template.verbosityLevel,
  };
}

function addIdsToFlow(flowConfig: any[]): any[] {
  return flowConfig.map((step, i) => {
    const id = step.id || `step-${i + 1}`;
    const type = step.type;
    const config: Record<string, unknown> = {};

    if (type === "message") {
      config.content = step.content || step.config?.content || "";
    } else if (type === "delay") {
      config.durationMs = step.durationMs || step.config?.durationMs || 1000;
    } else if (type === "loop") {
      config.iterations = step.iterations || step.config?.iterations || 1;
      config.steps = addIdsToFlow(step.steps || step.config?.steps || []);
    } else if (type === "conditional") {
      config.condition = step.condition || step.config?.condition || "";
      config.thenSteps = addIdsToFlow(step.thenSteps || step.config?.thenSteps || []);
      config.elseSteps = addIdsToFlow(step.elseSteps || step.config?.elseSteps || []);
    }

    return { id, type, config };
  });
}

export function StepScenario() {
  const {
    selectedTemplateId,
    setSelectedTemplateId,
    setCreatedScenarioId,
    createdScenarioId,
    markComplete,
    currentStep,
    goNext,
  } = useWizard();
  const { toast } = useToast();
  const [subStep, setSubStep] = useState<SubStep>(createdScenarioId ? "review" : "choose");
  const [activeCategory, setActiveCategory] = useState("All");
  const [form, setForm] = useState<ScenarioForm>(() => {
    if (selectedTemplateId === "quick-start") return templateToForm(QUICK_START);
    const tmpl = SCENARIO_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (tmpl) return templateToForm(tmpl);
    return templateToForm(QUICK_START);
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Custom scratch messages
  const [scratchMode, setScratchMode] = useState(false);
  const [scratchMessages, setScratchMessages] = useState<string[]>(["", "", ""]);

  const selectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setScratchMode(false);
    const tmpl = id === "quick-start" ? QUICK_START : SCENARIO_TEMPLATES.find((t) => t.id === id);
    if (tmpl) setForm(templateToForm(tmpl));
  };

  const filteredTemplates = activeCategory === "All"
    ? SCENARIO_TEMPLATES
    : SCENARIO_TEMPLATES.filter((t) => t.category === activeCategory);

  const createScenario = async () => {
    setCreating(true);
    setError(null);

    try {
      let flowConfig: any[];
      if (scratchMode) {
        flowConfig = addIdsToFlow(
          scratchMessages.filter(Boolean).map((msg) => ({ type: "message", content: msg }))
        );
      } else {
        flowConfig = addIdsToFlow(form.flowConfig);
      }

      const payload = {
        name: form.name,
        description: form.description || undefined,
        category: "guide",
        flowConfig,
        repetitions: form.repetitions,
        concurrency: form.concurrency,
        delayBetweenMs: form.delayBetweenMs,
        verbosityLevel: form.verbosityLevel,
        messageTemplates: form.messageTemplates,
      };

      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setCreatedScenarioId(data.data.id);
        markComplete(currentStep);
        toast({ type: "success", message: `Scenario "${data.data.name}" created` });
        setTimeout(() => goNext(), 800);
      } else {
        setError(data.error || data.message || "Failed to create scenario");
        if (data.details) {
          const fieldErrors = data.details.map((d: any) => `${d.path?.join(".")}: ${d.message}`).join("; ");
          setError(fieldErrors);
        }
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  // If scenario already created
  if (createdScenarioId && subStep === "review") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mb-4">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Scenario Created</h2>
          <p className="text-sm text-gray-500">ID: {createdScenarioId}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSubStep("choose")}>
            Create Another
          </Button>
        </div>
        <StepNavigation canProceed />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Create Scenario</h2>
        <p className="text-sm text-gray-500">
          {subStep === "choose" && "Pick a template or build from scratch."}
          {subStep === "customize" && "Customize the scenario settings."}
          {subStep === "review" && "Review and create your scenario."}
        </p>
        <div className="flex items-center gap-2 mt-3">
          {(["choose", "customize", "review"] as SubStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => s !== "review" && setSubStep(s)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                  subStep === s ? "text-blue-400 bg-blue-500/10" : "text-gray-500 hover:text-gray-400"
                }`}
              >
                <span className="font-mono">{i + 1}</span>
                <span className="capitalize">{s}</span>
              </button>
              {i < 2 && <ChevronRight className="h-3 w-3 text-gray-700" />}
            </div>
          ))}
        </div>
      </div>

      {/* Sub-step: Choose */}
      {subStep === "choose" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Quick Start */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2">Recommended</div>
            <TemplateCard
              template={QUICK_START}
              selected={selectedTemplateId === "quick-start"}
              onClick={() => selectTemplate("quick-start")}
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-full transition-colors ${
                  activeCategory === cat
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-gray-500 hover:text-gray-400"
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>

          {/* Template grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTemplates.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                selected={selectedTemplateId === tmpl.id}
                onClick={() => selectTemplate(tmpl.id)}
              />
            ))}
          </div>

          {/* Create from scratch */}
          <button
            onClick={() => {
              setScratchMode(true);
              setSelectedTemplateId(null);
              setForm({ ...form, name: "Custom Scenario", description: "A custom scenario" });
              setSubStep("customize");
            }}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create from Scratch
          </button>

          <div className="flex justify-end">
            <Button size="sm" disabled={!selectedTemplateId} onClick={() => setSubStep("customize")}>
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Sub-step: Customize */}
      {subStep === "customize" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid gap-4">
            <Input
              label="Scenario Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />

            {/* Scratch mode: editable messages */}
            {scratchMode && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Messages</label>
                {scratchMessages.map((msg, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-400 shrink-0 mt-2.5" />
                    <Input
                      value={msg}
                      onChange={(e) => {
                        const next = [...scratchMessages];
                        next[i] = e.target.value;
                        setScratchMessages(next);
                      }}
                      placeholder={`Message ${i + 1}...`}
                    />
                    {scratchMessages.length > 1 && (
                      <button
                        onClick={() => setScratchMessages(scratchMessages.filter((_, j) => j !== i))}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setScratchMessages([...scratchMessages, ""])}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors pl-6"
                >
                  <Plus className="h-3 w-3" />
                  Add message
                </button>
              </div>
            )}

            {/* Template flow preview (non-scratch) */}
            {!scratchMode && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Flow Steps</label>
                <div className="rounded-lg border border-gray-800 p-3 space-y-2 max-h-60 overflow-y-auto">
                  {form.flowConfig.map((step: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {step.type === "message" ? (
                        <>
                          <MessageSquare className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                          <span className="text-gray-400">{step.content?.slice(0, 100) || "..."}</span>
                        </>
                      ) : (
                        <>
                          <Badge variant="neutral" size="sm">{step.type}</Badge>
                          <span className="text-gray-500">
                            {step.type === "loop" ? `${step.iterations || 1}x` : ""}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Advanced settings toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors text-left"
            >
              {showAdvanced ? "Hide" : "Show"} advanced settings
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-3 gap-3 animate-fadeIn">
                <Input
                  label="Repetitions"
                  type="number"
                  min={1}
                  max={100}
                  value={form.repetitions}
                  onChange={(e) => setForm({ ...form, repetitions: parseInt(e.target.value) || 1 })}
                />
                <Input
                  label="Concurrency"
                  type="number"
                  min={1}
                  max={10}
                  value={form.concurrency}
                  onChange={(e) => setForm({ ...form, concurrency: parseInt(e.target.value) || 1 })}
                />
                <Input
                  label="Delay (ms)"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.delayBetweenMs}
                  onChange={(e) => setForm({ ...form, delayBetweenMs: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("choose")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={() => setSubStep("review")} disabled={!form.name}>
              Review
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Sub-step: Review & Create */}
      {subStep === "review" && (
        <div className="space-y-4 animate-fadeIn">
          <Card className="!p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Scenario Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-200 font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Steps</span>
                <span className="text-gray-200">{scratchMode ? scratchMessages.filter(Boolean).length : form.flowConfig.length} steps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Repetitions</span>
                <span className="text-gray-200">{form.repetitions}x</span>
              </div>
            </div>
          </Card>

          <JsonPreview
            data={{
              name: form.name,
              flowConfig: scratchMode
                ? addIdsToFlow(scratchMessages.filter(Boolean).map((msg) => ({ type: "message", content: msg })))
                : addIdsToFlow(form.flowConfig),
              repetitions: form.repetitions,
              concurrency: form.concurrency,
              delayBetweenMs: form.delayBetweenMs,
            }}
            title="Full Payload Preview"
          />

          {error && (
            <div className="animate-slideDown rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Failed to create scenario</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {error === "Network error" || error === "Failed to fetch"
                      ? "Can't reach the server. Is the dev server running?"
                      : error}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-2 pl-6">
                <Button variant="ghost" size="sm" onClick={createScenario}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("customize")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button onClick={createScenario} loading={creating}>
              Create Scenario
            </Button>
          </div>
        </div>
      )}

      {subStep === "choose" && <StepNavigation canProceed={false} />}
    </div>
  );
}
