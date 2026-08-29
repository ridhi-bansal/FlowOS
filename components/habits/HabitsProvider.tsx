"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Habit, HabitLog } from "@/types";
import * as habitService from "@/lib/services/habitService";
import type { NewHabitInput } from "@/lib/services/habitService";

interface HabitsContextValue {
  habits: Habit[];
  logs: HabitLog[];
  loading: boolean;
  refresh: () => Promise<void>;
  addHabit: (input: NewHabitInput) => Promise<Habit>;
  editHabit: (id: string, patch: Partial<Habit>) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  removeHabit: (id: string) => Promise<void>;
  toggleToday: (habitId: string) => Promise<void>;
}

const HabitsContext = createContext<HabitsContextValue | null>(null);

export function HabitsProvider({ children }: { children: React.ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [h, l] = await Promise.all([habitService.listAllHabits(), habitService.listAllHabitLogs()]);
    setHabits(h);
    setLogs(l);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addHabit = useCallback(async (input: NewHabitInput) => {
    const created = await habitService.createHabit(input);
    await refresh();
    return created;
  }, [refresh]);

  const editHabit = useCallback(async (id: string, patch: Partial<Habit>) => {
    await habitService.updateHabit(id, patch);
    await refresh();
  }, [refresh]);

  const archiveHabit = useCallback(async (id: string) => {
    await habitService.archiveHabit(id);
    await refresh();
  }, [refresh]);

  const removeHabit = useCallback(async (id: string) => {
    await habitService.deleteHabit(id);
    await refresh();
  }, [refresh]);

  const toggleToday = useCallback(async (habitId: string) => {
    await habitService.toggleTodayLog(habitId);
    await refresh();
  }, [refresh]);

  return (
    <HabitsContext.Provider value={{ habits, logs, loading, refresh, addHabit, editHabit, archiveHabit, removeHabit, toggleToday }}>
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits(): HabitsContextValue {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error("useHabits must be used inside <HabitsProvider>");
  return ctx;
}
