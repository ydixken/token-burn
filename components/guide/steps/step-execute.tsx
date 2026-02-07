"use client";

import { useState, useEffect } from "react";
import { Rocket, AlertCircle, Crosshair, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MiniLogViewer } from "../shared/mini-log-viewer";
import { StepNavigation } from "../shared/step-navigation";
import { useWizard } from "../wizard-context";
import { useToast } from "@/components/ui/toast";

export function StepExecute() {
  const {
    createdTargetId,
    createdScenarioId,
    createdSessionId,
    setCreatedSessionId,
    markComplete,
    currentStep,
    goNext,
  } = useWizard();
  const { toast } = useToast();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>("");
  const [scenarioName, setScenarioName] = useState<string>("");
  const [sessionComplete, setSessionComplete] = useState(false);

  // Fetch target/scenario names
  useEffect(() => {
    if (createdTargetId) {
      fetch(`/api/targets/${createdTargetId}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setTargetName(d.data.name); })
        .catch(() => {});
    }
    if (createdScenarioId) {
      fetch(`/api/scenarios/${createdScenarioId}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setScenarioName(d.data.name); })
        .catch(() => {});
    }
  }, [createdTargetId, createdScenarioId]);

  const launchTest = async () => {
    if (!createdTargetId || !createdScenarioId) return;
    setLaunching(true);
    setError(null);

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: createdTargetId,
          scenarioId: createdScenarioId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const sessionId = data.data?.sessionId || data.data?.id;
        setCreatedSessionId(sessionId);
        toast({ type: "success", message: "Test session launched" });
      } else {
        setError(data.error || data.message || "Failed to launch session");
      }
    } catch {
      setError("Network error");
    } finally {
      setLaunching(false);
    }
  };

  const canLaunch = !!createdTargetId && !!createdScenarioId;

  // Already have a session - show log viewer
  if (createdSessionId) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Test Running</h2>
          <p className="text-sm text-gray-500">
            {sessionComplete ? "Session complete. Review the results below." : "Watch your test session in real-time."}
          </p>
        </div>

        <MiniLogViewer
          sessionId={createdSessionId}
          onComplete={() => {
            setSessionComplete(true);
            markComplete(currentStep);
          }}
        />

        <StepNavigation
          canProceed={sessionComplete}
          nextLabel={sessionComplete ? "View Results" : "Waiting..."}
          onNext={() => {
            markComplete(currentStep);
            goNext();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Execute Test</h2>
        <p className="text-sm text-gray-500">
          Launch a test session pairing your target with your scenario.
        </p>
      </div>

      {/* Launch panel */}
      <Card className="!p-6">
        <div className="space-y-4">
          {/* Target info */}
          <div className="flex items-center gap-3 text-sm">
            <Crosshair className="h-4 w-4 text-gray-500" />
            <div>
              <span className="text-gray-400">Target:</span>{" "}
              <span className="text-gray-200 font-medium">{targetName || createdTargetId || "-"}</span>
            </div>
          </div>

          {/* Scenario info */}
          <div className="flex items-center gap-3 text-sm">
            <FileText className="h-4 w-4 text-gray-500" />
            <div>
              <span className="text-gray-400">Scenario:</span>{" "}
              <span className="text-gray-200 font-medium">{scenarioName || createdScenarioId || "-"}</span>
            </div>
          </div>

          {!canLaunch && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
              Create a target and scenario in the previous steps first.
            </div>
          )}

          {error && (
            <div className="animate-slideDown rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">Failed to launch test</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {error === "Network error" || error === "Failed to fetch"
                      ? "Can't reach the server. Is the dev server running?"
                      : error}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-2 pl-6">
                <Button variant="ghost" size="sm" onClick={launchTest}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={!canLaunch}
            loading={launching}
            onClick={launchTest}
          >
            <Rocket className="h-4 w-4 mr-2" />
            Launch Test
          </Button>
        </div>
      </Card>

      {/* Explainer */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>This will queue a session that sends each scenario step to your target.</p>
        <p>Messages are logged in real-time and you can watch the conversation unfold.</p>
      </div>

      <StepNavigation canProceed={false} />
    </div>
  );
}
