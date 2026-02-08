"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  };
  protocolConfig?: Record<string, unknown>;
  isActive: boolean;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  lastTestError?: string;
}

interface TestResult {
  healthy: boolean;
  latencyMs: number;
  testResponse?: string;
  error?: string;
}

const AUTH_TYPES = [
  { value: "NONE", label: "None" },
  { value: "BEARER_TOKEN", label: "Bearer Token" },
  { value: "API_KEY", label: "API Key" },
  { value: "BASIC_AUTH", label: "Basic Auth" },
  { value: "CUSTOM_HEADER", label: "Custom Headers" },
];

const CONNECTOR_TYPES = [
  { value: "HTTP_REST", label: "HTTP REST" },
  { value: "WEBSOCKET", label: "WebSocket" },
  { value: "GRPC", label: "gRPC" },
  { value: "SSE", label: "SSE" },
  { value: "BROWSER_WEBSOCKET", label: "Browser WebSocket" },
];

export default function EditTargetPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectorType, setConnectorType] = useState("HTTP_REST");
  const [endpoint, setEndpoint] = useState("");
  const [authType, setAuthType] = useState("NONE");
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});
  const [messagePath, setMessagePath] = useState("");
  const [structureJson, setStructureJson] = useState("");
  const [responsePath, setContentPath] = useState("");
  const [tokenUsagePath, setTokenUsagePath] = useState("");
  const [errorPath, setErrorPath] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Browser WebSocket protocolConfig state
  const [widgetStrategy, setWidgetStrategy] = useState<"heuristic" | "selector" | "steps">("heuristic");
  const [widgetSelector, setWidgetSelector] = useState("");
  const [hintButtonText, setHintButtonText] = useState("");
  const [hintContainsClass, setHintContainsClass] = useState("");
  const [hintContainsId, setHintContainsId] = useState("");
  const [hintIframeSrc, setHintIframeSrc] = useState("");
  const [wsFilterPattern, setWsFilterPattern] = useState("");
  const [browserHeadless, setBrowserHeadless] = useState(true);
  const [testMessage, setTestMessage] = useState("Hello!");
  const [activeTab, setActiveTab] = useState<"connection" | "templates">("connection");

  // Streaming discovery test
  const { events: streamEvents, status: streamStatus, result: streamResult, rawResponse: streamRawResponse, startTest: startStreamTest, reset: resetStream } = useTestConnectionStream(targetId);

  // Last test info
  const [lastTestAt, setLastTestAt] = useState<string | null>(null);
  const [lastTestSuccess, setLastTestSuccess] = useState<boolean | null>(null);
  const [lastTestError, setLastTestError] = useState<string | null>(null);

  useEffect(() => {
    fetchTarget();
  }, [targetId]);

  const fetchTarget = async () => {
    try {
      const response = await fetch(`/api/targets/${targetId}`);
      const result = await response.json();

      if (result.success) {
        const t: TargetData = result.data;
        setName(t.name);
        setDescription(t.description || "");
        setConnectorType(t.connectorType);
        setEndpoint(t.endpoint);
        setAuthType(t.authType);
        setAuthConfig(
          typeof t.authConfig === "object" && t.authConfig !== null
            ? Object.fromEntries(
                Object.entries(t.authConfig).map(([k, v]) => [k, String(v)])
              )
            : {}
        );
        setMessagePath(t.requestTemplate?.messagePath || "");
        setStructureJson(
          t.requestTemplate?.structure
            ? JSON.stringify(t.requestTemplate.structure, null, 2)
            : "{}"
        );
        setContentPath(t.responseTemplate?.responsePath || "");
        setTokenUsagePath(t.responseTemplate?.tokenUsagePath || "");
        setErrorPath(t.responseTemplate?.errorPath || "");
        setIsActive(t.isActive);

        // Load protocolConfig for Browser WebSocket
        if (t.protocolConfig && typeof t.protocolConfig === "object") {
          const pc = t.protocolConfig as Record<string, any>;
          // For BROWSER_WEBSOCKET, pageUrl is the endpoint
          if (pc.pageUrl && t.connectorType === "BROWSER_WEBSOCKET") {
            setEndpoint(pc.pageUrl);
          }
          if (pc.widgetDetection) {
            setWidgetStrategy(pc.widgetDetection.strategy || "heuristic");
            setWidgetSelector(pc.widgetDetection.selector || "");
            if (pc.widgetDetection.hints) {
              setHintButtonText((pc.widgetDetection.hints.buttonText || []).join(", "));
              setHintContainsClass((pc.widgetDetection.hints.containsClass || []).join(", "));
              setHintContainsId((pc.widgetDetection.hints.containsId || []).join(", "));
              setHintIframeSrc((pc.widgetDetection.hints.iframeSrc || []).join(", "));
            }
          }
          if (pc.wsFilter) {
            setWsFilterPattern(pc.wsFilter.urlPattern || "");
          }
          if (pc.browser) {
            setBrowserHeadless(pc.browser.headless !== false);
          }
        }

        setLastTestAt(t.lastTestAt || null);
        setLastTestSuccess(t.lastTestSuccess ?? null);
        setLastTestError(t.lastTestError || null);
      } else {
        setError(result.error || "Failed to fetch target");
      }
    } catch {
      setError("Failed to fetch target");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    let structure: Record<string, unknown> = {};
    try {
      structure = JSON.parse(structureJson);
    } catch {
      setSaveError("Invalid JSON in request structure");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/targets/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          connectorType,
          endpoint,
          authType,
          authConfig,
          requestTemplate: {
            messagePath,
            structure,
          },
          responseTemplate: {
            responsePath,
            tokenUsagePath: tokenUsagePath || undefined,
            errorPath: errorPath || undefined,
          },
          ...(connectorType === "BROWSER_WEBSOCKET" ? {
            protocolConfig: {
              pageUrl: endpoint,
              widgetDetection: {
                strategy: widgetStrategy,
                ...(widgetStrategy === "selector" && widgetSelector ? { selector: widgetSelector } : {}),
                hints: {
                  ...(hintButtonText ? { buttonText: hintButtonText.split(",").map(s => s.trim()).filter(Boolean) } : {}),
                  ...(hintContainsClass ? { containsClass: hintContainsClass.split(",").map(s => s.trim()).filter(Boolean) } : {}),
                  ...(hintContainsId ? { containsId: hintContainsId.split(",").map(s => s.trim()).filter(Boolean) } : {}),
                  ...(hintIframeSrc ? { iframeSrc: hintIframeSrc.split(",").map(s => s.trim()).filter(Boolean) } : {}),
                },
              },
              ...(wsFilterPattern ? { wsFilter: { urlPattern: wsFilterPattern } } : {}),
              browser: { headless: browserHeadless },
            },
          } : {}),
          isActive,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(result.error || "Failed to save");
      }
    } catch {
      setSaveError("Failed to save target");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/targets/${targetId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMessage }),
      });

      const result = await response.json();
      if (result.success) {
        setTestResult(result.data);
      } else {
        setTestResult({ healthy: false, latencyMs: 0, error: result.error });
      }
    } catch {
      setTestResult({ healthy: false, latencyMs: 0, error: "Failed to reach test endpoint" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading target...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
          <p className="text-red-300">{error}</p>
        </div>
        <Link href="/targets" className="inline-block px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
          Back to Targets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Link href="/targets" className="text-gray-400 hover:text-white text-sm">
            Targets
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-white text-sm">{name}</span>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400 text-sm">Edit</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
            />
            Active
          </label>
          <Link
            href="/targets"
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || saveSuccess || !name.trim() || !endpoint.trim()}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              saveSuccess
                ? "bg-green-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white"
            }`}
          >
            {saving ? "Saving..." : saveSuccess ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm flex items-center justify-between mb-3 flex-shrink-0">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-300 ml-4">
            &times;
          </button>
        </div>
      )}

      {/* Full-width tab bar */}
      <div className="flex border-b border-gray-700 flex-shrink-0">
        <button
          onClick={() => setActiveTab("connection")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 relative ${
            activeTab === "connection" ? "text-blue-400" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Connection
          {activeTab === "connection" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 relative ${
            activeTab === "templates" ? "text-blue-400" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Templates
          {activeTab === "templates" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          )}
        </button>
      </div>

      {/* Two-column content below tabs */}
      <div className="flex gap-4 flex-1 min-h-0 pt-4">
        {/* Left column — tab content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === "connection" && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
              {/* Name + Description side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Connector Type + Auth Type side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Connector Type</label>
                  <select
                    value={connectorType}
                    onChange={(e) => setConnectorType(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {CONNECTOR_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Auth Type</label>
                  <select
                    value={authType}
                    onChange={(e) => {
                      setAuthType(e.target.value);
                      setAuthConfig({});
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {AUTH_TYPES.map((at) => (
                      <option key={at.value} value={at.value}>{at.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Endpoint URL full width */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {connectorType === "BROWSER_WEBSOCKET" ? "Page URL" : "Endpoint URL"}
                </label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder={connectorType === "BROWSER_WEBSOCKET" ? "https://example.com/support" : "https://api.example.com/chat"}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {connectorType === "BROWSER_WEBSOCKET" && (
                  <p className="text-xs text-gray-500 mt-1">The web page containing the chat widget (WebSocket URL is discovered automatically)</p>
                )}
              </div>

              {/* Auth fields */}
              {authType === "BEARER_TOKEN" && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Bearer Token</label>
                  <input
                    type="password"
                    value={authConfig.token || ""}
                    onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })}
                    placeholder="Leave blank to keep existing"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {authType === "API_KEY" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                    <input
                      type="password"
                      value={authConfig.apiKey || ""}
                      onChange={(e) => setAuthConfig({ ...authConfig, apiKey: e.target.value })}
                      placeholder="Leave blank to keep existing"
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Header Name</label>
                    <input
                      type="text"
                      value={authConfig.headerName || ""}
                      onChange={(e) => setAuthConfig({ ...authConfig, headerName: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {authType === "BASIC_AUTH" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                    <input
                      type="text"
                      value={authConfig.username || ""}
                      onChange={(e) => setAuthConfig({ ...authConfig, username: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={authConfig.password || ""}
                      onChange={(e) => setAuthConfig({ ...authConfig, password: e.target.value })}
                      placeholder="Leave blank to keep existing"
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Browser Discovery section (BROWSER_WEBSOCKET only) */}
              {connectorType === "BROWSER_WEBSOCKET" && (
                <div className="border border-gray-700 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-300">Browser Discovery</h4>
                  <p className="text-xs text-gray-500">Configure how the browser discovers the chat widget.</p>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Widget Detection Strategy</label>
                    <select
                      value={widgetStrategy}
                      onChange={(e) => setWidgetStrategy(e.target.value as "heuristic" | "selector" | "steps")}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="heuristic">Heuristic (auto-detect using hints)</option>
                      <option value="selector">Selector (direct CSS selector)</option>
                      <option value="steps">Steps (scripted interaction)</option>
                    </select>
                  </div>

                  {widgetStrategy === "selector" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">CSS Selector</label>
                      <input
                        type="text"
                        value={widgetSelector}
                        onChange={(e) => setWidgetSelector(e.target.value)}
                        placeholder='button[data-chat], .chat-launcher, #chat-button'
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">CSS selector for the chat widget trigger element</p>
                    </div>
                  )}

                  {widgetStrategy === "heuristic" && (
                    <div className="border border-gray-700 rounded-lg p-3 space-y-3">
                      <h4 className="text-xs font-medium text-gray-400">Detection Hints</h4>
                      <p className="text-xs text-gray-500">Optional hints. Separate multiple values with commas.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Button Text</label>
                          <input
                            type="text"
                            value={hintButtonText}
                            onChange={(e) => setHintButtonText(e.target.value)}
                            placeholder='"Jetzt chatten", "Start Chat"'
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">CSS Class Fragments</label>
                          <input
                            type="text"
                            value={hintContainsClass}
                            onChange={(e) => setHintContainsClass(e.target.value)}
                            placeholder='"chat-widget", "launcher-button"'
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">ID Fragments</label>
                          <input
                            type="text"
                            value={hintContainsId}
                            onChange={(e) => setHintContainsId(e.target.value)}
                            placeholder='"chat-button", "widget"'
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Iframe Src Fragments</label>
                          <input
                            type="text"
                            value={hintIframeSrc}
                            onChange={(e) => setHintIframeSrc(e.target.value)}
                            placeholder='"intercom", "drift", "zendesk"'
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border border-gray-700 rounded-lg p-3 space-y-3">
                    <h4 className="text-xs font-medium text-gray-400">Advanced</h4>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">WebSocket URL Filter (regex)</label>
                      <input
                        type="text"
                        value={wsFilterPattern}
                        onChange={(e) => setWsFilterPattern(e.target.value)}
                        placeholder="Optional — filter captured WS connections by URL pattern"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={browserHeadless}
                        onChange={(e) => setBrowserHeadless(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                      />
                      Headless browser (uncheck to see the browser window for debugging)
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "templates" && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
              {/* Request Template */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-300">Request Template</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Message Path</label>
                  <input
                    type="text"
                    value={messagePath}
                    onChange={(e) => setMessagePath(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Structure (JSON)</label>
                  <textarea
                    value={structureJson}
                    onChange={(e) => setStructureJson(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Response Template */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-300">Response Template</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Content Path <span className="text-green-400">(content)</span>
                  </label>
                  <input
                    type="text"
                    value={responsePath}
                    onChange={(e) => setContentPath(e.target.value)}
                    className="w-full bg-gray-900 border border-green-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Token Usage Path <span className="text-blue-400">(tokens)</span>
                    </label>
                    <input
                      type="text"
                      value={tokenUsagePath}
                      onChange={(e) => setTokenUsagePath(e.target.value)}
                      placeholder="Optional"
                      className="w-full bg-gray-900 border border-blue-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Error Path <span className="text-red-400">(errors)</span>
                    </label>
                    <input
                      type="text"
                      value={errorPath}
                      onChange={(e) => setErrorPath(e.target.value)}
                      placeholder="Optional"
                      className="w-full bg-gray-900 border border-red-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Discovery Log + Test Connection stacked */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto">
          {/* Discovery Log - Browser WebSocket only */}
          {connectorType === "BROWSER_WEBSOCKET" && (
            <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${streamStatus !== "idle" || streamEvents.length > 0 ? "flex flex-col" : ""}`}>
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <h3 className="text-sm font-semibold text-white">Discovery Log</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startStreamTest()}
                    disabled={streamStatus === "streaming"}
                    className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    {streamStatus === "streaming" ? "Running..." : "Run Discovery"}
                  </button>
                  <button
                    onClick={() => startStreamTest({ fresh: true })}
                    disabled={streamStatus === "streaming"}
                    className="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
              {(streamStatus !== "idle" || streamEvents.length > 0) && (
                <div className="max-h-[300px] overflow-y-auto">
                  <DiscoveryProgressTimeline events={streamEvents} status={streamStatus} />
                </div>
              )}
              {streamResult && (
                <div className={`mt-2 rounded border p-2 text-xs ${streamResult.success ? "bg-green-900/20 border-green-800" : "bg-red-900/20 border-red-800"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${streamResult.success ? "bg-green-400" : "bg-red-400"}`} />
                    <span className={streamResult.success ? "text-green-300" : "text-red-300"}>
                      {streamResult.success ? "Success" : "Failed"}
                    </span>
                    <span className="text-gray-400 ml-auto">{Math.round(streamResult.data.latencyMs)}ms</span>
                  </div>
                  {streamResult.data.error && <div className="text-red-400 text-xs mt-1">{streamResult.data.error}</div>}
                </div>
              )}
              {streamRawResponse && (
                <div className="mt-2">
                  <RawResponseViewer
                    rawResponse={streamRawResponse.data}
                    extractedContent={streamRawResponse.extractedContent}
                    currentResponsePath={responsePath}
                    onSelectPath={(path) => setContentPath(path)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Test Connection */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Test Connection</h3>
              {lastTestAt && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${lastTestSuccess ? "bg-green-400" : "bg-red-400"}`} />
                  <span className={lastTestSuccess ? "text-green-400" : "text-red-400"}>
                    {lastTestSuccess ? "Passed" : "Failed"}
                  </span>
                  <span className="text-gray-500">{new Date(lastTestAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {lastTestError && (
              <div className="text-red-400 text-xs mb-2 truncate" title={lastTestError}>{lastTestError}</div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Test Message</label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-medium transition-colors whitespace-nowrap"
              >
                {testing ? "Testing..." : "Send Test"}
              </button>
            </div>
            {testResult && (
              <div className={`mt-3 rounded border p-2 text-xs ${testResult.healthy ? "bg-green-900/20 border-green-800" : "bg-red-900/20 border-red-800"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${testResult.healthy ? "bg-green-400" : "bg-red-400"}`} />
                  <span className={testResult.healthy ? "text-green-300" : "text-red-300"}>
                    {testResult.healthy ? "Connected" : "Failed"}
                  </span>
                  <span className="text-gray-400 ml-auto">{Math.round(testResult.latencyMs)}ms</span>
                </div>
                {testResult.testResponse && (
                  <div className="mt-2">
                    <div className="text-gray-500 mb-1">Response:</div>
                    <div className="text-gray-300 bg-gray-900 rounded p-2 whitespace-pre-wrap max-h-24 overflow-y-auto">{testResult.testResponse}</div>
                  </div>
                )}
                {testResult.error && <div className="text-red-400 mt-1">{testResult.error}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
