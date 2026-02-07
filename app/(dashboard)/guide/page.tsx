"use client";

import { useEffect, useState, useRef } from "react";
import { WizardProvider, useWizard } from "@/components/guide/wizard-context";
import { WizardShell } from "@/components/guide/wizard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StepWelcome } from "@/components/guide/steps/step-welcome";
import { StepInfrastructure } from "@/components/guide/steps/step-infrastructure";
import { StepTarget } from "@/components/guide/steps/step-target";
import { StepTestConnection } from "@/components/guide/steps/step-test-connection";
import { StepScenario } from "@/components/guide/steps/step-scenario";
import { StepExecute } from "@/components/guide/steps/step-execute";
import { StepResults } from "@/components/guide/steps/step-results";
import { StepNext } from "@/components/guide/steps/step-next";
import { X } from "lucide-react";

const STEP_COMPONENTS = [
  StepWelcome,
  StepInfrastructure,
  StepTarget,
  StepTestConnection,
  StepScenario,
  StepExecute,
  StepResults,
  StepNext,
];

const STEP_LABELS = [
  "Welcome",
  "Infrastructure",
  "Create Target",
  "Test Connection",
  "Create Scenario",
  "Execute Test",
  "View Results",
  "Next Steps",
];

function GuideContent() {
  const { currentStep, completedSteps, resetWizard, goNext, goBack, goToStep } = useWizard();
  const StepComponent = STEP_COMPONENTS[currentStep];
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const welcomeBackShown = useRef(false);

  // Welcome back banner - show once per session if returning to a step > 0
  useEffect(() => {
    if (!welcomeBackShown.current && currentStep > 0) {
      welcomeBackShown.current = true;
      setShowWelcomeBack(true);
      const timer = setTimeout(() => setShowWelcomeBack(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "ArrowRight" || (e.key === "Enter" && !e.shiftKey)) {
        if (e.key === "Enter" && target.tagName === "BUTTON") return;
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        goBack();
      } else if (e.key >= "1" && e.key <= "8") {
        goToStep(parseInt(e.key) - 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goBack, goToStep]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Getting Started Guide"
        description="Set up and run your first chatbot test in minutes"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Guide" },
        ]}
        actions={
          completedSteps.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={resetWizard}>
              Start Fresh
            </Button>
          ) : undefined
        }
      />

      {/* Welcome back banner */}
      {showWelcomeBack && (
        <div className="animate-slideDown rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-400">
            Welcome back! You&apos;re on step {currentStep + 1}: {STEP_LABELS[currentStep]}.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { resetWizard(); setShowWelcomeBack(false); }}>
              Start Fresh
            </Button>
            <button onClick={() => setShowWelcomeBack(false)} className="text-gray-500 hover:text-gray-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <WizardShell>
        {StepComponent && <StepComponent />}
      </WizardShell>
    </div>
  );
}

export default function GuidePage() {
  return (
    <WizardProvider>
      <GuideContent />
    </WizardProvider>
  );
}
