"use client";

import { ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWizard } from "../wizard-context";
import { STEPS } from "../wizard-shell";

interface StepNavigationProps {
  canProceed?: boolean;
  showSkip?: boolean;
  nextLabel?: string;
  onNext?: () => void;
}

export function StepNavigation({
  canProceed = true,
  showSkip,
  nextLabel,
  onNext,
}: StepNavigationProps) {
  const { currentStep, goBack, goNext, skip, totalSteps } = useWizard();
  const step = STEPS[currentStep];
  const canSkip = showSkip ?? step?.canSkip ?? false;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      goNext();
    }
  };

  return (
    <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-6">
      <div>
        {!isFirst && (
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 mr-2">
          Step {currentStep + 1} of {totalSteps}
        </span>
        {canSkip && (
          <Button variant="ghost" size="sm" onClick={() => skip(currentStep)}>
            Skip
            <SkipForward className="h-3 w-3 ml-1" />
          </Button>
        )}
        {!isLast && (
          <Button size="sm" onClick={handleNext} disabled={!canProceed}>
            {nextLabel || "Next"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
