"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Goal } from "@/types";
import * as goalService from "@/lib/services/goalService";
import type { NewGoalInput } from "@/lib/services/goalService";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";

interface GoalsContextValue {
  goals: Goal[];
  loading: boolean;
  refresh: () => Promise<void>;
  addGoal: (input: NewGoalInput) => Promise<Goal>;
  editGoal: (id: string, patch: Partial<Goal>) => Promise<void>;
  archiveGoal: (id: string) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

/**
 * Same pattern as Tasks/Events/Projects. Must be nested inside both
 * TasksProvider and ProjectsProvider (see app/(app)/layout.tsx) so that
 * deleting a goal — which unlinks whatever projects/tasks pointed to it —
 * can refresh both of their shared states. Without this, a project or task
 * that just lost its goal_id would keep showing a stale goal reference
 * until an unrelated mutation happened to refresh it.
 */
export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const { refresh: refreshTasks } = useTasks();
  const { refresh: refreshProjects } = useProjects();

  const refresh = useCallback(async () => {
    const all = await goalService.listAllGoals();
    setGoals(all);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addGoal = useCallback(
    async (input: NewGoalInput) => {
      const created = await goalService.createGoal(input);
      await refresh();
      return created;
    },
    [refresh]
  );

  const editGoal = useCallback(
    async (id: string, patch: Partial<Goal>) => {
      await goalService.updateGoal(id, patch);
      await refresh();
    },
    [refresh]
  );

  const archiveGoal = useCallback(
    async (id: string) => {
      await goalService.archiveGoal(id);
      await refresh();
    },
    [refresh]
  );

  const removeGoal = useCallback(
    async (id: string) => {
      await goalService.deleteGoal(id);
      await refresh();
      await Promise.all([refreshTasks(), refreshProjects()]);
    },
    [refresh, refreshTasks, refreshProjects]
  );

  return (
    <GoalsContext.Provider value={{ goals, loading, refresh, addGoal, editGoal, archiveGoal, removeGoal }}>
      {children}
    </GoalsContext.Provider>
  );
}

export function useGoals(): GoalsContextValue {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used inside <GoalsProvider>");
  return ctx;
}
