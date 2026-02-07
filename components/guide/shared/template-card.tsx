"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, MessageSquare, Repeat, Timer, Zap } from "lucide-react";
import type { ScenarioTemplate } from "@/lib/scenarios/templates";

const CATEGORY_COLORS: Record<string, "success" | "error" | "warning" | "info" | "neutral"> = {
  STRESS_TEST: "error",
  EDGE_CASE: "warning",
  CONTEXT: "info",
  PERFORMANCE: "success",
  LOGIC: "neutral",
  TOKEN_BURN: "error",
  ATTACK_SURFACE: "error",
};

function countSteps(flowConfig: any[]): { messages: number; loops: number } {
  let messages = 0;
  let loops = 0;
  for (const step of flowConfig) {
    if (step.type === "message") messages++;
    if (step.type === "loop") {
      loops++;
      const nested = step.steps || step.config?.steps || [];
      const inner = countSteps(nested);
      messages += inner.messages * (step.iterations || step.config?.iterations || 1);
      loops += inner.loops;
    }
    if (step.type === "conditional") {
      const then = step.thenSteps || step.config?.thenSteps || [];
      const els = step.elseSteps || step.config?.elseSteps || [];
      const t = countSteps(then);
      const e = countSteps(els);
      messages += Math.max(t.messages, e.messages);
    }
  }
  return { messages, loops };
}

interface TemplateCardProps {
  template: ScenarioTemplate;
  selected: boolean;
  onClick: () => void;
}

export function TemplateCard({ template, selected, onClick }: TemplateCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const { messages, loops } = countSteps(template.flowConfig);
  const variant = CATEGORY_COLORS[template.category] || "neutral";

  return (
    <div
      className={`rounded-lg border transition-all duration-150 ${
        selected
          ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20"
          : "border-gray-800 bg-gray-900 hover:border-gray-700"
      }`}
    >
      <button
        onClick={onClick}
        className="flex flex-col items-start gap-2 p-4 text-left w-full"
      >
        <div className="flex items-start justify-between w-full">
          <div className="text-sm font-medium text-gray-100">{template.name}</div>
          <Badge variant={variant} size="sm">{template.category.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            ~{messages} msgs
          </span>
          {loops > 0 && (
            <span className="flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              {loops} loop{loops > 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {template.repetitions}x
          </span>
          {template.delayBetweenMs > 0 && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {template.delayBetweenMs}ms
            </span>
          )}
        </div>
      </button>

      {/* Preview toggle */}
      <div className="border-t border-gray-800">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPreview(!showPreview);
          }}
          className="flex items-center gap-1.5 w-full px-4 py-1.5 text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
        >
          {showPreview ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Preview flow
        </button>
        {showPreview && (
          <div className="px-4 pb-3 space-y-1 animate-fadeIn">
            {template.flowConfig.map((step: any, i: number) => (
              <FlowStepPreview key={i} step={step} depth={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowStepPreview({ step, depth }: { step: any; depth: number }) {
  const indent = depth * 16;

  if (step.type === "message") {
    const content = step.content || step.config?.content || "";
    return (
      <div className="flex items-start gap-2 text-xs" style={{ paddingLeft: indent }}>
        <MessageSquare className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
        <span className="text-gray-400 truncate">{content.slice(0, 80)}{content.length > 80 ? "..." : ""}</span>
      </div>
    );
  }

  if (step.type === "loop") {
    const iterations = step.iterations || step.config?.iterations || 1;
    const nested = step.steps || step.config?.steps || [];
    return (
      <div style={{ paddingLeft: indent }}>
        <div className="flex items-center gap-2 text-xs">
          <Repeat className="h-3 w-3 text-purple-400 shrink-0" />
          <span className="text-purple-400">Loop {iterations}x</span>
        </div>
        <div className="ml-2 border-l border-gray-800 pl-2 mt-1 space-y-1">
          {nested.map((s: any, i: number) => (
            <FlowStepPreview key={i} step={s} depth={0} />
          ))}
        </div>
      </div>
    );
  }

  if (step.type === "conditional") {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ paddingLeft: indent }}>
        <span className="text-amber-400">Branch</span>
        <span className="text-gray-500">({step.condition || step.config?.condition || "condition"})</span>
      </div>
    );
  }

  return null;
}
