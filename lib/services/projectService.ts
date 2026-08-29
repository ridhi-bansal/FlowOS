"use client";

import { projects as projectRepo, tasks as taskRepo, newId, nowIso } from "@/lib/data";
import { isOverdue, isUpcoming, isTopLevel } from "./taskService";
import type { Project, ProjectStatus, Task } from "@/types";

/**
 * Domain logic for projects, built the same way as taskService.ts and
 * eventService.ts: components call these functions (or useProjects), never
 * the raw `projects` repository from @/lib/data directly.
 *
 * Projects are a layer above tasks, not a parallel structure — a task
 * belongs to a project via `task.project_id`, and everything here (progress,
 * overdue/upcoming counts) is derived live from real task rows rather than
 * duplicated or cached on the project itself.
 */

export interface NewProjectInput {
  name: string;
  objective?: string | null;
  notes?: string | null;
  status?: ProjectStatus;
  deadline?: string | null;
  color?: string | null;
  goal_id?: string | null;
  area_id?: string | null;
}

export function createProject(input: NewProjectInput): Promise<Project> {
  const project: Project = {
    id: newId(),
    user_id: "local",
    goal_id: input.goal_id ?? null,
    area_id: input.area_id ?? null,
    name: input.name.trim(),
    objective: input.objective ?? null,
    deadline: input.deadline ?? null,
    status: input.status ?? "on_track",
    notes: input.notes ?? null,
    color: input.color ?? "#635bff",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  return projectRepo.create(project);
}

export function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  return projectRepo.update(id, patch);
}

export function archiveProject(id: string): Promise<Project> {
  return projectRepo.update(id, { status: "archived" });
}

/**
 * Deletes a project and unlinks its tasks (sets task.project_id to null)
 * rather than deleting them — losing a project shouldn't silently destroy
 * work the user tracked under it.
 */
export async function deleteProject(id: string): Promise<void> {
  const all = await taskRepo.list();
  const linked = all.filter((t) => t.project_id === id);
  await Promise.all(linked.map((t) => taskRepo.update(t.id, { project_id: null })));
  await projectRepo.remove(id);
}

export function listAllProjects(): Promise<Project[]> {
  return projectRepo.list();
}

// ---- Derived views --------------------------------------------------

export function tasksForProject(allTasks: Task[], projectId: string): Task[] {
  return allTasks.filter((t) => t.project_id === projectId && isTopLevel(t));
}

export interface ProjectProgress {
  done: number;
  total: number;
  percent: number;
  overdue: number;
  upcoming: number;
}

export function projectProgress(allTasks: Task[], projectId: string): ProjectProgress {
  const tasks = tasksForProject(allTasks, projectId);
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    overdue: tasks.filter(isOverdue).length,
    upcoming: tasks.filter((t) => isUpcoming(t, 14)).length,
  };
}

export function sortProjectsByUrgency(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (a.status === "archived" && b.status !== "archived") return 1;
    if (b.status === "archived" && a.status !== "archived") return -1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}
