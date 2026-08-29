"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Project } from "@/types";
import * as projectService from "@/lib/services/projectService";
import type { NewProjectInput } from "@/lib/services/projectService";
import { useTasks } from "@/components/tasks/TasksProvider";

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
  addProject: (input: NewProjectInput) => Promise<Project>;
  editProject: (id: string, patch: Partial<Project>) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

/** Same pattern as TasksProvider/EventsProvider — one shared source of truth for projects. */
export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Deleting a project unlinks its tasks (see projectService.deleteProject);
  // this provider must live inside TasksProvider so it can refresh the
  // shared task list afterward — otherwise TaskRow would keep showing a
  // stale project tag until some unrelated task mutation happened to
  // refresh it.
  const { refresh: refreshTasks } = useTasks();

  const refresh = useCallback(async () => {
    const all = await projectService.listAllProjects();
    setProjects(all);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addProject = useCallback(
    async (input: NewProjectInput) => {
      const created = await projectService.createProject(input);
      await refresh();
      return created;
    },
    [refresh]
  );

  const editProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      await projectService.updateProject(id, patch);
      await refresh();
    },
    [refresh]
  );

  const archiveProject = useCallback(
    async (id: string) => {
      await projectService.archiveProject(id);
      await refresh();
    },
    [refresh]
  );

  const removeProject = useCallback(
    async (id: string) => {
      await projectService.deleteProject(id);
      await refresh();
      await refreshTasks();
    },
    [refresh, refreshTasks]
  );

  return (
    <ProjectsContext.Provider value={{ projects, loading, refresh, addProject, editProject, archiveProject, removeProject }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside <ProjectsProvider>");
  return ctx;
}
