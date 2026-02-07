"use client";

import { useState, useRef, useCallback } from "react";

// --- Export Button ---

interface ExportButtonProps {
  scenarioId: string;
  scenarioName: string;
}

export function ExportYamlButton({ scenarioId, scenarioName }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/scenarios/${scenarioId}/export`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Export API not available yet");
          return;
        }
        const data = await response.json().catch(() => null);
        setError(data?.error || "Export failed");
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      let yamlContent: string;

      if (contentType.includes("yaml") || contentType.includes("text/plain")) {
        yamlContent = await response.text();
      } else {
        // JSON response - extract yaml field or stringify
        const data = await response.json();
        yamlContent = data.yaml || data.data || JSON.stringify(data, null, 2);
      }

      // Trigger download
      const blob = new Blob([yamlContent], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scenarioName.replace(/[^a-zA-Z0-9-_]/g, "_")}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export scenario");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 rounded text-xs transition flex items-center gap-1"
        title="Export as YAML"
      >
        {exporting ? "Exporting..." : "YAML"}
      </button>
      {error && (
        <div className="absolute mt-1 text-[10px] text-red-400 bg-red-900/20 border border-red-800 rounded px-2 py-1 z-10">
          {error}
          <button onClick={() => setError(null)} className="ml-1 text-red-500">x</button>
        </div>
      )}
    </div>
  );
}

// --- Import Modal ---

interface ImportResult {
  success: boolean;
  scenarioName?: string;
  error?: string;
  details?: string[];
}

interface YamlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function YamlImportModal({ isOpen, onClose, onImported }: YamlImportModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setPreviews({});
    setResults([]);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const addFiles = useCallback(async (newFiles: File[]) => {
    const yamlFiles = newFiles.filter(
      (f) => f.name.endsWith(".yaml") || f.name.endsWith(".yml")
    );

    if (yamlFiles.length === 0) return;

    // Deduplicate by name
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = yamlFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });

    // Read previews
    for (const file of yamlFiles) {
      try {
        const content = await readFileContent(file);
        setPreviews((prev) => ({ ...prev, [file.name]: content }));
      } catch {
        // skip preview
      }
    }
  }, []);

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (files.length === 0) return;

    setImporting(true);
    setResults([]);

    const importResults: ImportResult[] = [];

    for (const file of files) {
      try {
        const content = previews[file.name] || (await readFileContent(file));

        const response = await fetch("/api/scenarios/import", {
          method: "POST",
          headers: { "Content-Type": "text/yaml" },
          body: content,
        });

        if (!response.ok) {
          if (response.status === 404) {
            importResults.push({
              success: false,
              error: `${file.name}: Import API not available yet`,
            });
            continue;
          }
          const data = await response.json().catch(() => null);
          importResults.push({
            success: false,
            error: `${file.name}: ${data?.error || "Import failed"}`,
            details: data?.details?.map((d: { message: string }) => d.message),
          });
          continue;
        }

        const data = await response.json();
        if (data.success) {
          importResults.push({
            success: true,
            scenarioName: data.data?.name || file.name,
          });
        } else {
          importResults.push({
            success: false,
            error: `${file.name}: ${data.error || "Import failed"}`,
            details: data.details?.map((d: { message: string }) => d.message),
          });
        }
      } catch {
        importResults.push({
          success: false,
          error: `${file.name}: Failed to import`,
        });
      }
    }

    setResults(importResults);
    setImporting(false);

    // If any succeeded, notify parent to refresh
    if (importResults.some((r) => r.success)) {
      onImported();
    }
  };

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Import Scenarios from YAML</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload .yaml or .yml files to create scenarios</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-lg px-2"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
              dragOver
                ? "border-blue-500 bg-blue-900/20"
                : "border-gray-600 hover:border-gray-500"
            }`}
          >
            <div className="text-gray-400 mb-3">
              <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm">Drag and drop YAML files here</p>
              <p className="text-xs text-gray-500 mt-1">or</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition"
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </div>
              {files.map((file) => (
                <div
                  key={file.name}
                  className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded font-mono">
                        YAML
                      </span>
                      <span className="text-sm text-gray-200 truncate">{file.name}</span>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(file.name)}
                      className="text-gray-500 hover:text-red-400 text-sm flex-shrink-0 ml-2"
                    >
                      x
                    </button>
                  </div>

                  {/* Preview */}
                  {previews[file.name] && (
                    <div className="border-t border-gray-700">
                      <pre className="px-3 py-2 text-[11px] text-gray-400 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {previews[file.name].substring(0, 1000)}
                        {previews[file.name].length > 1000 && "\n... (truncated)"}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400">
                Import Results:{" "}
                {successCount > 0 && <span className="text-green-400">{successCount} succeeded</span>}
                {successCount > 0 && failCount > 0 && ", "}
                {failCount > 0 && <span className="text-red-400">{failCount} failed</span>}
              </div>
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border text-sm ${
                    result.success
                      ? "bg-green-900/20 border-green-800 text-green-300"
                      : "bg-red-900/20 border-red-800 text-red-300"
                  }`}
                >
                  {result.success ? (
                    <span>Imported: {result.scenarioName}</span>
                  ) : (
                    <div>
                      <div>{result.error}</div>
                      {result.details && result.details.length > 0 && (
                        <ul className="mt-1 text-xs text-red-400 list-disc list-inside">
                          {result.details.map((d, j) => (
                            <li key={j}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            {results.length > 0 ? "Close" : "Cancel"}
          </button>
          {results.length === 0 && (
            <button
              onClick={handleImport}
              disabled={files.length === 0 || importing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition"
            >
              {importing
                ? `Importing ${files.length} file${files.length !== 1 ? "s" : ""}...`
                : `Import ${files.length} file${files.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
