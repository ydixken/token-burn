"use client";

import { Zap, Globe, Activity, BarChart3, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useWizard } from "../wizard-context";
import { StepNavigation } from "../shared/step-navigation";

const FEATURES = [
  {
    icon: Globe,
    title: "Multi-Protocol Testing",
    description: "HTTP REST, WebSocket, gRPC, and SSE connectors",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: Activity,
    title: "Real-Time Monitoring",
    description: "Watch conversations as they happen via SSE streaming",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: BarChart3,
    title: "Deep Analytics",
    description: "Token usage, response times, quality scores, and comparisons",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
];

export function StepWelcome() {
  const { markComplete, currentStep, goNext } = useWizard();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-2">
          <Zap className="h-7 w-7 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-100">Welcome to Krawall</h1>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          An automated chatbot testing platform. Evaluate AI endpoints through structured scenarios,
          track token usage, and measure response quality.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FEATURES.map((feat) => {
          const Icon = feat.icon;
          return (
            <Card key={feat.title} className="!p-4">
              <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border ${feat.bg} mb-3`}>
                <Icon className={`h-4 w-4 ${feat.color}`} />
              </div>
              <h3 className="text-sm font-medium text-gray-200 mb-1">{feat.title}</h3>
              <p className="text-xs text-gray-500">{feat.description}</p>
            </Card>
          );
        })}
      </div>

      {/* Prerequisites */}
      <Card className="!p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Prerequisites</h3>
        <div className="space-y-2">
          {[
            { label: "Node.js >= 20", detail: "Runtime environment" },
            { label: "Docker", detail: "For PostgreSQL & Redis" },
            { label: "pnpm", detail: "Package manager" },
          ].map((req) => (
            <div key={req.label} className="flex items-center gap-2 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-600" />
              <span className="text-gray-300 font-medium">{req.label}</span>
              <span className="text-gray-600">— {req.detail}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Time estimate */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <Timer className="h-3.5 w-3.5" />
        <span>This guide takes about 5 minutes</span>
      </div>

      <StepNavigation
        canProceed
        nextLabel="Let's Get Started"
        onNext={() => {
          markComplete(currentStep);
          goNext();
        }}
      />
    </div>
  );
}
