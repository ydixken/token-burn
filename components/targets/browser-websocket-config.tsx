"use client";

import { useState } from "react";
import type {
  BrowserWebSocketProtocolConfig,
  WidgetHints,
  InteractionStep,
} from "@/lib/connectors/browser/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  GripVertical,
  HelpCircle,
  Globe,
  Info,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Chip-based tag input for string arrays */
function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t} variant="info" size="sm">
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="ml-1 hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] bg-transparent border-none text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
      />
    </div>
  );
}

/** Key-value pair editor for data attributes */
function KeyValueEditor({
  pairs,
  onChange,
}: {
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
}) {
  const entries = Object.entries(pairs);

  const update = (oldKey: string, newKey: string, value: string) => {
    const next = { ...pairs };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = value;
    onChange(next);
  };

  const remove = (key: string) => {
    const next = { ...pairs };
    delete next[key];
    onChange(next);
  };

  const add = () => {
    onChange({ ...pairs, "": "" });
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={key}
            onChange={(e) => update(key, e.target.value, value)}
            placeholder="data-attribute"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={value}
            onChange={(e) => update(key, key, e.target.value)}
            placeholder="value"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => remove(key)}
            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add} type="button">
        <Plus className="h-3 w-3 mr-1" />
        Add Attribute
      </Button>
    </div>
  );
}

/** Collapsible section wrapper */
function Section({
  title,
  label,
  defaultOpen = false,
  children,
}: {
  title: string;
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{title}</span>
          {label && (
            <Badge variant="neutral" size="sm">
              {label}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

/** Interaction step editor row */
function StepRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: InteractionStep;
  index: number;
  onChange: (step: InteractionStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border border-gray-800 bg-gray-900">
      <div className="flex items-center pt-2 text-gray-600">
        <GripVertical className="h-4 w-4" />
        <span className="text-[10px] font-mono ml-0.5">{index + 1}</span>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2">
        <select
          value={step.action}
          onChange={(e) =>
            onChange({
              ...step,
              action: e.target.value as InteractionStep["action"],
            })
          }
          className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="click">Click</option>
          <option value="type">Type</option>
          <option value="wait">Wait (ms)</option>
          <option value="waitForSelector">Wait for Selector</option>
          <option value="evaluate">Evaluate JS</option>
        </select>
        {step.action !== "wait" && step.action !== "evaluate" && (
          <input
            value={step.selector || ""}
            onChange={(e) => onChange({ ...step, selector: e.target.value })}
            placeholder="CSS selector"
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
        {step.action === "evaluate" && (
          <input
            value={step.script || ""}
            onChange={(e) => onChange({ ...step, script: e.target.value })}
            placeholder="JavaScript code"
            className="col-span-2 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
        {(step.action === "type" || step.action === "wait") && (
          <input
            value={step.value || ""}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
            placeholder={step.action === "wait" ? "Duration (ms)" : "Text to type"}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 mt-1 text-gray-500 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BrowserWebSocketConfigProps {
  config: BrowserWebSocketProtocolConfig;
  onChange: (config: BrowserWebSocketProtocolConfig) => void;
}

export function BrowserWebSocketConfig({
  config,
  onChange,
}: BrowserWebSocketConfigProps) {
  const strategy = config.widgetDetection.strategy;
  const hints = config.widgetDetection.hints || {};

  // Helpers to update nested state immutably
  const setPageUrl = (pageUrl: string) => onChange({ ...config, pageUrl });

  const setStrategy = (s: typeof strategy) =>
    onChange({
      ...config,
      widgetDetection: { ...config.widgetDetection, strategy: s },
    });

  const setSelector = (selector: string) =>
    onChange({
      ...config,
      widgetDetection: { ...config.widgetDetection, selector },
    });

  const setSteps = (steps: InteractionStep[]) =>
    onChange({
      ...config,
      widgetDetection: { ...config.widgetDetection, steps },
    });

  const setTimeout_ = (timeout: number) =>
    onChange({
      ...config,
      widgetDetection: { ...config.widgetDetection, timeout },
    });

  const setHints = (patch: Partial<WidgetHints>) =>
    onChange({
      ...config,
      widgetDetection: {
        ...config.widgetDetection,
        hints: { ...hints, ...patch },
      },
    });

  const setWsFilter = (patch: Partial<NonNullable<typeof config.wsFilter>>) =>
    onChange({
      ...config,
      wsFilter: { ...config.wsFilter, ...patch },
    });

  const setBrowser = (patch: Partial<NonNullable<typeof config.browser>>) =>
    onChange({
      ...config,
      browser: { ...config.browser, ...patch },
    });

  const setProtocol = (patch: Partial<NonNullable<typeof config.protocol>>) =>
    onChange({
      ...config,
      protocol: { ...config.protocol, ...patch },
    });

  const setSession = (patch: Partial<NonNullable<typeof config.session>>) =>
    onChange({
      ...config,
      session: { ...config.session, ...patch },
    });

  return (
    <div className="space-y-4">
      {/* Section 1: Page URL — always visible */}
      <div className="space-y-1.5">
        <Input
          label="Page URL"
          value={config.pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="https://www.example.com/support"
          helper="The URL of the web page that contains the chat widget (not the WebSocket URL)"
        />
      </div>

      {/* Section 2: Widget Detection */}
      <Section title="Widget Detection" defaultOpen>
        {/* Strategy picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 block">
            Detection Strategy
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {
                  value: "heuristic",
                  label: "Heuristic",
                  desc: "Recommended",
                },
                { value: "selector", label: "CSS Selector", desc: "Direct" },
                { value: "steps", label: "Interaction Steps", desc: "Scripted" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStrategy(opt.value)}
                className={`flex flex-col items-center gap-0.5 rounded-md border px-3 py-2 text-xs transition-colors ${
                  strategy === opt.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-[10px] text-gray-500">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Heuristic hints */}
        {strategy === "heuristic" && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <HelpCircle className="h-3.5 w-3.5" />
              <span>
                Provide hints to help the heuristic engine find the chat widget.
                All fields are optional.
              </span>
            </div>

            {/* buttonText */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Button Text
              </label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                <TagInput
                  tags={hints.buttonText || []}
                  onChange={(buttonText) => setHints({ buttonText })}
                  placeholder='e.g. "Jetzt Chatten" then Enter'
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Text visible on the chat launch button
              </p>
            </div>

            {/* containsClass */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                CSS Class Fragments
              </label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                <TagInput
                  tags={hints.containsClass || []}
                  onChange={(containsClass) => setHints({ containsClass })}
                  placeholder='e.g. "chat-widget"'
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Partial class names to match on widget elements
              </p>
            </div>

            {/* containsId */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                ID Fragments
              </label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                <TagInput
                  tags={hints.containsId || []}
                  onChange={(containsId) => setHints({ containsId })}
                  placeholder='e.g. "chat-button"'
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Partial element IDs to match
              </p>
            </div>

            {/* iframeSrc */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Iframe Src Fragments
              </label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                <TagInput
                  tags={hints.iframeSrc || []}
                  onChange={(iframeSrc) => setHints({ iframeSrc })}
                  placeholder='e.g. "intercom"'
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Partial iframe src matches for embedded widgets
              </p>
            </div>

            {/* position */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Widget Position
              </label>
              <select
                value={hints.position || ""}
                onChange={(e) =>
                  setHints({
                    position: (e.target.value || undefined) as WidgetHints["position"],
                  })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Any position</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="custom">Custom</option>
              </select>
              <p className="text-[10px] text-gray-600">
                Expected screen position of the chat widget
              </p>
            </div>

            {/* elementType */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Element Type
              </label>
              <select
                value={hints.elementType || ""}
                onChange={(e) =>
                  setHints({
                    elementType: (e.target.value || undefined) as WidgetHints["elementType"],
                  })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Any element</option>
                <option value="button">Button</option>
                <option value="div">Div</option>
                <option value="a">Anchor (a)</option>
                <option value="iframe">Iframe</option>
                <option value="any">Any</option>
              </select>
              <p className="text-[10px] text-gray-600">
                HTML element type of the chat trigger
              </p>
            </div>

            {/* withinSelector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Container Selector
              </label>
              <input
                value={hints.withinSelector || ""}
                onChange={(e) =>
                  setHints({ withinSelector: e.target.value || undefined })
                }
                placeholder="#chat-container, .widget-wrapper"
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[10px] text-gray-600">
                Scope detection to elements within this CSS selector
              </p>
            </div>

            {/* dataAttributes */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Data Attributes
              </label>
              <KeyValueEditor
                pairs={hints.dataAttributes || {}}
                onChange={(dataAttributes) => setHints({ dataAttributes })}
              />
              <p className="text-[10px] text-gray-600">
                Match elements with specific data-* attributes
              </p>
            </div>
          </div>
        )}

        {/* CSS Selector strategy */}
        {strategy === "selector" && (
          <div className="space-y-1 pt-1">
            <label className="text-xs font-medium text-gray-400 block">
              CSS Selector
            </label>
            <input
              value={config.widgetDetection.selector || ""}
              onChange={(e) => setSelector(e.target.value)}
              placeholder='e.g. button[data-testid="chat-open"]'
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600">
              A CSS selector that directly targets the chat widget trigger
              element
            </p>
          </div>
        )}

        {/* Interaction Steps strategy */}
        {strategy === "steps" && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Info className="h-3.5 w-3.5" />
              <span>
                Define a sequence of browser actions to open the chat widget.
              </span>
            </div>
            {(config.widgetDetection.steps || []).map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                onChange={(updated) => {
                  const next = [...(config.widgetDetection.steps || [])];
                  next[i] = updated;
                  setSteps(next);
                }}
                onRemove={() => {
                  const next = (config.widgetDetection.steps || []).filter(
                    (_, j) => j !== i
                  );
                  setSteps(next);
                }}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() =>
                setSteps([
                  ...(config.widgetDetection.steps || []),
                  { action: "click", selector: "" },
                ])
              }
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Step
            </Button>
          </div>
        )}

        {/* Detection timeout */}
        <div className="space-y-1 pt-1">
          <label className="text-xs font-medium text-gray-400 block">
            Detection Timeout (ms)
          </label>
          <input
            type="number"
            value={config.widgetDetection.timeout ?? 15000}
            onChange={(e) => setTimeout_(Number(e.target.value))}
            min={1000}
            step={1000}
            className="w-32 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-gray-600">
            Maximum time to wait for the widget to appear
          </p>
        </div>
      </Section>

      {/* Section 3: WebSocket Filter */}
      <Section title="WebSocket Filter">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
          <Info className="h-3.5 w-3.5" />
          <span>
            Filter which captured WebSocket connection to use if the page opens
            multiple connections.
          </span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 block">
              URL Pattern (regex)
            </label>
            <input
              value={config.wsFilter?.urlPattern || ""}
              onChange={(e) =>
                setWsFilter({ urlPattern: e.target.value || undefined })
              }
              placeholder="e.g. wss://.*chat.*"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600">
              Regex to match the desired WebSocket URL
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 block">
              Connection Index
            </label>
            <input
              type="number"
              value={config.wsFilter?.index ?? 0}
              onChange={(e) => setWsFilter({ index: Number(e.target.value) })}
              min={0}
              className="w-24 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600">
              If multiple connections match, which one to use (0 = first)
            </p>
          </div>
        </div>
      </Section>

      {/* Section 4: Protocol */}
      <Section title="Protocol">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 block">
              Protocol Type
            </label>
            <select
              value={config.protocol?.type || "auto"}
              onChange={(e) =>
                setProtocol({
                  type: e.target.value as "auto" | "socket.io" | "raw",
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="auto">Auto-Detect</option>
              <option value="socket.io">Socket.IO</option>
              <option value="raw">Raw WebSocket</option>
            </select>
          </div>
          {config.protocol?.type === "socket.io" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Socket.IO Version
              </label>
              <select
                value={config.protocol?.socketIo?.version ?? 4}
                onChange={(e) =>
                  setProtocol({
                    socketIo: { version: Number(e.target.value) as 3 | 4 },
                  })
                }
                className="w-40 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={3}>v3</option>
                <option value={4}>v4</option>
              </select>
            </div>
          )}
        </div>
      </Section>

      {/* Section 5: Browser Settings (Advanced) */}
      <Section title="Browser Settings" label="Advanced">
        <div className="space-y-3">
          {/* Headless */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={config.browser?.headless !== false}
              onChange={(e) => setBrowser({ headless: e.target.checked })}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
            />
            Run headless (no visible browser window)
          </label>

          {/* Viewport */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Viewport Width
              </label>
              <input
                type="number"
                value={config.browser?.viewport?.width ?? 1280}
                onChange={(e) =>
                  setBrowser({
                    viewport: {
                      width: Number(e.target.value),
                      height: config.browser?.viewport?.height ?? 720,
                    },
                  })
                }
                min={320}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-400 block">
                Viewport Height
              </label>
              <input
                type="number"
                value={config.browser?.viewport?.height ?? 720}
                onChange={(e) =>
                  setBrowser({
                    viewport: {
                      width: config.browser?.viewport?.width ?? 1280,
                      height: Number(e.target.value),
                    },
                  })
                }
                min={240}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* User Agent */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 block">
              User Agent
            </label>
            <input
              value={config.browser?.userAgent || ""}
              onChange={(e) =>
                setBrowser({ userAgent: e.target.value || undefined })
              }
              placeholder="Custom user agent (leave empty for default)"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Proxy */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 block">
              Proxy
            </label>
            <input
              value={config.browser?.proxy?.server || ""}
              onChange={(e) =>
                setBrowser({
                  proxy: {
                    ...config.browser?.proxy,
                    server: e.target.value,
                  },
                })
              }
              placeholder="http://proxy.example.com:8080"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={config.browser?.proxy?.username || ""}
                onChange={(e) =>
                  setBrowser({
                    proxy: {
                      server: config.browser?.proxy?.server || "",
                      ...config.browser?.proxy,
                      username: e.target.value || undefined,
                    },
                  })
                }
                placeholder="Proxy username"
                className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="password"
                value={config.browser?.proxy?.password || ""}
                onChange={(e) =>
                  setBrowser({
                    proxy: {
                      server: config.browser?.proxy?.server || "",
                      ...config.browser?.proxy,
                      password: e.target.value || undefined,
                    },
                  })
                }
                placeholder="Proxy password"
                className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Session max age */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 block">
              Session Max Age (ms)
            </label>
            <input
              type="number"
              value={config.session?.maxAge ?? 300000}
              onChange={(e) => setSession({ maxAge: Number(e.target.value) })}
              min={10000}
              step={10000}
              className="w-40 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600">
              Re-discover the WebSocket URL after this many milliseconds
              (default: 300000 = 5min)
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

/** Default empty config for initializing new Browser WebSocket targets */
export function defaultBrowserWsConfig(): BrowserWebSocketProtocolConfig {
  return {
    pageUrl: "",
    widgetDetection: {
      strategy: "heuristic",
      timeout: 15000,
      hints: {},
    },
  };
}
