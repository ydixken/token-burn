"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
    contentPath: string;
    tokenUsagePath?: string;
    errorPath?: string;
  };
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
  const [contentPath, setContentPath] = useState("");
  const [tokenUsagePath, setTokenUsagePath] = useState("");
  const [errorPath, setErrorPath] = useState("");
  const [isActive, setIsActive] = useState(true);

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
        setContentPath(t.responseTemplate?.contentPath || "");
        setTokenUsagePath(t.responseTemplate?.tokenUsagePath || "");
        setErrorPath(t.responseTemplate?.errorPath || "");
        setIsActive(t.isActive);
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
            contentPath,
            tokenUsagePath: tokenUsagePath || undefined,
            errorPath: errorPath || undefined,
          },
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
        body: JSON.stringify({ testMessage: "Hello, this is a connection test." }),
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/targets" className="text-gray-400 hover:text-white text-sm">
              Targets
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white text-sm">{name}</span>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400 text-sm">Edit</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Edit Target</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
            />
            Active
          </label>
        </div>
      </div>

      {/* Last Test Result */}
      {lastTestAt && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            lastTestSuccess
              ? "bg-green-900/20 border-green-800"
              : "bg-red-900/20 border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${lastTestSuccess ? "bg-green-400" : "bg-red-400"}`} />
            <span className={lastTestSuccess ? "text-green-300" : "text-red-300"}>
              Last test: {lastTestSuccess ? "Success" : "Failed"}
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              {new Date(lastTestAt).toLocaleString()}
            </span>
          </div>
          {lastTestError && (
            <div className="text-xs text-red-400 mt-1">{lastTestError}</div>
          )}
        </div>
      )}

      {/* Connection Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white">Connection</h3>

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

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Endpoint URL</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
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
      </div>

      {/* Request Template */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white">Request Template</h3>

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
            rows={6}
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Response Template */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white">Response Template</h3>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Content Path <span className="text-green-400">(content)</span>
          </label>
          <input
            type="text"
            value={contentPath}
            onChange={(e) => setContentPath(e.target.value)}
            className="w-full bg-gray-900 border border-green-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

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

      {/* Test Connection */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3">Test Connection</h3>
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {testing ? "Testing..." : "Send Test Message"}
        </button>

        {testResult && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              testResult.healthy
                ? "bg-green-900/20 border-green-800"
                : "bg-red-900/20 border-red-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${testResult.healthy ? "bg-green-400" : "bg-red-400"}`} />
              <span className={testResult.healthy ? "text-green-300" : "text-red-300"}>
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
      </div>

      {/* Actions */}
      {saveError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 text-green-300 text-sm">
          Target saved successfully.
        </div>
      )}

      <div className="flex justify-between">
        <Link
          href="/targets"
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !endpoint.trim()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
