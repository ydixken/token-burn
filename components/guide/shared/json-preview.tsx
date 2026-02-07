"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface JsonPreviewProps {
  data: unknown;
  title?: string;
  defaultOpen?: boolean;
  maskKeys?: string[];
}

export function JsonPreview({ data, title = "JSON Preview", defaultOpen = false, maskKeys = [] }: JsonPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const formatted = JSON.stringify(data, (key, value) => {
    if (maskKeys.includes(key) && typeof value === "string" && value.length > 0) {
      return "***";
    }
    return value;
  }, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && (
        <div className="relative border-t border-gray-800">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className="p-3 text-xs text-gray-300 font-mono overflow-x-auto max-h-80 overflow-y-auto bg-gray-950/50">
            {formatted}
          </pre>
        </div>
      )}
    </div>
  );
}
