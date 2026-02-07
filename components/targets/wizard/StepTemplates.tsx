"use client";

import { useState } from "react";
import Link from "next/link";
import type { WizardData } from "./types";

interface StepTemplatesProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ValidationResult {
  field: string;
  valid: boolean;
  message: string;
  suggestion?: string[];
}

export default function StepTemplates({ data, onUpdate, onNext, onBack }: StepTemplatesProps) {
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);

  const exampleResponse = data.preset?.exampleResponse || null;

  const updateRequestTemplate = (field: string, value: string) => {
    onUpdate({
      requestTemplate: {
        ...data.requestTemplate,
        [field]: value,
      },
    });
  };

  const updateResponseTemplate = (field: string, value: string | undefined) => {
    onUpdate({
      responseTemplate: {
        ...data.responseTemplate,
        [field]: value,
      },
    });
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResults(null);

    try {
      const response = await fetch("/api/templates/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTemplate: {
            messagePath: data.requestTemplate.messagePath,
            structure: data.requestTemplate.structure,
          },
          responseTemplate: {
            contentPath: data.responseTemplate.contentPath,
            tokenUsagePath: data.responseTemplate.tokenUsagePath || undefined,
            errorPath: data.responseTemplate.errorPath || undefined,
          },
          sampleResponse: exampleResponse,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setValidationResults(result.data.results);
      } else {
        setValidationResults([
          { field: "general", valid: false, message: result.error || "Validation failed" },
        ]);
      }
    } catch {
      setValidationResults([
        { field: "general", valid: false, message: "Failed to reach validation endpoint" },
      ]);
    } finally {
      setValidating(false);
    }
  };

  // Compute live preview of what will be extracted
  const getPreviewExtraction = () => {
    if (!exampleResponse) return null;

    try {
      const parts = data.responseTemplate.contentPath
        .replace(/^\$\./, "")
        .split(/[.\[\]]/)
        .filter(Boolean);

      let current: unknown = exampleResponse;
      for (const part of parts) {
        if (current === undefined || current === null) return null;
        current = (current as Record<string, unknown>)[part];
      }
      return current !== undefined && current !== null ? String(current) : null;
    } catch {
      return null;
    }
  };

  const previewContent = getPreviewExtraction();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Map Request &amp; Response
        </h2>
        <p className="text-sm text-gray-400">
          Configure how Krawall sends messages and reads responses.{" "}
          <Link
            href="/docs/templates"
            className="text-blue-400 hover:text-blue-300"
            target="_blank"
          >
            View template docs
          </Link>
        </p>
      </div>

      {/* Request Template */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 space-y-4">
        <h3 className="text-sm font-semibold text-white">Request Builder</h3>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Message Path <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.requestTemplate.messagePath}
            onChange={(e) => updateRequestTemplate("messagePath", e.target.value)}
            placeholder="e.g., messages.0.content"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            JSON path where the test message will be inserted
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Request Structure (JSON)
          </label>
          <textarea
            value={JSON.stringify(data.requestTemplate.structure, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                updateRequestTemplate("structure", parsed);
              } catch {
                // Allow editing even if temporarily invalid
              }
            }}
            rows={8}
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The base JSON payload. The message path value will be replaced before sending.
          </p>
        </div>
      </div>

      {/* Response Template */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 space-y-4">
        <h3 className="text-sm font-semibold text-white">Response Mapper</h3>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Content Path <span className="text-green-400">(content)</span>{" "}
            <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.responseTemplate.contentPath}
            onChange={(e) => updateResponseTemplate("contentPath", e.target.value)}
            placeholder="e.g., choices.0.message.content"
            className="w-full bg-gray-900 border border-green-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Token Usage Path <span className="text-blue-400">(tokens)</span>
          </label>
          <input
            type="text"
            value={data.responseTemplate.tokenUsagePath || ""}
            onChange={(e) => updateResponseTemplate("tokenUsagePath", e.target.value || undefined)}
            placeholder="e.g., usage"
            className="w-full bg-gray-900 border border-blue-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Error Path <span className="text-red-400">(errors)</span>
          </label>
          <input
            type="text"
            value={data.responseTemplate.errorPath || ""}
            onChange={(e) => updateResponseTemplate("errorPath", e.target.value || undefined)}
            placeholder="e.g., error.message"
            className="w-full bg-gray-900 border border-red-800/50 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        {/* Example Response */}
        {exampleResponse && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-400">
              Example Response from Preset
            </div>
            <pre className="bg-gray-900 rounded p-3 text-xs text-gray-400 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(exampleResponse, null, 2)}
            </pre>

            {/* Live Preview */}
            {previewContent && (
              <div className="bg-green-900/20 border border-green-800 rounded p-3">
                <div className="text-xs text-green-400 mb-1">
                  Krawall will extract:
                </div>
                <div className="text-sm text-green-300 font-medium">
                  &quot;{previewContent}&quot;
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Validate Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleValidate}
          disabled={validating}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {validating ? "Validating..." : "Validate Templates"}
        </button>

        {validationResults && (
          <div className="flex-1">
            {validationResults.map((r, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-1.5 rounded mb-1 ${
                  r.valid
                    ? "bg-green-900/20 text-green-400 border border-green-800"
                    : "bg-red-900/20 text-red-400 border border-red-800"
                }`}
              >
                {r.valid ? "OK" : "ERR"}: {r.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!data.responseTemplate.contentPath || !data.requestTemplate.messagePath}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          Next: Review &amp; Save
        </button>
      </div>
    </div>
  );
}
