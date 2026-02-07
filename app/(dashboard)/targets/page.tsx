"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Zap,
  Eye,
  Pencil,
  Trash2,
  Crosshair,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";

interface Target {
  id: string;
  name: string;
  description?: string;
  connectorType: string;
  endpoint: string;
  authType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CONNECTOR_BADGE: Record<string, "info" | "warning" | "success" | "neutral"> = {
  HTTP_REST: "info",
  WEBSOCKET: "neutral",
  GRPC: "success",
  SSE: "warning",
};

export default function TargetsPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs?: number }>>({});

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/targets");
      const data = await response.json();
      if (data.success) {
        setTargets(data.data);
      } else {
        setError(data.error || "Failed to fetch targets");
      }
    } catch {
      setError("Failed to fetch targets");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this target?")) return;
    try {
      const response = await fetch(`/api/targets/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        setTargets(targets.filter((t) => t.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const handleTest = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingId(id);
    try {
      const response = await fetch(`/api/targets/${id}/test`, { method: "POST" });
      const data = await response.json();
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          success: data.success,
          latencyMs: data.data?.latencyMs,
        },
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { success: false } }));
    } finally {
      setTestingId(null);
    }
  };

  const columns: Column<Target & Record<string, unknown>>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-100">{row.name}</div>
          {row.description && (
            <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "connectorType",
      header: "Type",
      sortable: true,
      render: (row) => (
        <Badge variant={CONNECTOR_BADGE[row.connectorType] || "neutral"} size="sm">
          {row.connectorType.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "endpoint",
      header: "Endpoint",
      render: (row) => (
        <span className="font-mono text-xs text-gray-400 truncate block max-w-[240px]" title={row.endpoint}>
          {row.endpoint}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      sortable: true,
      render: (row) => {
        const testResult = testResults[row.id];
        if (testResult) {
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${testResult.success ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={`text-xs ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.success ? "Healthy" : "Failing"}
              </span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${row.isActive ? "bg-emerald-500" : "bg-gray-500"}`} />
            <span className={`text-xs ${row.isActive ? "text-gray-300" : "text-gray-500"}`}>
              {row.isActive ? "Active" : "Inactive"}
            </span>
          </span>
        );
      },
    },
    {
      key: "authType",
      header: "Auth",
      render: (row) => (
        <span className="text-xs text-gray-400">{row.authType.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-[140px]",
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Test Connection">
            <Button
              variant="icon"
              size="sm"
              loading={testingId === row.id}
              onClick={(e) => handleTest(row.id, e)}
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="View Details">
            <Link href={`/targets/${row.id}`}>
              <Button variant="icon" size="sm">
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </Tooltip>
          <Tooltip content="Edit">
            <Link href={`/targets/${row.id}/edit`}>
              <Button variant="icon" size="sm">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </Tooltip>
          <Tooltip content="Delete">
            <Button variant="icon" size="sm" onClick={(e) => handleDelete(row.id, e)}>
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Targets"
        description="Manage chatbot endpoints and connection configurations"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Targets" },
        ]}
        actions={
          <Link href="/targets/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Target
            </Button>
          </Link>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Auth</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="animate-skeleton h-4 w-32 rounded bg-gray-800" />
                      <div className="animate-skeleton h-3 w-48 rounded bg-gray-800" />
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-5 w-16 rounded-full bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-44 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-14 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-20 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-skeleton h-7 w-7 rounded bg-gray-800" />
                      <div className="animate-skeleton h-7 w-7 rounded bg-gray-800" />
                      <div className="animate-skeleton h-7 w-7 rounded bg-gray-800" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : targets.length === 0 && !error ? (
        <EmptyState
          icon={Crosshair}
          title="No targets configured"
          description="Add your first chatbot endpoint to start testing."
          action={{
            label: "Create Target",
            onClick: () => router.push("/targets/new"),
          }}
        />
      ) : (
        <div className="animate-fadeIn">
          <DataTable
            columns={columns}
            data={targets as (Target & Record<string, unknown>)[]}
            filterKey="name"
            filterPlaceholder="Search targets..."
            onRowClick={(row) => router.push(`/targets/${row.id}`)}
          />
        </div>
      )}
    </div>
  );
}
