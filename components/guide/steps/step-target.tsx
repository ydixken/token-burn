"use client";

import { useState, useEffect } from "react";
import { PROVIDER_PRESETS } from "@/lib/connectors/presets";
import type { ProviderPreset } from "@/lib/connectors/presets";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderCard, MockChatbotCard } from "../shared/provider-card";
import { JsonPreview } from "../shared/json-preview";
import { StepNavigation } from "../shared/step-navigation";
import { useWizard } from "../wizard-context";
import { useToast } from "@/components/ui/toast";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";

type SubStep = "choose" | "configure" | "review";

// Mock chatbot as a pseudo-preset
const MOCK_PRESET: ProviderPreset = {
  id: "mock-chatbot",
  name: "Mock Chatbot",
  description: "Built-in mock server mimicking an OpenAI-compatible API. No API key needed.",
  icon: "mock",
  connectorType: "HTTP_REST",
  defaultEndpoint: "http://localhost:3001/v1/chat/completions",
  authType: "NONE",
  authFields: [],
  requestTemplate: {
    messagePath: "messages[-1].content",
    structure: {
      model: "gpt-4",
      messages: [{ role: "user", content: "{{message}}" }],
    },
  },
  responseTemplate: {
    contentPath: "choices[0].message.content",
  },
  documentation: "",
  exampleResponse: {},
};

interface TargetForm {
  name: string;
  description: string;
  endpoint: string;
  connectorType: string;
  authType: string;
  authConfig: Record<string, string>;
  requestTemplate: any;
  responseTemplate: any;
}

function presetToForm(preset: ProviderPreset): TargetForm {
  const authConfig: Record<string, string> = {};
  for (const field of preset.authFields) {
    authConfig[field.key] = "";
  }
  return {
    name: preset.name === "Mock Chatbot" ? "Mock Chatbot" : `My ${preset.name}`,
    description: preset.description,
    endpoint: preset.defaultEndpoint,
    connectorType: preset.connectorType,
    authType: preset.authType,
    authConfig,
    requestTemplate: preset.requestTemplate,
    responseTemplate: preset.responseTemplate,
  };
}

export function StepTarget() {
  const { selectedPresetId, setSelectedPresetId, setCreatedTargetId, createdTargetId, markComplete, currentStep, goNext } = useWizard();
  const { toast } = useToast();
  const [subStep, setSubStep] = useState<SubStep>(createdTargetId ? "review" : "choose");
  const [form, setForm] = useState<TargetForm>(() => {
    if (selectedPresetId === "mock-chatbot") return presetToForm(MOCK_PRESET);
    const preset = PROVIDER_PRESETS.find((p) => p.id === selectedPresetId);
    if (preset) return presetToForm(preset);
    return presetToForm(MOCK_PRESET);
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = id === "mock-chatbot" ? MOCK_PRESET : PROVIDER_PRESETS.find((p) => p.id === id);
    if (preset) {
      setForm(presetToForm(preset));
    }
  };

  const createTarget = async () => {
    setCreating(true);
    setError(null);

    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        endpoint: form.endpoint,
        connectorType: form.connectorType,
        authType: form.authType,
        authConfig: form.authConfig,
        requestTemplate: form.requestTemplate,
        responseTemplate: form.responseTemplate,
      };

      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setCreatedTargetId(data.data.id);
        markComplete(currentStep);
        toast({ type: "success", message: `Target "${data.data.name}" created` });
        setTimeout(() => goNext(), 800);
      } else {
        setError(data.error || data.message || "Failed to create target");
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

  // If target already created, show success
  if (createdTargetId && subStep === "review") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mb-4">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Target Created</h2>
          <p className="text-sm text-gray-500">ID: {createdTargetId}</p>
          <p className="text-xs text-gray-600 mt-2">
            You can create a new target or proceed to test the connection.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setSubStep("choose"); }}>
            Create Another
          </Button>
        </div>
        <StepNavigation canProceed />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Sub-step header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Create Target</h2>
        <p className="text-sm text-gray-500">
          {subStep === "choose" && "Choose a provider or set up a custom endpoint."}
          {subStep === "configure" && "Configure the target settings."}
          {subStep === "review" && "Review and create your target."}
        </p>
        {/* Sub-step indicators */}
        <div className="flex items-center gap-2 mt-3">
          {(["choose", "configure", "review"] as SubStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => s !== "review" && setSubStep(s)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                  subStep === s
                    ? "text-blue-400 bg-blue-500/10"
                    : "text-gray-500 hover:text-gray-400"
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

      {/* Sub-step: Choose Provider */}
      {subStep === "choose" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MockChatbotCard
              selected={selectedPresetId === "mock-chatbot"}
              onClick={() => selectPreset("mock-chatbot")}
            />
            {PROVIDER_PRESETS.map((preset) => (
              <ProviderCard
                key={preset.id}
                preset={preset}
                selected={selectedPresetId === preset.id}
                onClick={() => selectPreset(preset.id)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!selectedPresetId}
              onClick={() => setSubStep("configure")}
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Sub-step: Configure */}
      {subStep === "configure" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid gap-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Chatbot Target"
            />
            <Textarea
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe this target..."
              rows={2}
            />
            <Input
              label="Endpoint URL"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="https://api.example.com/v1/chat"
            />
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Connector Type</label>
                <div className="px-3 py-2 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-400">
                  {form.connectorType}
                </div>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Auth Type</label>
                <div className="px-3 py-2 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-400">
                  {form.authType === "NONE" ? "None" : form.authType.replace(/_/g, " ")}
                </div>
              </div>
            </div>

            {/* Auth fields */}
            {Object.keys(form.authConfig).length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                {(() => {
                  const preset = selectedPresetId === "mock-chatbot" ? MOCK_PRESET : PROVIDER_PRESETS.find((p) => p.id === selectedPresetId);
                  return preset?.authFields.map((field) => (
                    <Input
                      key={field.key}
                      label={field.label}
                      type={field.type === "password" ? "password" : "text"}
                      value={form.authConfig[field.key] || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          authConfig: { ...form.authConfig, [field.key]: e.target.value },
                        })
                      }
                      placeholder={field.placeholder}
                    />
                  ));
                })()}
              </div>
            )}

            {/* Request/Response template previews */}
            <JsonPreview data={form.requestTemplate} title="Request Template" />
            <JsonPreview data={form.responseTemplate} title="Response Template" />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("choose")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={() => setSubStep("review")} disabled={!form.name || !form.endpoint}>
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
            <h3 className="text-sm font-medium text-gray-300 mb-3">Target Configuration</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-200 font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Endpoint</span>
                <span className="text-gray-200 font-mono truncate max-w-xs">{form.endpoint}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Connector</span>
                <Badge variant="neutral" size="sm">{form.connectorType}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Auth</span>
                <Badge variant="neutral" size="sm">{form.authType === "NONE" ? "None" : form.authType}</Badge>
              </div>
            </div>
          </Card>

          <JsonPreview
            data={{
              name: form.name,
              endpoint: form.endpoint,
              connectorType: form.connectorType,
              authType: form.authType,
              authConfig: form.authConfig,
              requestTemplate: form.requestTemplate,
              responseTemplate: form.responseTemplate,
            }}
            title="Full Payload Preview"
            maskKeys={["token", "apiKey", "password"]}
          />

          {error && (
            <div className="animate-slideDown rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Failed to create target</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {error === "Network error" || error === "Failed to fetch"
                      ? "Can't reach the server. Is the dev server running?"
                      : error}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-2 pl-6">
                <Button variant="ghost" size="sm" onClick={createTarget}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("configure")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button onClick={createTarget} loading={creating}>
              Create Target
            </Button>
          </div>
        </div>
      )}

      {subStep === "choose" && <StepNavigation canProceed={false} />}
    </div>
  );
}
