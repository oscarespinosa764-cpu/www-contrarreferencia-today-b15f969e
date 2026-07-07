import { createContext, useContext, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  getPracticeSnapshot,
  isPracticeActive,
  setPracticeActive,
  subscribePractice,
} from "@/lib/practice-store";

interface PracticeContextValue {
  active: boolean;
  toggle: () => void;
  setActive: (v: boolean) => void;
}

const PracticeContext = createContext<PracticeContextValue | undefined>(undefined);

export function PracticeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const active = useSyncExternalStore(
    subscribePractice,
    getPracticeSnapshot,
    () => false, // SSR: nunca activo en el servidor
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries();
    router.invalidate();
  }, [queryClient, router]);

  const setActive = useCallback(
    (v: boolean) => {
      setPracticeActive(v);
      refresh();
    },
    [refresh],
  );

  const toggle = useCallback(() => {
    setActive(!isPracticeActive());
  }, [setActive]);

  return (
    <PracticeContext.Provider value={{ active, toggle, setActive }}>
      {children}
    </PracticeContext.Provider>
  );
}

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice debe usarse dentro de PracticeProvider");
  return ctx;
}
