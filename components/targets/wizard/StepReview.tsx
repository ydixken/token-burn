"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WizardData } from "./types";

interface StepReviewProps {
  data: WizardData;
  onBack: () => void;
}

interface TestResult {
  healthy: boolean;
  latencyMs: number;
  testResponse?: string;
  error?: string;
}

export default function StepReview({ data, onBack }: StepReviewProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [savedTargetId, setSavedTargetId] = useState<string | null>(null);

  const buildAuthConfig = () => {
    const preset = data.preset;
    if (!preset) return data.authConfig;

    // Map auth fields from preset to the expected authConfig shape
    if (data.authType === "BEARER_TOKEN") {
      return { token: data.authConfig.token || "" };
    }
    if (data.authType === "API_KEY") {
      return {
        apiKey: data.authConfig.apiKey || "",
        headerName: data.authConfig.headerName || "",
      };
    }
    if (data.authType === "CUSTOM_HEADER") {
      if (data.authConfig.headers && typeof data.authConfig.headers === "object") {
        return { headers: data.authConfig.headers };
      }
      const headers: Record<string, string> = {};
      for (const field of preset.authFields) {
        if (data.authConfig[field.key]) {
          headers[field.key] = String(data.authConfig[field.key]);
        }
      }
      return { headers };
    }
    if (data.authType === "BASIC_AUTH") {
      return {
        username: data.authConfig.username || "",
        password: data.authConfig.password || "",
      };
    }
    return data.authConfig;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          connectorType: data.connectorType,
          endpoint: data.endpoint,
          authType: data.authType,
          authConfig: buildAuthConfig(),
          requestTemplate: data.requestTemplate,
          responseTemplate: data.responseTemplate,
          protocolConfig: data.protocolConfig || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSavedTargetId(result.data.id);
      } else {
        setSaveError(result.error || "Failed to save target");
      }
    } catch {
      setSaveError("Failed to save target");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!savedTargetId) return;

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/targets/${savedTargetId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMessage: "Hello, this is a connection test from Krawall." }),
      });

      const result = await response.json();

      if (result.success) {
        setTestResult(result.data);
      } else {
        setTestResult({
          healthy: false,
          latencyMs: 0,
          error: result.error || "Test failed",
        });
      }
    } catch {
      setTestResult({
        healthy: false,
        latencyMs: 0,
        error: "Failed to reach test endpoint",
      });
    } finally {
      setTesting(false);
    }
  };

  if (savedTargetId) {
    return (
      <div className="space-y-6">
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-6 text-center">
          <div className="text-2xl mb-2 text-green-400">Target Saved</div>
          <p className="text-sm text-green-300">
            &quot;{data.name}&quot; has been created successfully.
          </p>
        </div>

        {/* Test Button */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-sm font-semibold text-white mb-3">
            Send Test Message
          </h3>
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
                <span
                  className={`w-2 h-2 rounded-full ${
                    testResult.healthy ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className={testResult.healthy ? "text-green-300" : "text-red-300"}>
                  {testResult.healthy ? "Connection Successful" : "Connection Failed"}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {Math.round(testResult.latencyMs)}ms
                </span>
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

        <div className="flex gap-4">
          <button
            onClick={() => router.push("/targets")}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Targets
          </button>
          <button
            onClick={() => router.push(`/targets/${savedTargetId}`)}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Target Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Review &amp; Save</h2>
        <p className="text-sm text-gray-400">
          Review your configuration before saving.
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-4">
        <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Connection</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Name</dt>
              <dd className="text-white font-medium">{data.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Provider</dt>
              <dd className="text-white">{data.preset?.name || "Custom"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Connector</dt>
              <dd className="text-white">{data.connectorType.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Auth Type</dt>
              <dd className="text-white">{data.authType.replace("_", " ")}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">
                {data.connectorType === "BROWSER_WEBSOCKET" ? "Page URL" : "Endpoint"}
              </dt>
              <dd className="text-white font-mono text-xs break-all">{data.endpoint}</dd>
            </div>
            {data.connectorType === "BROWSER_WEBSOCKET" && data.protocolConfig && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Widget Detection</dt>
                <dd className="text-white text-xs">
                  {(data.protocolConfig as Record<string, any>)?.widgetDetection?.strategy || "heuristic"} strategy
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Request Template</h3>
          <div className="text-xs text-gray-400 mb-2">
            messagePath: <code className="text-blue-400">{data.requestTemplate.messagePath}</code>
          </div>
          <pre className="bg-gray-900 rounded p-3 text-xs text-gray-400 overflow-x-auto max-h-32">
            {JSON.stringify(data.requestTemplate.structure, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Response Template</h3>
          <div className="space-y-1 text-xs">
            <div className="text-gray-400">
              responsePath: <code className="text-green-400">{data.responseTemplate.responsePath}</code>
            </div>
            {data.responseTemplate.tokenUsagePath && (
              <div className="text-gray-400">
                tokenUsagePath: <code className="text-blue-400">{data.responseTemplate.tokenUsagePath}</code>
              </div>
            )}
            {data.responseTemplate.errorPath && (
              <div className="text-gray-400">
                errorPath: <code className="text-red-400">{data.responseTemplate.errorPath}</code>
              </div>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {saveError}
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Target"}
        </button>
      </div>
    </div>
  );
}
