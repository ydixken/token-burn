"use client";

import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConnectionTester } from "../shared/connection-tester";
import { StepNavigation } from "../shared/step-navigation";
import { useWizard } from "../wizard-context";

export function StepTestConnection() {
  const { createdTargetId, markComplete, currentStep, goNext } = useWizard();
  const [targetInfo, setTargetInfo] = useState<{ name: string; endpoint: string } | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (!createdTargetId) return;
    fetch(`/api/targets/${createdTargetId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setTargetInfo({ name: data.data.name, endpoint: data.data.endpoint });
        }
      })
      .catch(() => {});
  }, [createdTargetId]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Test Connection</h2>
        <p className="text-sm text-gray-500">
          Verify that your target endpoint is reachable and responding correctly.
        </p>
      </div>

      <ConnectionTester
        targetId={createdTargetId}
        targetName={targetInfo?.name}
        targetEndpoint={targetInfo?.endpoint}
        autoRun={!!createdTargetId}
        onSuccess={() => {
          setTested(true);
          markComplete(currentStep);
        }}
      />

      {/* What this tests */}
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-300">What this tests</h4>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>Sends a health check request to your endpoint</li>
              <li>Verifies the response format matches your template</li>
              <li>Measures round-trip latency</li>
              <li className="text-gray-600 italic">Does NOT count as a real test session</li>
            </ul>
          </div>
        </div>
      </Card>

      <StepNavigation
        canProceed
        showSkip
        onNext={() => {
          if (!tested) markComplete(currentStep);
          goNext();
        }}
      />
    </div>
  );
}
