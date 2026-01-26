"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError("Failed to fetch targets");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this target?")) {
      return;
    }

    try {
      const response = await fetch(`/api/targets/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setTargets(targets.filter((t) => t.id !== id));
      } else {
        alert(data.error || "Failed to delete target");
      }
    } catch (err) {
      alert("Failed to delete target");
      console.error(err);
    }
  };

  const getConnectorBadgeColor = (type: string) => {
    const colors = {
      HTTP_REST: "bg-blue-900 text-blue-300",
      WEBSOCKET: "bg-purple-900 text-purple-300",
      GRPC: "bg-green-900 text-green-300",
      SSE: "bg-yellow-900 text-yellow-300",
    };
    return colors[type as keyof typeof colors] || "bg-gray-900 text-gray-300";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading targets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Targets</h1>
          <p className="text-gray-400 mt-2">
            Manage chatbot endpoints and connection configurations
          </p>
        </div>
        <Link
          href="/targets/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          + New Target
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {targets.length === 0 && !error ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
          <div className="text-gray-400 mb-4">No targets configured yet</div>
          <Link
            href="/targets/new"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Create Your First Target
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {targets.map((target) => (
            <div
              key={target.id}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{target.name}</h3>
                  {target.description && (
                    <p className="text-sm text-gray-400">{target.description}</p>
                  )}
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                    target.isActive
                      ? "bg-green-900/30 text-green-400"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${target.isActive ? "bg-green-400" : "bg-gray-400"}`}></span>
                  {target.isActive ? "Active" : "Inactive"}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getConnectorBadgeColor(target.connectorType)}`}
                  >
                    {target.connectorType.replace("_", " ")}
                  </span>
                  <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                    {target.authType.replace("_", " ")}
                  </span>
                </div>
                <div className="text-sm text-gray-400 truncate" title={target.endpoint}>
                  {target.endpoint}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-gray-700">
                <Link
                  href={`/targets/${target.id}`}
                  className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm text-center transition"
                >
                  View
                </Link>
                <Link
                  href={`/targets/${target.id}/edit`}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm text-center transition"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(target.id)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
