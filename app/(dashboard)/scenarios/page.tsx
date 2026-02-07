"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  FileText,
  Upload,
  Download,
  Play,
  Pencil,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportYamlButton, YamlImportModal } from "@/components/scenarios/YamlImportExport";

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  repetitions?: number;
  flowConfig?: unknown[];
  isActive?: boolean;
  createdAt: string;
  _count?: {
    sessions?: number;
  };
  target: {
    name: string;
  } | null;
}

const CATEGORY_BADGE: Record<string, "info" | "success" | "warning" | "error" | "neutral"> = {
  SECURITY: "error",
  PERFORMANCE: "warning",
  FUNCTIONAL: "info",
  COMPLIANCE: "success",
  STRESS: "neutral",
  CUSTOM: "neutral",
};

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const response = await fetch("/api/scenarios");
      const data = await response.json();
      if (data.success) setScenarios(data.data);
    } catch (error) {
      console.error("Failed to fetch scenarios:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this scenario?")) return;
    try {
      const response = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        setScenarios((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const columns: Column<Scenario & Record<string, unknown>>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-100">{row.name}</div>
          {row.description && (
            <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[250px]">
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      render: (row) =>
        row.category ? (
          <Badge
            variant={CATEGORY_BADGE[row.category] || "neutral"}
            size="sm"
          >
            {row.category}
          </Badge>
        ) : (
          <span className="text-xs text-gray-600">-</span>
        ),
    },
    {
      key: "flowConfig",
      header: "Steps",
      render: (row) => (
        <span className="text-xs text-gray-400">
          {Array.isArray(row.flowConfig) ? row.flowConfig.length : 0}
        </span>
      ),
    },
    {
      key: "repetitions",
      header: "Repetitions",
      render: (row) => (
        <span className="text-xs text-gray-400">{row.repetitions || 1}</span>
      ),
    },
    {
      key: "_count",
      header: "Sessions",
      render: (row) => {
        const count = (row._count as Scenario["_count"])?.sessions;
        return (
          <span className="text-xs text-gray-400">{count ?? 0}</span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-[120px]",
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Execute">
            <Link href={`/scenarios/${row.id}/execute`}>
              <Button variant="icon" size="sm">
                <Play className="h-3.5 w-3.5 text-emerald-400" />
              </Button>
            </Link>
          </Tooltip>
          <Tooltip content="Edit">
            <Link href={`/scenarios/${row.id}/edit`}>
              <Button variant="icon" size="sm">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </Tooltip>
          <ExportYamlButton scenarioId={row.id} scenarioName={row.name} />
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
        title="Scenarios"
        description="Manage and execute chatbot test scenarios"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Scenarios" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import YAML
            </Button>
            <Link href="/scenarios/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New Scenario
              </Button>
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Steps</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Repetitions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Sessions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="animate-skeleton h-4 w-36 rounded bg-gray-800" />
                      <div className="animate-skeleton h-3 w-52 rounded bg-gray-800" />
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-5 w-20 rounded-full bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-6 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-6 rounded bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-6 rounded bg-gray-800" /></td>
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
      ) : scenarios.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No scenarios yet"
          description="Create your first test scenario or import from YAML."
          action={{
            label: "Create Scenario",
            onClick: () => router.push("/scenarios/new"),
          }}
        />
      ) : (
        <div className="animate-fadeIn">
          <DataTable
            columns={columns}
            data={scenarios as (Scenario & Record<string, unknown>)[]}
            filterKey="name"
            filterPlaceholder="Search scenarios..."
            onRowClick={(row) => router.push(`/scenarios/${row.id}/edit`)}
          />
        </div>
      )}

      <YamlImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchScenarios}
      />
    </div>
  );
}
