"use client";

import { Badge } from "@/components/ui/badge";
import { Wifi, Globe, Radio, Zap, Server } from "lucide-react";
import type { ProviderPreset } from "@/lib/connectors/presets";

const CONNECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  HTTP_REST: Globe,
  WEBSOCKET: Wifi,
  GRPC: Radio,
  SSE: Zap,
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "text-emerald-400",
  anthropic: "text-orange-400",
  google: "text-blue-400",
  azure: "text-cyan-400",
  ollama: "text-purple-400",
  http: "text-gray-400",
  websocket: "text-yellow-400",
  grpc: "text-red-400",
  mock: "text-blue-400",
};

interface ProviderCardProps {
  preset: ProviderPreset;
  selected: boolean;
  recommended?: boolean;
  onClick: () => void;
}

export function ProviderCard({ preset, selected, recommended, onClick }: ProviderCardProps) {
  const ConnectorIcon = CONNECTOR_ICONS[preset.connectorType] || Globe;
  const color = PROVIDER_COLORS[preset.icon] || "text-gray-400";

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all duration-150 ${
        selected
          ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20"
          : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-start justify-between w-full">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800 border border-gray-700 ${color}`}>
            <Server className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-100">{preset.name}</div>
          </div>
        </div>
        {recommended && (
          <Badge variant="info" size="sm">Recommended</Badge>
        )}
      </div>
      <p className="text-xs text-gray-500 line-clamp-2">{preset.description}</p>
      <div className="flex items-center gap-2 mt-auto">
        <Badge variant="neutral" size="sm">
          <ConnectorIcon className="h-3 w-3 mr-1" />
          {preset.connectorType}
        </Badge>
        <Badge variant="neutral" size="sm">
          {preset.authType === "NONE" ? "No Auth" : preset.authType.replace(/_/g, " ")}
        </Badge>
      </div>
    </button>
  );
}

interface MockChatbotCardProps {
  selected: boolean;
  onClick: () => void;
}

export function MockChatbotCard({ selected, onClick }: MockChatbotCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all duration-150 ${
        selected
          ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20"
          : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-start justify-between w-full">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Zap className="h-4 w-4" />
          </div>
          <div className="text-sm font-medium text-gray-100">Mock Chatbot</div>
        </div>
        <Badge variant="info" size="sm">Best for First Setup</Badge>
      </div>
      <p className="text-xs text-gray-500">
        Built-in mock server that mimics an OpenAI-compatible API. No API key required, runs locally on port 3001.
      </p>
      <div className="flex items-center gap-2 mt-auto">
        <Badge variant="neutral" size="sm">
          <Globe className="h-3 w-3 mr-1" />
          HTTP_REST
        </Badge>
        <Badge variant="neutral" size="sm">No Auth</Badge>
      </div>
    </button>
  );
}
