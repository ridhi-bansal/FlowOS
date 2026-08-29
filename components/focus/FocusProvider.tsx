"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { FocusSession } from "@/types";
import * as focusService from "@/lib/services/focusService";
import type { StartSessionInput } from "@/lib/services/focusService";

interface FocusContextValue {
  sessions: FocusSession[];
  loading: boolean;
  activeSession: FocusSession | null;
  refresh: () => Promise<void>;
  start: (input: StartSessionInput) => Promise<FocusSession>;
  complete: (id: string, actualMinutes: number, rating?: number | null, reflection?: string | null) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSessions(await focusService.listAllSessions());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const start = useCallback(async (input: StartSessionInput) => {
    const created = await focusService.startSession(input);
    await refresh();
    return created;
  }, [refresh]);

  const complete = useCallback(async (id: string, actualMinutes: number, rating?: number | null, reflection?: string | null) => {
    await focusService.completeSession(id, actualMinutes, rating, reflection);
    await refresh();
  }, [refresh]);

  const cancel = useCallback(async (id: string) => {
    await focusService.cancelSession(id);
    await refresh();
  }, [refresh]);

  const activeSession = focusService.getActiveSession(sessions);

  return (
    <FocusContext.Provider value={{ sessions, loading, activeSession, refresh, start, complete, cancel }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocus must be used inside <FocusProvider>");
  return ctx;
}
