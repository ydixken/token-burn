"use client";

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

function GuideContent() {
  const { currentStep, completedSteps, resetWizard } = useWizard();
  const StepComponent = STEP_COMPONENTS[currentStep];

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
