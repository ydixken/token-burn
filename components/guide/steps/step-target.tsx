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
import { JsonEditor } from "../shared/json-editor";
import { TemplateHelp } from "../shared/template-help";
import { useWizard } from "../wizard-context";
import { useToast } from "@/components/ui/toast";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  AlertCircle,
  Info,
} from "lucide-react";
import { BrowserWebSocketConfig, defaultBrowserWsConfig } from "@/components/targets/browser-websocket-config";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";

type SubStep = "choose" | "configure" | "review";

const AUTH_TYPES = [
  { value: "NONE", label: "None" },
  { value: "BEARER_TOKEN", label: "Bearer Token" },
  { value: "API_KEY", label: "API Key" },
  { value: "BASIC_AUTH", label: "Basic Auth" },
  { value: "CUSTOM_HEADER", label: "Custom Headers" },
];

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
    messagePath: "messages.0.content",
    structure: {
      model: "gpt-4",
      messages: [{ role: "user", content: "{{message}}" }],
    },
  },
  responseTemplate: {
    responsePath: "choices.0.message.content",
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
  };
  structureJson: string;
  protocolConfig?: BrowserWebSocketProtocolConfig;
}

function presetToForm(preset: ProviderPreset): TargetForm {
  const authConfig: Record<string, unknown> = {};
  for (const field of preset.authFields) {
    authConfig[field.key] = "";
  }
  const isBrowserWs = preset.connectorType === "BROWSER_WEBSOCKET";
  return {
    name: preset.name === "Mock Chatbot" ? "Mock Chatbot" : `My ${preset.name}`,
    description: preset.description,
    endpoint: preset.defaultEndpoint,
    connectorType: preset.connectorType,
    authType: preset.authType,
    authConfig,
    requestTemplate: preset.requestTemplate,
    responseTemplate: preset.responseTemplate,
    structureJson: JSON.stringify(preset.requestTemplate.structure || {}, null, 2),
    protocolConfig: isBrowserWs ? defaultBrowserWsConfig() : undefined,
  };
}

const isBrowserWsPreset = (id: string | null) =>
  id === "browser-ws-auto" || id === "browser-ws-socketio";

export function StepTarget() {
  const { selectedPresetId, setSelectedPresetId, setCreatedTargetId, createdTargetId, markComplete, currentStep, goNext, setNavProps } = useWizard();
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
  const [providerPage, setProviderPage] = useState(0);
  const PROVIDERS_PER_PAGE = 4;
  const customHttp = PROVIDER_PRESETS.find((p) => p.id === "custom-http")!;
  const otherPresets = PROVIDER_PRESETS.filter((p) => p.id !== "custom-http");
  const allProviders = [MOCK_PRESET, customHttp, ...otherPresets];
  const totalProviderPages = Math.ceil(allProviders.length / PROVIDERS_PER_PAGE);
  const paginatedProviders = allProviders.slice(
    providerPage * PROVIDERS_PER_PAGE,
    (providerPage + 1) * PROVIDERS_PER_PAGE
  );

  const selectPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = id === "mock-chatbot" ? MOCK_PRESET : PROVIDER_PRESETS.find((p) => p.id === id);
    if (preset) {
      const newForm = presetToForm(preset);
      setForm(newForm);
    }
  };

  const createTarget = async () => {
    setCreating(true);
    setError(null);

    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        endpoint: form.connectorType === "BROWSER_WEBSOCKET" ? form.protocolConfig?.pageUrl || form.endpoint : form.endpoint,
        connectorType: form.connectorType,
        authType: form.authType,
        authConfig: form.authConfig,
        requestTemplate: form.requestTemplate,
        responseTemplate: form.responseTemplate,
        ...(form.protocolConfig ? { protocolConfig: form.protocolConfig } : {}),
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

  // Set nav props based on substep and state
  useEffect(() => {
    if (createdTargetId && subStep === "review") {
      setNavProps({ canProceed: true });
    } else if (subStep === "choose") {
      setNavProps({ canProceed: false });
    } else {
      setNavProps({ canProceed: false });
    }
  }, [createdTargetId, subStep, setNavProps]);

  // If target already created, show success
  if (createdTargetId && subStep === "review") {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mb-3">
            <Check className="h-6 w-6 text-emerald-400" />
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
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
          <div className="min-h-[18rem] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paginatedProviders.map((preset) =>
                preset.id === "mock-chatbot" ? (
                  <MockChatbotCard
                    key="mock-chatbot"
                    selected={selectedPresetId === "mock-chatbot"}
                    onClick={() => selectPreset("mock-chatbot")}
                  />
                ) : (
                  <ProviderCard
                    key={preset.id}
                    preset={preset}
                    selected={selectedPresetId === preset.id}
                    label={preset.id === "custom-http" ? "General Purpose" : undefined}
                    onClick={() => selectPreset(preset.id)}
                  />
                )
              )}
            </div>
            {totalProviderPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setProviderPage((p) => Math.max(0, p - 1))}
                  disabled={providerPage === 0}
                  className="px-2 py-1 text-xs rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-gray-500">
                  {providerPage + 1} / {totalProviderPages}
                </span>
                <button
                  onClick={() => setProviderPage((p) => Math.min(totalProviderPages - 1, p + 1))}
                  disabled={providerPage >= totalProviderPages - 1}
                  className="px-2 py-1 text-xs rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
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
      {subStep === "configure" && isBrowserWsPreset(selectedPresetId) && form.protocolConfig && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid gap-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Browser WebSocket Target"
            />
            <Textarea
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe this target..."
              rows={2}
            />

            {/* Browser WebSocket Config */}
            <BrowserWebSocketConfig
              config={form.protocolConfig}
              onChange={(protocolConfig) => setForm({ ...form, protocolConfig })}
            />

            {/* Help panels */}
            <BrowserWsHelpPanels />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("choose")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={() => setSubStep("review")} disabled={!form.name || !form.protocolConfig?.pageUrl}>
              Review
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {subStep === "configure" && !isBrowserWsPreset(selectedPresetId) && (
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
                <select
                  value={form.authType}
                  onChange={(e) => setForm({ ...form, authType: e.target.value, authConfig: {} })}
                  className="w-full px-3 py-2 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {AUTH_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>{at.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Auth fields */}
            {(() => {
              const preset = selectedPresetId === "mock-chatbot" ? MOCK_PRESET : PROVIDER_PRESETS.find((p) => p.id === selectedPresetId);
              const usePresetFields = preset && preset.authFields.length > 0 && form.authType === preset.authType;

              if (usePresetFields) {
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                    {preset.authFields.map((field) => (
                      <Input
                        key={field.key}
                        label={field.label}
                        type={field.type === "password" ? "password" : "text"}
                        value={String(form.authConfig[field.key] || "")}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            authConfig: { ...form.authConfig, [field.key]: e.target.value },
                          })
                        }
                        placeholder={field.placeholder}
                      />
                    ))}
                  </div>
                );
              }

              if (form.authType === "BEARER_TOKEN") {
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                    <Input
                      label="Bearer Token"
                      type="password"
                      value={String(form.authConfig.token || "")}
                      onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, token: e.target.value } })}
                      placeholder="Your API token"
                    />
                  </div>
                );
              }

              if (form.authType === "API_KEY") {
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                    <Input
                      label="API Key"
                      type="password"
                      value={String(form.authConfig.apiKey || "")}
                      onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, apiKey: e.target.value } })}
                      placeholder="Your API key"
                    />
                    <Input
                      label="Header Name"
                      value={String(form.authConfig.headerName || "")}
                      onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, headerName: e.target.value } })}
                      placeholder="e.g., x-api-key"
                    />
                  </div>
                );
              }

              if (form.authType === "BASIC_AUTH") {
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                    <Input
                      label="Username"
                      value={String(form.authConfig.username || "")}
                      onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, username: e.target.value } })}
                    />
                    <Input
                      label="Password"
                      type="password"
                      value={String(form.authConfig.password || "")}
                      onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, password: e.target.value } })}
                    />
                  </div>
                );
              }

              if (form.authType === "CUSTOM_HEADER") {
                const headers = (form.authConfig.headers || {}) as Record<string, string>;
                const entries = Object.entries(headers);
                const headerName = entries[0]?.[0] || "";
                const headerValue = entries[0]?.[1] || "";
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300">Authentication</h4>
                    <Input
                      label="Header Name"
                      value={headerName}
                      onChange={(e) => {
                        const newHeaders: Record<string, string> = {};
                        if (e.target.value) newHeaders[e.target.value] = headerValue;
                        setForm({ ...form, authConfig: { headers: newHeaders } });
                      }}
                      placeholder="e.g., X-Custom-Auth"
                    />
                    <Input
                      label="Header Value"
                      type="password"
                      value={headerValue}
                      onChange={(e) => {
                        const newHeaders: Record<string, string> = {};
                        if (headerName) newHeaders[headerName] = e.target.value;
                        setForm({ ...form, authConfig: { headers: newHeaders } });
                      }}
                      placeholder="Header value"
                    />
                  </div>
                );
              }

              return null;
            })()}

            {/* Request Template */}
            {selectedPresetId === "mock-chatbot" ? (
              <div className="space-y-3 opacity-60">
                <h4 className="text-sm font-medium text-gray-300">Request &amp; Response Templates</h4>
                <p className="text-xs text-gray-500">Pre-configured for the Mock Chatbot. These fields cannot be changed.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Message Path</label>
                    <div className="px-3 py-2 rounded-md border border-gray-700 bg-gray-800 text-xs text-gray-400 font-mono">
                      {form.requestTemplate.messagePath}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Response Path</label>
                    <div className="px-3 py-2 rounded-md border border-gray-700 bg-gray-800 text-xs text-gray-400 font-mono">
                      {form.responseTemplate.responsePath}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <>
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-300">Request Template</h4>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Message Path <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.requestTemplate.messagePath}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      requestTemplate: { ...form.requestTemplate, messagePath: e.target.value },
                    })
                  }
                  placeholder="e.g., messages.0.content"
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Request Structure (JSON)
                </label>
                <JsonEditor
                  value={form.structureJson}
                  onChange={(raw, parsed) => {
                    setForm((prev) => ({
                      ...prev,
                      structureJson: raw,
                      ...(parsed ? { requestTemplate: { ...prev.requestTemplate, structure: parsed } } : {}),
                    }));
                  }}
                  rows={6}
                  placeholder='{ "message": "{{message}}" }'
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  JSON body sent to your API. Krawall injects the message at the path above.
                </p>
              </div>
            </div>

            {/* Response Template */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-300">Response Template</h4>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Response Path <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.responseTemplate.responsePath}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      responseTemplate: { ...form.responseTemplate, responsePath: e.target.value },
                    })
                  }
                  placeholder="e.g., choices.0.message.content"
                  className="w-full bg-gray-900 border border-emerald-800/50 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Token Usage Path <span className="text-blue-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.responseTemplate.tokenUsagePath || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      responseTemplate: { ...form.responseTemplate, tokenUsagePath: e.target.value || undefined },
                    })
                  }
                  placeholder="e.g., usage"
                  className="w-full bg-gray-900 border border-blue-800/50 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Error Path
                </label>
                <input
                  type="text"
                  value={form.responseTemplate.errorPath || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      responseTemplate: { ...form.responseTemplate, errorPath: e.target.value || undefined },
                    })
                  }
                  placeholder="e.g., error.message"
                  className="w-full bg-gray-900 border border-red-800/50 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Dot-notation paths to extract values from the API response.
              </p>
            </div>
            </>
            )}

            <TemplateHelp />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSubStep("choose")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={() => setSubStep("review")} disabled={!form.name || (!isBrowserWsPreset(selectedPresetId) && (!form.endpoint || !form.responseTemplate.responsePath)) || (isBrowserWsPreset(selectedPresetId) && !form.protocolConfig?.pageUrl)}>
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

    </div>
  );
}

/** Collapsible help panels for Browser WebSocket configuration */
function BrowserWsHelpPanels() {
  const [showHow, setShowHow] = useState(false);
  const [showTips, setShowTips] = useState(false);

  return (
    <div className="space-y-2">
      {/* How Browser Discovery Works */}
      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5">
        <button
          type="button"
          onClick={() => setShowHow(!showHow)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-violet-400"
        >
          <Info className="h-3.5 w-3.5" />
          How Browser Discovery Works
          {showHow ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {showHow && (
          <div className="px-3 pb-3 text-xs text-gray-400 space-y-1.5">
            <p>1. Krawall opens the target page in a headless Chromium browser (Playwright).</p>
            <p>2. It detects the chat widget using your chosen strategy (heuristic, CSS selector, or interaction steps).</p>
            <p>3. After activating the widget, it monitors all outgoing WebSocket connections via Chrome DevTools Protocol.</p>
            <p>4. Cookies, headers, localStorage, and sessionStorage are extracted for authentication replay.</p>
            <p>5. The protocol (Socket.IO or raw WS) is auto-detected from the captured frames.</p>
            <p>6. Krawall then connects directly to the discovered WebSocket URL with the captured credentials.</p>
          </div>
        )}
      </div>

      {/* Widget Detection Tips */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5">
        <button
          type="button"
          onClick={() => setShowTips(!showTips)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-blue-400"
        >
          <Info className="h-3.5 w-3.5" />
          Widget Detection Tips
          {showTips ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {showTips && (
          <div className="px-3 pb-3 text-xs text-gray-400 space-y-2">
            <p className="font-medium text-gray-300">Common Widget Patterns:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-gray-300">Intercom</span> — Usually an iframe with src containing &quot;intercom&quot;. Use <code className="text-violet-400">iframeSrc: [&quot;intercom&quot;]</code></li>
              <li><span className="text-gray-300">Drift</span> — Look for <code className="text-violet-400">containsId: [&quot;drift-widget&quot;]</code></li>
              <li><span className="text-gray-300">Zendesk</span> — Try <code className="text-violet-400">containsClass: [&quot;zEWidget&quot;]</code> or iframe src containing &quot;zendesk&quot;</li>
              <li><span className="text-gray-300">Custom widgets</span> — Check for <code className="text-violet-400">data-*</code> attributes or unique button text</li>
            </ul>
            <p className="text-gray-500 pt-1">Tip: Open DevTools on the target page and inspect the chat button to find identifying attributes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
