"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Webhook, Trash2, Pencil, Zap, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import WebhookForm, { WebhookFormData } from "@/components/webhooks/WebhookForm";

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isEnabled: boolean;
  alertThresholds: {
    errorRatePercent: number | null;
    p95ResponseTimeMs: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface DeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed" | "pending";
  responseCode: number | null;
  responseBody?: string;
  error?: string;
  timestamp: string;
  durationMs?: number;
}

type ViewState = "list" | "create" | "edit";

const DELIVERY_STATUS: Record<string, "success" | "error" | "neutral"> = {
  success: "success",
  failed: "error",
  pending: "neutral",
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>("list");
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<Record<string, DeliveryLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const response = await fetch("/api/webhooks");
      if (!response.ok) {
        setWebhooks([]);
        return;
      }
      const data = await response.json();
      if (data.success) setWebhooks(data.data || []);
    } catch {
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const fetchDeliveryLogs = async (webhookId: string) => {
    if (deliveryLogs[webhookId]) {
      setExpandedLogs(expandedLogs === webhookId ? null : webhookId);
      return;
    }
    setLogsLoading(webhookId);
    setExpandedLogs(webhookId);
    try {
      const response = await fetch(`/api/webhooks/${webhookId}/deliveries?limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) setDeliveryLogs((prev) => ({ ...prev, [webhookId]: data.data || [] }));
      } else {
        setDeliveryLogs((prev) => ({ ...prev, [webhookId]: [] }));
      }
    } catch {
      setDeliveryLogs((prev) => ({ ...prev, [webhookId]: [] }));
    } finally {
      setLogsLoading(null);
    }
  };

  const handleCreate = async (data: WebhookFormData) => {
    const response = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.error || "Failed to create webhook");
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Failed to create webhook");
    setViewState("list");
    await fetchWebhooks();
  };

  const handleUpdate = async (data: WebhookFormData) => {
    if (!editingWebhook) return;
    const response = await fetch(`/api/webhooks/${editingWebhook.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.error || "Failed to update webhook");
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Failed to update webhook");
    setViewState("list");
    setEditingWebhook(null);
    await fetchWebhooks();
  };

  const handleDelete = async (webhook: WebhookItem) => {
    if (!confirm(`Delete webhook "${webhook.name}"?`)) return;
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
      if (response.ok) setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
    } catch {
      // ignore
    }
  };

  const handleToggle = async (webhook: WebhookItem) => {
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !webhook.isEnabled }),
      });
      if (response.ok) {
        setWebhooks((prev) =>
          prev.map((w) => (w.id === webhook.id ? { ...w, isEnabled: !w.isEnabled } : w))
        );
      }
    } catch {
      // ignore
    }
  };

  const handleTest = async (webhook: WebhookItem) => {
    setTestingId(webhook.id);
    setTestResult(null);
    try {
      const response = await fetch(`/api/webhooks/${webhook.id}/test`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        setTestResult({ id: webhook.id, success: true, message: data.message || "Delivered" });
      } else {
        setTestResult({ id: webhook.id, success: false, message: data?.error || "Failed" });
      }
    } catch {
      setTestResult({ id: webhook.id, success: false, message: "Failed to reach endpoint" });
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading webhooks...</div>
      </div>
    );
  }

  // Create / Edit view
  if (viewState === "create" || viewState === "edit") {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title={viewState === "create" ? "Create Webhook" : "Edit Webhook"}
          description={viewState === "create" ? "Configure a new webhook endpoint" : `Editing: ${editingWebhook?.name}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Settings" },
            { label: "Webhooks", href: "/settings/webhooks" },
            { label: viewState === "create" ? "Create" : "Edit" },
          ]}
          actions={
            <Button variant="secondary" size="sm" onClick={() => { setViewState("list"); setEditingWebhook(null); }}>
              Back to List
            </Button>
          }
        />

        <Card>
          <WebhookForm
            initialData={
              editingWebhook
                ? {
                    name: editingWebhook.name,
                    url: editingWebhook.url,
                    secret: editingWebhook.secret || "",
                    events: editingWebhook.events,
                    isEnabled: editingWebhook.isEnabled,
                    alertThresholds: editingWebhook.alertThresholds,
                  }
                : undefined
            }
            onSubmit={viewState === "create" ? handleCreate : handleUpdate}
            onCancel={() => { setViewState("list"); setEditingWebhook(null); }}
            submitLabel={viewState === "create" ? "Create Webhook" : "Update Webhook"}
          />
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Configure webhook endpoints for event notifications"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Settings" },
          { label: "Webhooks" },
        ]}
        actions={
          <Button size="sm" onClick={() => setViewState("create")}>
            <Plus className="h-4 w-4" />
            Create Webhook
          </Button>
        }
      />

      {webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhooks configured"
          description="Create a webhook to receive notifications when sessions complete, fail, or exceed thresholds."
          action={{
            label: "Create Webhook",
            onClick: () => setViewState("create"),
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Events</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {webhooks.map((webhook) => (
                <tr key={webhook.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-100">{webhook.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-400 truncate block max-w-[200px]" title={webhook.url}>
                      {webhook.url}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.slice(0, 3).map((event) => (
                        <Badge key={event} variant="neutral" size="sm">
                          {event}
                        </Badge>
                      ))}
                      {webhook.events.length > 3 && (
                        <Badge variant="neutral" size="sm">+{webhook.events.length - 3}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(webhook)} className="flex items-center gap-1.5">
                      {webhook.isEnabled ? (
                        <>
                          <ToggleRight className="h-5 w-5 text-blue-400" />
                          <span className="text-xs text-emerald-400">Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-5 w-5 text-gray-500" />
                          <span className="text-xs text-gray-500">Disabled</span>
                        </>
                      )}
                    </button>
                    {/* Test result inline */}
                    {testResult && testResult.id === webhook.id && (
                      <div className={`mt-1 text-[10px] ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                        {testResult.message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Tooltip content="Test">
                        <Button variant="icon" size="sm" loading={testingId === webhook.id} onClick={() => handleTest(webhook)}>
                          <Zap className="h-3.5 w-3.5 text-emerald-400" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Edit">
                        <Button variant="icon" size="sm" onClick={() => { setEditingWebhook(webhook); setViewState("edit"); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delivery Logs">
                        <Button variant="icon" size="sm" onClick={() => fetchDeliveryLogs(webhook.id)}>
                          {expandedLogs === webhook.id ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <Button variant="icon" size="sm" onClick={() => handleDelete(webhook)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded delivery logs panel */}
          {expandedLogs && (
            <div className="border-t border-gray-800 bg-gray-950 p-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                Recent Deliveries - {webhooks.find((w) => w.id === expandedLogs)?.name}
              </h4>
              {logsLoading === expandedLogs ? (
                <div className="text-xs text-gray-500 text-center py-4">Loading...</div>
              ) : (deliveryLogs[expandedLogs]?.length || 0) === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4">No delivery logs yet</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {deliveryLogs[expandedLogs].map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={DELIVERY_STATUS[log.status] || "neutral"} size="sm">
                          {log.status.toUpperCase()}
                        </Badge>
                        <span className="text-gray-400">{log.event}</span>
                        {log.responseCode !== null && (
                          <span className="text-gray-500">HTTP {log.responseCode}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500">
                        {log.durationMs !== undefined && <span>{log.durationMs}ms</span>}
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
