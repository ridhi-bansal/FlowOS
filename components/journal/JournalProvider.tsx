"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { JournalEntry } from "@/types";
import * as journalService from "@/lib/services/journalService";

interface JournalContextValue {
  entries: JournalEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  save: (date: string, patch: { mood?: string | null; energy?: string | null; answers: Record<string, string> }) => Promise<void>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setEntries(await journalService.listAllEntries());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const save = useCallback(
    async (date: string, patch: { mood?: string | null; energy?: string | null; answers: Record<string, string> }) => {
      const latest = await journalService.listAllEntries();
      await journalService.saveEntry(latest, date, patch);
      await refresh();
    },
    [refresh]
  );

  return <JournalContext.Provider value={{ entries, loading, refresh, save }}>{children}</JournalContext.Provider>;
}

export function useJournal(): JournalContextValue {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal must be used inside <JournalProvider>");
  return ctx;
}
