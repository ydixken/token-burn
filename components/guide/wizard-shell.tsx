"use client";

import { useWizard } from "./wizard-context";
import {
  BookOpen,
  Server,
  Crosshair,
  Zap,
  FileText,
  Play,
  BarChart3,
  Rocket,
  Check,
  SkipForward,
} from "lucide-react";

export interface StepDef {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  canSkip: boolean;
  component: React.ComponentType;
}

export const STEPS: StepDef[] = [
  { title: "Welcome", description: "Overview & prerequisites", icon: BookOpen, canSkip: false, component: () => null },
  { title: "Infrastructure", description: "Check services", icon: Server, canSkip: true, component: () => null },
  { title: "Create Target", description: "Configure endpoint", icon: Crosshair, canSkip: false, component: () => null },
  { title: "Test Connection", description: "Verify connectivity", icon: Zap, canSkip: true, component: () => null },
  { title: "Create Scenario", description: "Choose test template", icon: FileText, canSkip: false, component: () => null },
  { title: "Execute Test", description: "Launch session", icon: Play, canSkip: false, component: () => null },
  { title: "View Results", description: "Analyze metrics", icon: BarChart3, canSkip: false, component: () => null },
  { title: "Next Steps", description: "Advanced features", icon: Rocket, canSkip: false, component: () => null },
];

export function WizardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentStep, goToStep, isComplete, isSkipped, completedSteps } = useWizard();
  const progress = Math.round((completedSteps.length / STEPS.length) * 100);

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      {/* Left rail - step progress */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0">
        <div className="sticky top-6 space-y-1">
          {/* Progress indicator */}
          <div className="mb-4 px-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {STEPS.map((step, idx) => {
            const active = idx === currentStep;
            const completed = isComplete(idx);
            const skipped = isSkipped(idx);
            const Icon = step.icon;

            return (
              <button
                key={idx}
                onClick={() => goToStep(idx)}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors relative group ${
                  active
                    ? "bg-blue-500/10 text-blue-400"
                    : completed
                    ? "text-emerald-400 hover:bg-gray-800/50"
                    : skipped
                    ? "text-gray-600 hover:bg-gray-800/50"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-300"
                }`}
              >
                {/* Step indicator */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-500/20 text-blue-400"
                      : completed
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : skipped
                      ? "border-gray-700 bg-gray-800/50 text-gray-600"
                      : "border-gray-700 bg-gray-800 text-gray-500 group-hover:border-gray-600"
                  }`}
                >
                  {completed ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : skipped ? (
                    <SkipForward className="h-3 w-3" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Step info */}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{step.title}</div>
                  <div className="text-[10px] text-gray-500 truncate">{step.description}</div>
                </div>

                {/* Active indicator line */}
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Mobile step indicator */}
      <div className="lg:hidden fixed top-14 left-14 right-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((step, idx) => {
            const active = idx === currentStep;
            const completed = isComplete(idx);
            return (
              <button
                key={idx}
                onClick={() => goToStep(idx)}
                className={`flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : completed
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-gray-500 hover:text-gray-400"
                }`}
              >
                {completed ? <Check className="h-3 w-3" /> : <span>{idx + 1}</span>}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 lg:pt-0 pt-12">
        <div className="animate-fadeIn">{children}</div>
      </div>
    </div>
  );
}
