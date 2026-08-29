"use client";

import { goals as goalRepo, projects as projectRepo, tasks as taskRepo, newId, nowIso } from "@/lib/data";
import { isTopLevel } from "./taskService";
import { projectProgress } from "./projectService";
import { todayKey } from "@/lib/utils/date";
import type { Goal, GoalHorizon, GoalStatus, Project, Task } from "@/types";

/**
 * Domain logic for goals — the layer above Projects and Tasks:
 * GOAL → PROJECT → TASK. Same pattern as taskService/projectService:
 * components call these functions (or useGoals), never the raw `goals`
 * repository from @/lib/data directly.
 *
 * A goal doesn't duplicate anything from its projects or tasks. Progress
 * is a live rollup:
 *   - every project with project.goal_id === this goal contributes its
 *     own task-derived progress (see projectService.projectProgress)
 *   - every top-level task with task.goal_id === this goal AND no
 *     project (task.project_id is null) contributes directly, so a task
 *     already counted through its project is never double-counted
 */

export interface NewGoalInput {
  title: string;
  why?: string | null;
  horizon?: GoalHorizon;
  deadline?: string | null;
  success_metric?: string | null;
  status?: GoalStatus;
  obstacles?: string | null;
  area_id?: string | null;
  parent_goal_id?: string | null;
}

export function createGoal(input: NewGoalInput): Promise<Goal> {
  const goal: Goal = {
    id: newId(),
    user_id: "local",
    parent_goal_id: input.parent_goal_id ?? null,
    area_id: input.area_id ?? null,
    title: input.title.trim(),
    why: input.why ?? null,
    horizon: input.horizon ?? "quarterly",
    deadline: input.deadline ?? null,
    success_metric: input.success_metric ?? null,
    progress: 0,
    status: input.status ?? "active",
    obstacles: input.obstacles ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  return goalRepo.create(goal);
}

export function updateGoal(id: string, patch: Partial<Goal>): Promise<Goal> {
  return goalRepo.update(id, patch);
}

export function archiveGoal(id: string): Promise<Goal> {
  return goalRepo.update(id, { status: "archived" });
}

/**
 * Deletes a goal and unlinks whatever pointed to it (projects and
 * directly-attached tasks both get goal_id → null) rather than deleting
 * that work — same non-destructive philosophy as projectService.deleteProject.
 */
export async function deleteGoal(id: string): Promise<void> {
  const [allProjects, allTasks] = await Promise.all([projectRepo.list(), taskRepo.list()]);
  const linkedProjects = allProjects.filter((p) => p.goal_id === id);
  const linkedTasks = allTasks.filter((t) => t.goal_id === id);
  await Promise.all([
    ...linkedProjects.map((p) => projectRepo.update(p.id, { goal_id: null })),
    ...linkedTasks.map((t) => taskRepo.update(t.id, { goal_id: null })),
  ]);
  await goalRepo.remove(id);
}

export function listAllGoals(): Promise<Goal[]> {
  return goalRepo.list();
}

// ---- Derived views ----------------------------------------------------

export function projectsForGoal(allProjects: Project[], goalId: string): Project[] {
  return allProjects.filter((p) => p.goal_id === goalId);
}

/** Tasks laddering straight up to the goal without going through a project. */
export function directTasksForGoal(allTasks: Task[], goalId: string): Task[] {
  return allTasks.filter((t) => t.goal_id === goalId && !t.project_id && isTopLevel(t));
}

export interface GoalProgress {
  done: number;
  total: number;
  percent: number;
  overdue: number;
  upcoming: number;
  projectCount: number;
}

export function goalProgress(allProjects: Project[], allTasks: Task[], goalId: string): GoalProgress {
  const linkedProjects = projectsForGoal(allProjects, goalId);
  const direct = directTasksForGoal(allTasks, goalId);

  let done = 0;
  let total = 0;
  let overdue = 0;
  let upcoming = 0;

  for (const p of linkedProjects) {
    const pp = projectProgress(allTasks, p.id);
    done += pp.done;
    total += pp.total;
    overdue += pp.overdue;
    upcoming += pp.upcoming;
  }

  done += direct.filter((t) => t.done).length;
  total += direct.length;
  // isOverdue/isUpcoming already exclude done tasks; reuse via taskService would
  // require importing them here too — cheap enough to inline the same checks.
  const todayIso = todayKey();
  overdue += direct.filter((t) => !t.done && t.due_date && t.due_date < todayIso).length;
  upcoming += direct.filter((t) => !t.done && t.due_date && t.due_date >= todayIso).length;

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    overdue,
    upcoming,
    projectCount: linkedProjects.length,
  };
}

export function sortGoalsByUrgency(goalsList: Goal[]): Goal[] {
  return [...goalsList].sort((a, b) => {
    if (a.status === "archived" && b.status !== "archived") return 1;
    if (b.status === "archived" && a.status !== "archived") return -1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

export const HORIZON_LABEL: Record<GoalHorizon, string> = {
  vision: "Vision",
  long_term: "Long-term",
  yearly: "Yearly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};
