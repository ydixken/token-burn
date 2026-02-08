"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Copy, Check, AlertCircle, CheckCircle2 } from "lucide-react";

interface RawResponseViewerProps {
  rawResponse: unknown;
  extractedContent?: string;
  currentResponsePath?: string;
  onSelectPath?: (path: string) => void;
}

function suggestPaths(obj: unknown, prefix = ""): Array<{ path: string; value: string }> {
  const suggestions: Array<{ path: string; value: string }> = [];
  if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        suggestions.push({ path: fullPath, value: value.substring(0, 80) });
      } else if (typeof value === "number" || typeof value === "boolean") {
        suggestions.push({ path: fullPath, value: String(value) });
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        suggestions.push(...suggestPaths(value, fullPath));
      } else if (Array.isArray(value)) {
        suggestions.push({ path: fullPath, value: `[Array: ${value.length} items]` });
      }
    }
  }
  return suggestions;
}

function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/^\$\./, "").split(/[.\[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function RawResponseViewer({
  rawResponse,
  extractedContent,
  currentResponsePath,
  onSelectPath,
}: RawResponseViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const paths = useMemo(() => suggestPaths(rawResponse), [rawResponse]);

  const currentPathResolved = useMemo(() => {
    if (!currentResponsePath) return null;
    const value = getValueAtPath(rawResponse, currentResponsePath);
    return value !== undefined ? String(value).substring(0, 100) : null;
  }, [rawResponse, currentResponsePath]);

  const handleCopy = async (path: string) => {
    await navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  if (!rawResponse) return null;

  return (
    <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm font-medium text-gray-300">Raw Response</span>
        </div>
        <span className="text-xs text-gray-500">{paths.length} fields</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* JSON viewer */}
          <div className="rounded bg-gray-900 border border-gray-700 overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Decoded Response</span>
            </div>
            <pre className="p-3 text-xs text-gray-300 font-mono overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </div>

          {/* Current path validation */}
          {currentResponsePath && (
            <div className={`flex items-start gap-2 text-xs rounded-lg p-3 ${
              currentPathResolved !== null
                ? "bg-emerald-900/20 border border-emerald-800/30"
                : "bg-red-900/20 border border-red-800/30"
            }`}>
              {currentPathResolved !== null ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Current path:</span>
                  <code className="px-1 py-0.5 rounded bg-gray-800 text-gray-300 font-mono">{currentResponsePath}</code>
                  {currentPathResolved !== null ? (
                    <span className="text-emerald-400">Found</span>
                  ) : (
                    <span className="text-red-400">Not found</span>
                  )}
                </div>
                {currentPathResolved !== null && (
                  <div className="mt-1 text-gray-500 truncate max-w-md">
                    Value: &quot;{currentPathResolved}&quot;
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Path suggestions */}
          {paths.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2">
                {onSelectPath ? "Click a path to use it as your response template:" : "Available paths:"}
              </div>
              <div className="space-y-1">
                {paths.filter(p => typeof p.value === "string" && p.value.length > 0 && !p.value.startsWith("[Array")).map((suggestion) => (
                  <div
                    key={suggestion.path}
                    className={`flex items-center gap-2 text-xs rounded px-2.5 py-1.5 bg-gray-900 border border-gray-700 group ${
                      onSelectPath ? "cursor-pointer hover:border-blue-600 hover:bg-blue-900/10" : ""
                    }`}
                    onClick={() => onSelectPath?.(suggestion.path)}
                  >
                    <code className="font-mono text-blue-400 flex-shrink-0">{suggestion.path}</code>
                    <span className="text-gray-600 flex-shrink-0">&rarr;</span>
                    <span className="text-gray-400 truncate">&quot;{suggestion.value}&quot;</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(suggestion.path);
                      }}
                      className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-700"
                      title="Copy path"
                    >
                      {copiedPath === suggestion.path ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-gray-500" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted content preview */}
          {extractedContent && (
            <div className="rounded bg-gray-900 border border-gray-700 overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Extracted Content</span>
              </div>
              <div className="p-3 text-xs text-emerald-300 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                {extractedContent}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
