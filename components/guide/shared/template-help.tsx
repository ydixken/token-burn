"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";

export function TemplateHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
        <span>How do templates work?</span>
        <span className="ml-auto">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-4 text-xs bg-gray-950/30">
          {/* Section 1: Request Template */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-200">Request Template &mdash; The Outgoing Message</h4>
            <p className="text-gray-500">
              Defines the JSON body sent to your chatbot API. Krawall needs to know{" "}
              <strong className="text-gray-300">where to insert</strong> each test message into the payload.
            </p>

            <div className="rounded-md bg-gray-900 border border-gray-800 p-3 font-mono text-[11px] leading-relaxed">
              <div className="text-gray-600">{"// structure (the base payload)"}</div>
              <div className="text-gray-300">{"{"}</div>
              <div className="text-gray-300 pl-4">{'"model": "gpt-4",'}</div>
              <div className="text-gray-300 pl-4">{'"messages": [{'}</div>
              <div className="text-gray-300 pl-8">{'"role": "user",'}</div>
              <div className="pl-8">
                <span className="text-gray-300">{'"content": '}</span>
                <span className="text-blue-400 bg-blue-500/10 px-1 rounded">{'"Hello, how are you?"'}</span>
              </div>
              <div className="text-gray-300 pl-4">{"}]"}</div>
              <div className="text-gray-300">{"}"}</div>
              <div className="mt-2 text-gray-600 border-t border-gray-800 pt-2">
                {"messagePath: "}<span className="text-blue-400">{'"messages.0.content"'}</span>
                {" \u2190 tells Krawall which field to fill"}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-gray-500">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
                <span>
                  <strong className="text-gray-300">messagePath</strong> is a dot-notation path to the field
                  where the test message gets injected. Array indices use numbers:{" "}
                  <code className="text-gray-300">.0</code> = first element.
                </span>
              </div>
              <div className="flex items-start gap-2 text-gray-500">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
                <span>
                  <strong className="text-gray-300">structure</strong> is the base JSON payload. Krawall
                  clones it for each message, fills in the path, and sends it to your API.
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800" />

          {/* Section 2: Response Template */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-200">Response Template &mdash; Reading the Reply</h4>
            <p className="text-gray-500">
              After calling your API, Krawall receives a JSON response. The template tells it{" "}
              <strong className="text-gray-300">where to find</strong> the chatbot&apos;s answer.
            </p>

            <div className="rounded-md bg-gray-900 border border-gray-800 p-3 font-mono text-[11px] leading-relaxed">
              <div className="text-gray-600">{"// API response"}</div>
              <div className="text-gray-300">{"{"}</div>
              <div className="text-gray-300 pl-4">{'"choices": [{'}</div>
              <div className="text-gray-300 pl-8">{'"message": {'}</div>
              <div className="pl-12">
                <span className="text-gray-300">{'"content": '}</span>
                <span className="text-emerald-400 bg-emerald-500/10 px-1 rounded">{'"I\'m doing well!"'}</span>
              </div>
              <div className="text-gray-300 pl-8">{"}"}</div>
              <div className="text-gray-300 pl-4">{"}],"}</div>
              <div className="pl-4">
                <span className="text-gray-500">{'"usage": { "prompt_tokens": 10, "completion_tokens": 8 }'}</span>
              </div>
              <div className="text-gray-300">{"}"}</div>
              <div className="mt-2 text-gray-600 border-t border-gray-800 pt-2 space-y-0.5">
                <div>
                  {"contentPath: "}<span className="text-emerald-400">{'"choices.0.message.content"'}</span>
                  {" \u2190 extracts the reply"}
                </div>
                <div>
                  {"tokenUsagePath: "}<span className="text-gray-500">{'"usage"'}</span>
                  {" \u2190 extracts token metrics"}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-gray-500">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-emerald-400 shrink-0" />
                <span>
                  <strong className="text-gray-300">contentPath</strong> (required) &mdash; where to find the
                  chatbot&apos;s reply text in the response JSON.
                </span>
              </div>
              <div className="flex items-start gap-2 text-gray-500">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-gray-600 shrink-0" />
                <span>
                  <strong className="text-gray-300">tokenUsagePath</strong> (optional) &mdash; path to the
                  token usage object for cost tracking and metrics.
                </span>
              </div>
              <div className="flex items-start gap-2 text-gray-500">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-gray-600 shrink-0" />
                <span>
                  <strong className="text-gray-300">errorPath</strong> (optional) &mdash; path to error messages
                  so Krawall can surface API errors in the test logs.
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800" />

          {/* Section 3: Path Syntax */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-200">Path Syntax</h4>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-gray-500">
              <code className="text-gray-300">key.subkey</code>
              <span>Nested object access</span>
              <code className="text-gray-300">arr.0</code>
              <span>First array element (0-indexed)</span>
              <code className="text-gray-300">a.0.b.c</code>
              <span>Mixed nesting &mdash; arrays + objects</span>
            </div>
          </div>

          {/* Tip */}
          <div className="rounded-md bg-blue-500/5 border border-blue-500/20 px-3 py-2 text-blue-400">
            Presets fill these automatically. You only need to edit templates when using a custom API
            or when you need different request/response mapping.
          </div>
        </div>
      )}
    </div>
  );
}
