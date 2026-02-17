"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

const STORAGE_KEY = "wheel-tracker-selected-account";

interface SelectedAccountContextValue {
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
}

const SelectedAccountContext = createContext<SelectedAccountContextValue | null>(
  null
);

export function SelectedAccountProvider({ children }: { children: ReactNode }) {
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(
    null
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSelectedAccountIdState(stored);
    } catch {
      // localStorage not available
    }
    setHydrated(true);
  }, []);

  const setSelectedAccountId = useCallback((id: string | null) => {
    setSelectedAccountIdState(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  return (
    <SelectedAccountContext.Provider
      value={{ selectedAccountId: hydrated ? selectedAccountId : null, setSelectedAccountId }}
    >
      {children}
    </SelectedAccountContext.Provider>
  );
}

export function useSelectedAccount() {
  const ctx = useContext(SelectedAccountContext);
  if (!ctx) {
    throw new Error("useSelectedAccount must be used within SelectedAccountProvider");
  }
  return ctx;
}
