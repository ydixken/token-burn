"use client";

import { useState, useEffect, useCallback } from "react";
import { Database, HardDrive, Server, RefreshCw, Check, X, Loader2, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWizard } from "../wizard-context";
import { StepNavigation } from "../shared/step-navigation";

interface ServiceStatus {
  status: "unknown" | "checking" | "healthy" | "unhealthy";
  latencyMs?: number;
  error?: string;
}

interface HealthResult {
  database: ServiceStatus;
  redis: ServiceStatus;
  mockServer: ServiceStatus;
}

const defaultHealth: HealthResult = {
  database: { status: "unknown" },
  redis: { status: "unknown" },
  mockServer: { status: "unknown" },
};

export function StepInfrastructure() {
  const { markComplete, currentStep, goNext } = useWizard();
  const [health, setHealth] = useState<HealthResult>(defaultHealth);
  const [checking, setChecking] = useState(false);

  const checkServices = useCallback(async () => {
    setChecking(true);
    setHealth({
      database: { status: "checking" },
      redis: { status: "checking" },
      mockServer: { status: "checking" },
    });

    try {
      const res = await fetch("/api/health");
      const data = await res.json();

      const db = data.services?.database;
      const redis = data.services?.redis;
      const mock = data.services?.mockServer;

      setHealth({
        database: {
          status: db?.status === "healthy" ? "healthy" : "unhealthy",
          latencyMs: db?.responseTimeMs,
          error: db?.error,
        },
        redis: {
          status: redis?.status === "healthy" ? "healthy" : "unhealthy",
          latencyMs: redis?.responseTimeMs,
          error: redis?.error,
        },
        mockServer: {
          status: mock?.status === "healthy" ? "healthy" : "unhealthy",
          latencyMs: mock?.responseTimeMs,
          error: mock?.status === "unreachable" ? "Mock server not reachable" : mock?.error,
        },
      });
    } catch {
      setHealth({
        database: { status: "unhealthy", error: "Cannot reach API server" },
        redis: { status: "unhealthy", error: "Cannot reach API server" },
        mockServer: { status: "unhealthy", error: "Cannot reach API server" },
      });
    }

    setChecking(false);
  }, []);

  useEffect(() => {
    checkServices();
  }, [checkServices]);

  const allHealthy = health.database.status === "healthy" && health.redis.status === "healthy";

  const copyCommand = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
  };

  const services = [
    {
      key: "database",
      label: "PostgreSQL",
      detail: "Port 5432",
      icon: Database,
      status: health.database,
      command: "task docker:up",
    },
    {
      key: "redis",
      label: "Redis",
      detail: "Port 6379",
      icon: HardDrive,
      status: health.redis,
      command: "task docker:up",
    },
    {
      key: "mockServer",
      label: "Mock Chatbot Server",
      detail: "Port 3001",
      icon: Server,
      status: health.mockServer,
      command: "pnpm run mock-server",
    },
  ];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Infrastructure Check</h2>
        <p className="text-sm text-gray-500">
          Verify that required services are running before proceeding.
        </p>
      </div>

      {/* Service panels */}
      <div className="space-y-3">
        {services.map((svc) => {
          const Icon = svc.icon;
          const s = svc.status;
          return (
            <Card key={svc.key} className="!p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-gray-500" />
                  <div>
                    <div className="text-sm font-medium text-gray-200">{svc.label}</div>
                    <div className="text-[10px] text-gray-600">{svc.detail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.latencyMs != null && s.status === "healthy" && (
                    <span className="text-[10px] text-gray-600">{Math.round(s.latencyMs)}ms</span>
                  )}
                  {s.status === "checking" && <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
                  {s.status === "healthy" && <Check className="h-4 w-4 text-emerald-400" />}
                  {s.status === "unhealthy" && <X className="h-4 w-4 text-red-400" />}
                  {s.status === "unknown" && <div className="h-2 w-2 rounded-full bg-gray-600" />}
                </div>
              </div>
              {s.status === "unhealthy" && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-800/50 border border-gray-800 px-3 py-2">
                  <code className="text-xs text-gray-400 font-mono flex-1">{svc.command}</code>
                  <button
                    onClick={() => copyCommand(svc.command)}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Re-check button */}
      <div className="flex justify-center">
        <Button variant="secondary" size="sm" onClick={checkServices} loading={checking}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Re-check Services
        </Button>
      </div>

      {allHealthy && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400 text-center">
          All required services are running
        </div>
      )}

      <StepNavigation
        canProceed
        showSkip
        onNext={() => {
          markComplete(currentStep);
          goNext();
        }}
      />
    </div>
  );
}
