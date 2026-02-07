"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  Loader2,
  Bell,
  Globe,
  Sliders,
  Code2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

interface SettingItem {
  key: string;
  value: unknown;
  updatedAt?: string;
}

type SettingsData = Record<string, SettingItem[]>;

const CONNECTOR_TYPES = ["HTTP_REST", "WEBSOCKET", "GRPC", "SSE"];
const AUTH_TYPES = [
  "NONE",
  "BEARER_TOKEN",
  "API_KEY",
  "BASIC_AUTH",
  "CUSTOM_HEADER",
  "OAUTH2",
];

const WEBHOOK_EVENTS = [
  "session.completed",
  "session.failed",
  "session.started",
  "batch.completed",
  "batch.failed",
  "alert.threshold",
];

function getSettingValue(
  settings: SettingsData,
  key: string,
  fallback: unknown = ""
): unknown {
  for (const items of Object.values(settings)) {
    const found = items.find((s) => s.key === key);
    if (found) return found.value;
  }
  return fallback;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, unknown>>({});

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        setError("Failed to load settings");
      }
    } catch {
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getValue = (key: string, fallback: unknown = "") => {
    if (key in dirty) return dirty[key];
    return getSettingValue(settings, key, fallback);
  };

  const setValue = (key: string, value: unknown) => {
    setDirty((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      for (const [key, value] of Object.entries(dirty)) {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(`Failed to save ${key}: ${data.error}`);
          setSaving(false);
          return;
        }
      }
      setDirty({});
      setSuccess("Settings saved successfully");
      await fetchSettings();
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone."))
      return;
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setDirty({});
        setSuccess("Settings reset to defaults");
        await fetchSettings();
      } else {
        setError(data.error || "Failed to reset settings");
      }
    } catch {
      setError("Failed to reset settings");
    } finally {
      setResetting(false);
    }
  };

  const hasDirty = Object.keys(dirty).length > 0;

  const generalTab = (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-400" />
            General Settings
          </h3>
          <Input
            label="Application Name"
            value={String(getValue("general.appName", "Krawall"))}
            onChange={(e) => setValue("general.appName", e.target.value)}
            placeholder="Krawall"
          />
          <Input
            label="Default Timeout (ms)"
            type="number"
            value={String(getValue("general.defaultTimeout", 30000))}
            onChange={(e) =>
              setValue("general.defaultTimeout", Number(e.target.value))
            }
            helper="Timeout for target connections in milliseconds"
          />
          <Input
            label="Max Concurrent Sessions"
            type="number"
            value={String(getValue("general.maxConcurrentSessions", 10))}
            onChange={(e) =>
              setValue("general.maxConcurrentSessions", Number(e.target.value))
            }
            helper="Maximum number of sessions that can run at the same time"
          />
          <Input
            label="Log Retention (days)"
            type="number"
            value={String(getValue("general.logRetentionDays", 30))}
            onChange={(e) =>
              setValue("general.logRetentionDays", Number(e.target.value))
            }
            helper="Number of days to retain session logs"
          />
        </div>
      </Card>
    </div>
  );

  const defaultsTab = (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            Default Connector Settings
          </h3>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">
              Default Connector Type
            </label>
            <select
              value={String(getValue("defaults.connectorType", "HTTP_REST"))}
              onChange={(e) =>
                setValue("defaults.connectorType", e.target.value)
              }
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CONNECTOR_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">
              Default Auth Type
            </label>
            <select
              value={String(getValue("defaults.authType", "NONE"))}
              onChange={(e) => setValue("defaults.authType", e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {AUTH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
    </div>
  );

  const notificationsTab = (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-400" />
            Default Webhook Events
          </h3>
          <p className="text-xs text-gray-400">
            Select which events new webhooks subscribe to by default.
          </p>
          <div className="space-y-2">
            {WEBHOOK_EVENTS.map((event) => {
              const current = (getValue(
                "notifications.defaultWebhookEvents",
                ["session.completed", "session.failed"]
              ) as string[]) || [];
              const checked = current.includes(event);
              return (
                <label
                  key={event}
                  className="flex items-center gap-3 rounded-md border border-gray-800 bg-gray-900/50 px-3 py-2 cursor-pointer hover:border-gray-700 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const updated = checked
                        ? current.filter((e) => e !== event)
                        : [...current, event];
                      setValue("notifications.defaultWebhookEvents", updated);
                    }}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-gray-200 font-mono">
                    {event}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="pt-2 border-t border-gray-800">
            <a
              href="/settings/webhooks"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Manage webhook endpoints &rarr;
            </a>
          </div>
        </div>
      </Card>
    </div>
  );

  const apiTab = (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-400" />
            API Configuration
          </h3>
          <Input
            label="Rate Limit (requests per minute)"
            type="number"
            value={String(getValue("api.rateLimitRpm", 60))}
            onChange={(e) =>
              setValue("api.rateLimitRpm", Number(e.target.value))
            }
            helper="Maximum API requests per minute per client"
          />
          <Textarea
            label="CORS Origins"
            value={(() => {
              const val = getValue("api.corsOrigins", [
                "http://localhost:3000",
              ]);
              return Array.isArray(val) ? val.join("\n") : String(val);
            })()}
            onChange={(e) =>
              setValue(
                "api.corsOrigins",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            helper="One origin per line (e.g. http://localhost:3000)"
            rows={4}
          />
        </div>
      </Card>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Configure application settings and preferences"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Settings" },
          ]}
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure application settings and preferences"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Settings" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              loading={resetting}
            >
              <RotateCcw className="h-4 w-4" />
              Reset All
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!hasDirty}
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          {success}
        </div>
      )}

      <Tabs
        tabs={[
          { id: "general", label: "General", content: generalTab },
          { id: "defaults", label: "Defaults", content: defaultsTab },
          {
            id: "notifications",
            label: "Notifications",
            content: notificationsTab,
          },
          { id: "api", label: "API", content: apiTab },
        ]}
        defaultTab="general"
      />
    </div>
  );
}
