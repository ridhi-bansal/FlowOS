"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Task } from "@/types";
import * as taskService from "@/lib/services/taskService";
import type { NewTaskInput } from "@/lib/services/taskService";

interface TasksContextValue {
  tasks: Task[];
  loading: boolean;
  refresh: () => Promise<void>;
  addTask: (input: NewTaskInput) => Promise<Task>;
  editTask: (id: string, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

/**
 * Single in-memory source of truth for tasks across the app, backed by
 * lib/services/taskService (which itself sits on lib/data's IndexedDB
 * repository). Every task mutation goes through here so the Dashboard,
 * task views, and any future component all see the same state immediately
 * — no component talks to lib/data or lib/services/taskService on its own
 * for task lists.
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await taskService.listAllTasks();
    setTasks(all);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addTask = useCallback(
    async (input: NewTaskInput) => {
      const created = await taskService.createTask(input);
      await refresh();
      return created;
    },
    [refresh]
  );

  const editTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      await taskService.updateTask(id, patch);
      await refresh();
    },
    [refresh]
  );

  const removeTask = useCallback(
    async (id: string) => {
      await taskService.deleteTask(id);
      await refresh();
    },
    [refresh]
  );

  const toggleComplete = useCallback(
    async (id: string) => {
      await taskService.toggleComplete(id);
      await refresh();
    },
    [refresh]
  );

  return (
    <TasksContext.Provider value={{ tasks, loading, refresh, addTask, editTask, removeTask, toggleComplete }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used inside <TasksProvider>");
  return ctx;
}
