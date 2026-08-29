"use client";

import { tasks as taskRepo, newId, nowIso } from "@/lib/data";
import type { Task, Priority, TaskStatus } from "@/types";
import { todayKey, dateKey } from "@/lib/utils/date";

/**
 * Domain logic for tasks, built on top of the generic Repository<Task> from
 * @/lib/data. Components should call these functions (or the useTasks hook
 * in components/tasks/TasksProvider.tsx) rather than importing the raw
 * `tasks` repository directly — this is where "what counts as overdue",
 * "how postponement is tracked", etc. live, so it isn't scattered across
 * components.
 */

export interface NewTaskInput {
  name: string;
  description?: string | null;
  project_id?: string | null;
  goal_id?: string | null;
  area_id?: string | null;
  parent_task_id?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  due_date?: string | null;
  due_time?: string | null;
  estimated_minutes?: number | null;
  energy?: Task["energy"];
  context?: string | null;
  notes?: string | null;
  tag_ids?: string[];
}

// Was `new Date().toISOString().slice(0, 10)` — that reads the UTC date,
// not the viewer's local date. See lib/utils/date.ts for why this matters.
function todayIso(): string {
  return todayKey();
}

export function createTask(input: NewTaskInput): Promise<Task> {
  const due_date = input.due_date ?? null;
  const status: TaskStatus = input.status ?? (due_date ? "scheduled" : "inbox");

  const task: Task = {
    id: newId(),
    user_id: "local",
    parent_task_id: input.parent_task_id ?? null,
    project_id: input.project_id ?? null,
    goal_id: input.goal_id ?? null,
    area_id: input.area_id ?? null,
    event_id: null,
    name: input.name.trim(),
    description: input.description ?? null,
    status,
    priority: input.priority ?? "medium",
    start_date: null,
    due_date,
    due_time: input.due_time ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    actual_minutes: null,
    energy: input.energy ?? null,
    context: input.context ?? null,
    recurrence: null,
    notes: input.notes ?? null,
    done: false,
    completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  return taskRepo.create(task);
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  const existing = await taskRepo.get(id);
  if (existing && patch.due_date && existing.due_date && patch.due_date > existing.due_date) {
    // The due date moved later — count that as a postponement (see
    // getPostponeCount below). Purely a local heuristic for the "What
    // Should I Do Now?" recommender; not persisted in the schema yet.
    incrementPostponeCount(id);
  }
  return taskRepo.update(id, patch);
}

export async function deleteTask(id: string): Promise<void> {
  // Cascade: a task's subtasks have no reason to survive it as orphaned
  // top-level tasks (they'd suddenly appear, unexpectedly, in Inbox).
  const all = await taskRepo.list();
  const children = all.filter((t) => t.parent_task_id === id);
  await Promise.all(children.map((c) => taskRepo.remove(c.id)));
  await taskRepo.remove(id);
}

export async function toggleComplete(id: string): Promise<Task> {
  const existing = await taskRepo.get(id);
  if (!existing) throw new Error("Task not found");
  if (existing.done) {
    return taskRepo.update(id, { done: false, completed_at: null, status: existing.due_date ? "scheduled" : "next" });
  }
  return taskRepo.update(id, { done: true, completed_at: nowIso(), status: "completed" });
}

export function listAllTasks(): Promise<Task[]> {
  return taskRepo.list();
}

// ---- Views -----------------------------------------------------------

export function isOverdue(t: Task): boolean {
  return !t.done && !!t.due_date && t.due_date < todayIso();
}
export function isDueToday(t: Task): boolean {
  return !t.done && t.due_date === todayIso();
}
export function isUpcoming(t: Task, withinDays = 14): boolean {
  if (t.done || !t.due_date) return false;
  const today = todayIso();
  if (t.due_date <= today) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return t.due_date <= dateKey(cutoff);
}
export function isInbox(t: Task): boolean {
  return !t.done && t.status === "inbox";
}
/** Only tasks that aren't someone else's subtask — what the four main views should show. */
export function isTopLevel(t: Task): boolean {
  return !t.parent_task_id;
}

export function sortByPriorityThenDue(list: Task[]): Task[] {
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => {
    const p = rank[a.priority] - rank[b.priority];
    if (p !== 0) return p;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

export function filterByView(all: Task[], view: "inbox" | "today" | "upcoming" | "completed") {
  // Subtasks live inside their parent's edit modal, not in the top-level
  // views — otherwise they'd show up twice (once standalone, once nested).
  const topLevel = all.filter(isTopLevel);
  switch (view) {
    case "inbox":
      return sortByPriorityThenDue(topLevel.filter(isInbox));
    case "today":
      return sortByPriorityThenDue(topLevel.filter((t) => isDueToday(t) || isOverdue(t)));
    case "upcoming":
      return sortByPriorityThenDue(topLevel.filter((t) => isUpcoming(t)));
    case "completed":
      return [...topLevel.filter((t) => t.done)].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  }
}

export function subtasksOf(all: Task[], parentId: string): Task[] {
  return all.filter((t) => t.parent_task_id === parentId);
}

/** Done/total subtask count for a parent task, used for a progress hint on its row. */
export function subtaskProgress(all: Task[], parentId: string): { done: number; total: number } {
  const children = subtasksOf(all, parentId);
  return { done: children.filter((c) => c.done).length, total: children.length };
}

// ---- Postponement tracking (local heuristic, see updateTask above) ----

const POSTPONE_KEY = "flowos.postpones.v1";

function readPostponeCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(POSTPONE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function incrementPostponeCount(taskId: string) {
  const counts = readPostponeCounts();
  counts[taskId] = (counts[taskId] ?? 0) + 1;
  window.localStorage.setItem(POSTPONE_KEY, JSON.stringify(counts));
}

export function getPostponeCount(taskId: string): number {
  return readPostponeCounts()[taskId] ?? 0;
}

// ---- Today's Top 3 (user-selectable, stored per-day locally) ----------

const TOP3_KEY_PREFIX = "flowos.top3.";

export function getTop3Selection(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TOP3_KEY_PREFIX + todayIso());
  return raw ? JSON.parse(raw) : [];
}

export function setTop3Selection(taskIds: string[]) {
  window.localStorage.setItem(TOP3_KEY_PREFIX + todayIso(), JSON.stringify(taskIds.slice(0, 3)));
}

/** Auto-suggested Top 3 when the user hasn't picked their own. Top-level tasks only. */
export function suggestTop3(all: Task[]): Task[] {
  const open = all.filter((t) => isTopLevel(t) && !t.done && (isDueToday(t) || isOverdue(t) || isUpcoming(t, 3)));
  return sortByPriorityThenDue(open).slice(0, 3);
}

export function resolveTop3(all: Task[]): Task[] {
  const chosen = getTop3Selection();
  if (chosen.length > 0) {
    const byId = new Map(all.map((t) => [t.id, t]));
    const resolved = chosen.map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.done);
    if (resolved.length > 0) return resolved;
  }
  return suggestTop3(all);
}
