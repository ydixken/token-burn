export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  connectorType: string;
  defaultEndpoint: string;
  authType: string;
  authFields: AuthField[];
  requestTemplate: {
    messagePath: string;
    structure: Record<string, unknown>;
    variables?: Record<string, unknown>;
  };
  responseTemplate: {
    responsePath: string;
    tokenUsagePath?: string;
    errorPath?: string;
  };
  documentation: string;
  exampleResponse: Record<string, unknown>;
}

export interface AuthField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface WizardData {
  // Step 1: Provider
  presetId: string | null;
  preset: ProviderPreset | null;

  // Step 2: Connection
  name: string;
  endpoint: string;
  authType: string;
  authConfig: Record<string, unknown>;
  connectorType: string;

  // Step 3: Templates
  requestTemplate: {
    messagePath: string;
    structure: Record<string, unknown>;
    variables?: Record<string, unknown>;
  };
  responseTemplate: {
    responsePath: string;
    tokenUsagePath?: string;
    errorPath?: string;
  };

  // Browser WebSocket protocol config (when connectorType is BROWSER_WEBSOCKET)
  protocolConfig?: Record<string, unknown>;
}

export const INITIAL_WIZARD_DATA: WizardData = {
  presetId: null,
  preset: null,
  name: "",
  endpoint: "",
  authType: "NONE",
  authConfig: {},
  connectorType: "HTTP_REST",
  requestTemplate: {
    messagePath: "message",
    structure: { message: "" },
  },
  responseTemplate: {
    responsePath: "response",
  },
  protocolConfig: undefined,
};
