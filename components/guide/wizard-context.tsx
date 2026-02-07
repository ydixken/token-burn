"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

const STORAGE_KEY = "krawall-guide-v2";

export interface WizardState {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  createdTargetId: string | null;
  createdScenarioId: string | null;
  createdSessionId: string | null;
  selectedPresetId: string | null;
  selectedTemplateId: string | null;
  completedAt: string | null;
}

export interface NavProps {
  canProceed?: boolean;
  showSkip?: boolean;
  nextLabel?: string;
  onNext?: () => void;
}

interface WizardContextValue extends WizardState {
  totalSteps: number;
  goNext: () => void;
  goBack: () => void;
  goToStep: (n: number) => void;
  markComplete: (n: number) => void;
  skip: (n: number) => void;
  isComplete: (n: number) => boolean;
  isSkipped: (n: number) => boolean;
  setCreatedTargetId: (id: string) => void;
  setCreatedScenarioId: (id: string) => void;
  setCreatedSessionId: (id: string) => void;
  setSelectedPresetId: (id: string | null) => void;
  setSelectedTemplateId: (id: string | null) => void;
  resetWizard: () => void;
  navProps: NavProps;
  setNavProps: (props: NavProps) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within WizardProvider");
  return ctx;
}

const TOTAL_STEPS = 8;

const defaultState: WizardState = {
  currentStep: 0,
  completedSteps: [],
  skippedSteps: [],
  createdTargetId: null,
  createdScenarioId: null,
  createdSessionId: null,
  selectedPresetId: null,
  selectedTemplateId: null,
  completedAt: null,
};

function loadState(): WizardState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultState, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...defaultState };
}

function saveState(state: WizardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [navProps, setNavProps] = useState<NavProps>({ canProceed: true });

  useEffect(() => {
    const restored = loadState();
    setState(restored);
    setLoaded(true);

    // Verify saved resource IDs still exist
    (async () => {
      if (restored.createdTargetId) {
        try {
          const res = await fetch("/api/targets");
          const data = await res.json();
          if (data.success) {
            const exists = data.data?.some?.((t: any) => t.id === restored.createdTargetId);
            if (!exists) {
              setState((prev) => {
                const next = { ...prev, createdTargetId: null };
                saveState(next);
                return next;
              });
            }
          }
        } catch {
          // Network error - keep existing state
        }
      }
      if (restored.createdScenarioId) {
        try {
          const res = await fetch("/api/scenarios");
          const data = await res.json();
          if (data.success) {
            const exists = data.data?.some?.((s: any) => s.id === restored.createdScenarioId);
            if (!exists) {
              setState((prev) => {
                const next = { ...prev, createdScenarioId: null };
                saveState(next);
                return next;
              });
            }
          }
        } catch {
          // Network error - keep existing state
        }
      }
      // Small delay to let the individual setState calls settle
      setTimeout(() => {
        setState((prev) => {
          if (!prev.createdTargetId && !prev.createdScenarioId && prev.completedSteps.length > 0) {
            const fresh = { ...defaultState };
            saveState(fresh);
            return fresh;
          }
          return prev;
        });
      }, 100);
    })();
  }, []);

  const persist = useCallback((next: WizardState) => {
    setState(next);
    saveState(next);
  }, []);

  const goNext = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, currentStep: Math.min(prev.currentStep + 1, TOTAL_STEPS - 1) };
      saveState(next);
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, currentStep: Math.max(prev.currentStep - 1, 0) };
      saveState(next);
      return next;
    });
  }, []);

  const goToStep = useCallback((n: number) => {
    setState((prev) => {
      const next = { ...prev, currentStep: Math.max(0, Math.min(n, TOTAL_STEPS - 1)) };
      saveState(next);
      return next;
    });
  }, []);

  const markComplete = useCallback((n: number) => {
    setState((prev) => {
      if (prev.completedSteps.includes(n)) return prev;
      const next = { ...prev, completedSteps: [...prev.completedSteps, n] };
      saveState(next);
      return next;
    });
  }, []);

  const skip = useCallback((n: number) => {
    setState((prev) => {
      if (prev.skippedSteps.includes(n)) return prev;
      const next = {
        ...prev,
        skippedSteps: [...prev.skippedSteps, n],
        currentStep: Math.min(prev.currentStep + 1, TOTAL_STEPS - 1),
      };
      saveState(next);
      return next;
    });
  }, []);

  const isComplete = useCallback(
    (n: number) => state.completedSteps.includes(n),
    [state.completedSteps]
  );

  const isSkipped = useCallback(
    (n: number) => state.skippedSteps.includes(n),
    [state.skippedSteps]
  );

  const setCreatedTargetId = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, createdTargetId: id };
      saveState(next);
      return next;
    });
  }, []);

  const setCreatedScenarioId = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, createdScenarioId: id };
      saveState(next);
      return next;
    });
  }, []);

  const setCreatedSessionId = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, createdSessionId: id };
      saveState(next);
      return next;
    });
  }, []);

  const setSelectedPresetId = useCallback((id: string | null) => {
    setState((prev) => {
      const next = { ...prev, selectedPresetId: id };
      saveState(next);
      return next;
    });
  }, []);

  const setSelectedTemplateId = useCallback((id: string | null) => {
    setState((prev) => {
      const next = { ...prev, selectedTemplateId: id };
      saveState(next);
      return next;
    });
  }, []);

  const resetWizard = useCallback(() => {
    persist({ ...defaultState });
  }, [persist]);

  if (!loaded) return null;

  return (
    <WizardContext.Provider
      value={{
        ...state,
        totalSteps: TOTAL_STEPS,
        goNext,
        goBack,
        goToStep,
        markComplete,
        skip,
        isComplete,
        isSkipped,
        setCreatedTargetId,
        setCreatedScenarioId,
        setCreatedSessionId,
        setSelectedPresetId,
        setSelectedTemplateId,
        resetWizard,
        navProps,
        setNavProps,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}
