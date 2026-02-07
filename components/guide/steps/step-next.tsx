"use client";

import { Layers, GitCompare, Bell, Calendar, Code2, Puzzle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWizard } from "../wizard-context";

const FEATURES = [
  {
    icon: Layers,
    title: "Batch Testing",
    description: "Run the same scenario against multiple targets simultaneously",
    href: "/batches",
  },
  {
    icon: GitCompare,
    title: "A/B Comparison",
    description: "Compare two sessions side-by-side with statistical analysis",
    href: "/compare",
  },
  {
    icon: Bell,
    title: "Webhook Alerts",
    description: "Get notified when sessions complete or fail",
    href: "/settings",
  },
  {
    icon: Calendar,
    title: "Scheduled Jobs",
    description: "Run scenarios on a cron schedule automatically",
    href: "/settings",
  },
  {
    icon: Code2,
    title: "API Documentation",
    description: "Full API reference for automation and integration",
    href: "/api-docs",
  },
  {
    icon: Puzzle,
    title: "Plugin System",
    description: "Build custom connectors for your chatbot platform",
    href: "/settings",
  },
];

export function StepNext() {
  const {
    createdTargetId,
    createdScenarioId,
    createdSessionId,
    goToStep,
    markComplete,
    currentStep,
    resetWizard,
  } = useWizard();

  // Mark complete on mount
  markComplete(currentStep);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Celebration */}
      <div className="text-center py-6 space-y-3">
        <div className="text-4xl mb-2">
          <span className="inline-block animate-bounce" style={{ animationDelay: "0ms" }}>&#x1F389;</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-100">Guide Complete!</h1>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          You&apos;ve successfully set up and run your first chatbot test with Krawall.
        </p>
      </div>

      {/* What you built */}
      <Card className="!p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">What you built</h3>
        <div className="space-y-2 text-xs">
          {createdTargetId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Target</span>
              <a href={`/targets`} className="text-blue-400 hover:text-blue-300 transition-colors font-mono">
                {createdTargetId.slice(0, 8)}...
              </a>
            </div>
          )}
          {createdScenarioId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Scenario</span>
              <a href={`/scenarios`} className="text-blue-400 hover:text-blue-300 transition-colors font-mono">
                {createdScenarioId.slice(0, 8)}...
              </a>
            </div>
          )}
          {createdSessionId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Session</span>
              <a href={`/sessions/${createdSessionId}`} className="text-blue-400 hover:text-blue-300 transition-colors font-mono">
                {createdSessionId.slice(0, 8)}...
              </a>
            </div>
          )}
        </div>
      </Card>

      {/* Advanced features grid */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Explore Advanced Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <a
                key={feat.title}
                href={feat.href}
                className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 hover:bg-gray-800/50 transition-colors"
              >
                <Icon className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-200">{feat.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{feat.description}</div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Run another test */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goToStep(4)}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Run Another Test
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetWizard}
        >
          Start Fresh
        </Button>
      </div>
    </div>
  );
}
