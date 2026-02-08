"use client";

import type { WizardData } from "./types";
import { BrowserWebSocketConfig, defaultBrowserWsConfig } from "@/components/targets/browser-websocket-config";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";

interface StepConnectionProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
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

export default function StepConnection({ data, onUpdate, onNext, onBack }: StepConnectionProps) {
  const authFields = data.preset?.authFields || [];
  const isBrowserWs = data.connectorType === "BROWSER_WEBSOCKET";

  const updateAuthConfig = (key: string, value: string) => {
    onUpdate({
      authConfig: { ...data.authConfig, [key]: value },
    });
  };

  const isValid = data.name.trim().length > 0 && data.endpoint.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Configure Connection</h2>
        <p className="text-sm text-gray-400">
          {data.preset
            ? `Pre-filled from ${data.preset.name} preset. Add your credentials.`
            : "Configure your target endpoint and authentication."}
        </p>
      </div>

      <div className="space-y-4">
        {/* Target Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Target Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Production GPT-4, Staging Claude"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">A descriptive name for this target</p>
        </div>

        {/* Connector Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Connector Type
          </label>
          <select
            value={data.connectorType}
            onChange={(e) => {
              const newType = e.target.value;
              const updates: Partial<WizardData> = { connectorType: newType };
              if (newType === "BROWSER_WEBSOCKET") {
                const defaultConfig = defaultBrowserWsConfig();
                defaultConfig.pageUrl = data.endpoint || "";
                updates.protocolConfig = defaultConfig as unknown as Record<string, unknown>;
                updates.authType = "NONE";
                updates.authConfig = {};
              }
              onUpdate(updates);
            }}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CONNECTOR_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        {isBrowserWs ? (
          <>
            {/* Page URL instead of Endpoint URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Page URL <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={data.endpoint}
                onChange={(e) => onUpdate({ endpoint: e.target.value })}
                placeholder="https://kundenservice.lidl.de/SelfServiceDE/s/"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">The web page URL where the chat widget is embedded</p>
            </div>

            {/* Info banner */}
            <div className="bg-violet-900/20 border border-violet-800/50 rounded-lg p-3 text-xs text-violet-300">
              Browser WebSocket discovers the WebSocket endpoint automatically by navigating to this page, detecting the chat widget, and capturing the connection. Auth credentials are extracted from the browser context.
            </div>

            {/* Browser WebSocket Config */}
            <BrowserWebSocketConfig
              config={(data.protocolConfig as unknown as BrowserWebSocketProtocolConfig) || defaultBrowserWsConfig()}
              onChange={(config) => onUpdate({
                protocolConfig: config as unknown as Record<string, unknown>,
                endpoint: config.pageUrl || data.endpoint,
              })}
            />
          </>
        ) : (
          <>
            {/* Endpoint URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Endpoint URL <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={data.endpoint}
                onChange={(e) => onUpdate({ endpoint: e.target.value })}
                placeholder="https://api.example.com/v1/chat"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">The full API endpoint URL</p>
            </div>

            {/* Auth Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Authentication Type
              </label>
              <select
                value={data.authType}
                onChange={(e) => onUpdate({ authType: e.target.value, authConfig: {} })}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {AUTH_TYPES.map((at) => (
                  <option key={at.value} value={at.value}>
                    {at.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Preset Auth Fields */}
            {authFields.length > 0 && (
              <div className="space-y-3 bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300">Credentials</h4>
                {authFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {field.type === "select" && field.options ? (
                      <select
                        value={String(data.authConfig[field.key] || "")}
                        onChange={(e) => updateAuthConfig(field.key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === "password" ? "password" : "text"}
                        value={String(data.authConfig[field.key] || "")}
                        onChange={(e) => updateAuthConfig(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Generic Auth Fields (when no preset) */}
            {authFields.length === 0 && data.authType === "BEARER_TOKEN" && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={String(data.authConfig.token || "")}
                  onChange={(e) => updateAuthConfig("token", e.target.value)}
                  placeholder="Your API token"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {authFields.length === 0 && data.authType === "API_KEY" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={String(data.authConfig.apiKey || "")}
                    onChange={(e) => updateAuthConfig("apiKey", e.target.value)}
                    placeholder="Your API key"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Header Name</label>
                  <input
                    type="text"
                    value={String(data.authConfig.headerName || "")}
                    onChange={(e) => updateAuthConfig("headerName", e.target.value)}
                    placeholder="e.g., x-api-key"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {authFields.length === 0 && data.authType === "BASIC_AUTH" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={String(data.authConfig.username || "")}
                    onChange={(e) => updateAuthConfig("username", e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={String(data.authConfig.password || "")}
                    onChange={(e) => updateAuthConfig("password", e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {authFields.length === 0 && data.authType === "CUSTOM_HEADER" && (() => {
              const headers = (data.authConfig.headers || {}) as Record<string, string>;
              const entries = Object.entries(headers);
              const headerName = entries[0]?.[0] || "";
              const headerValue = entries[0]?.[1] || "";
              return (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Header Name</label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => {
                        const newHeaders: Record<string, string> = {};
                        if (e.target.value) newHeaders[e.target.value] = headerValue;
                        onUpdate({ authConfig: { headers: newHeaders } });
                      }}
                      placeholder="e.g., X-Custom-Auth"
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Header Value</label>
                    <input
                      type="password"
                      value={headerValue}
                      onChange={(e) => {
                        const newHeaders: Record<string, string> = {};
                        if (headerName) newHeaders[headerName] = e.target.value;
                        onUpdate({ authConfig: { headers: newHeaders } });
                      }}
                      placeholder="Header value"
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          Next: Map Templates
        </button>
      </div>
    </div>
  );
}
