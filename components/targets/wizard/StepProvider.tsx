"use client";

import { useState, useEffect } from "react";
import type { ProviderPreset, WizardData } from "./types";

interface StepProviderProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: "O",
  anthropic: "A",
  google: "G",
  azure: "Az",
  ollama: "Ol",
  http: "H",
  websocket: "WS",
  grpc: "gR",
  browser: "Br",
};

export default function StepProvider({ data, onUpdate, onNext }: StepProviderProps) {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const response = await fetch("/api/presets");
      const result = await response.json();
      if (result.success) {
        setPresets(result.data);
      } else {
        setError("Failed to load presets");
      }
    } catch {
      setError("Failed to load presets");
    } finally {
      setLoading(false);
    }
  };

  const selectPreset = (preset: ProviderPreset) => {
    onUpdate({
      presetId: preset.id,
      preset,
      name: "",
      endpoint: preset.defaultEndpoint,
      authType: preset.authType,
      authConfig: {},
      connectorType: preset.connectorType,
      requestTemplate: preset.requestTemplate,
      responseTemplate: preset.responseTemplate,
    });
  };

  const handleNext = () => {
    if (data.presetId) {
      onNext();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading providers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Choose a Provider</h2>
        <p className="text-sm text-gray-400">
          Select a provider to pre-fill configuration, or choose Custom for manual setup.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset)}
            className={`text-left p-4 rounded-lg border transition-colors ${
              data.presetId === preset.id
                ? "bg-blue-900/30 border-blue-500"
                : "bg-gray-800 border-gray-700 hover:border-gray-600"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-300">
                {PROVIDER_ICONS[preset.icon] || preset.icon.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{preset.name}</div>
                <div className="text-xs text-gray-500">{preset.connectorType.replace("_", " ")}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2">{preset.description}</p>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!data.presetId}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          Next: Configure Connection
        </button>
      </div>
    </div>
  );
}
