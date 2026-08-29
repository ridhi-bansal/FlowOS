"use client";

import { isOverdue, isDueToday, isUpcoming, isTopLevel, getPostponeCount, sortByPriorityThenDue } from "./taskService";
import { mostPostponedTasks } from "./analyticsService";
import { todayKey } from "@/lib/utils/date";
import type { Task, Project, Goal, FocusSession } from "@/types";

/**
 * ============================================================================
 * PRODUCTIVITY COACH — local rule-based engine
 * ============================================================================
 * Every function here reasons over real local data (tasks/projects/goals/
 * focus sessions) with plain, checkable logic — not a call to any AI model.
 * Deliberately kept separate from lib/ai (which is server-only and reserved
 * for a real provider later): this needs to run client-side against
 * IndexedDB-backed provider state, same reasoning as whatNowService.
 *
 * A future real-AI coach would replace/augment individual functions here
 * (or call into lib/ai's provider abstraction from a server route) without
 * the Coach page needing to change — it already just renders whatever this
 * layer returns.
 * ============================================================================
 */

const ASSUMED_DAILY_CAPACITY_MINUTES = 240; // ~4 focused hours; a reasonable default, not a setting yet

export interface CoachSection {
  title: string;
  lines: string[];
}

export function mostImportantToday(tasks: Task[]): Task | null {
  const candidates = tasks.filter((t) => isTopLevel(t) && !t.done && (isDueToday(t) || isOverdue(t)));
  const sorted = sortByPriorityThenDue(candidates);
  return sorted[0] ?? null;
}

export function overloadCheck(tasks: Task[]): { overloaded: boolean; plannedMinutes: number; capacity: number } {
  const todays = tasks.filter((t) => isTopLevel(t) && !t.done && (isDueToday(t) || isOverdue(t)));
  const plannedMinutes = todays.reduce((sum, t) => sum + (t.estimated_minutes ?? 30), 0);
  return { overloaded: plannedMinutes > ASSUMED_DAILY_CAPACITY_MINUTES, plannedMinutes, capacity: ASSUMED_DAILY_CAPACITY_MINUTES };
}

export function upcomingDeadlines(tasks: Task[], projects: Project[], goals: Goal[], withinDays = 7) {
  const today = todayKey();
  const taskDeadlines = tasks
    .filter((t) => isTopLevel(t) && isUpcoming(t, withinDays))
    .map((t) => ({ kind: "task" as const, label: t.name, date: t.due_date! }));
  const projectDeadlines = projects
    .filter((p) => p.status !== "archived" && p.deadline && p.deadline >= today)
    .map((p) => ({ kind: "project" as const, label: p.name, date: p.deadline! }));
  const goalDeadlines = goals
    .filter((g) => g.status !== "archived" && g.deadline && g.deadline >= today)
    .map((g) => ({ kind: "goal" as const, label: g.title, date: g.deadline! }));
  return [...taskDeadlines, ...projectDeadlines, ...goalDeadlines].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

export function fallingBehind(projects: Project[], goals: Goal[]) {
  return {
    projects: projects.filter((p) => p.status === "at_risk" || p.status === "behind"),
    goals: goals.filter((g) => g.status === "at_risk" || g.status === "behind"),
  };
}

export function repeatedlyPostponed(tasks: Task[]) {
  return mostPostponedTasks(tasks, 3);
}

/** Very light weekly planning heuristic: surface the week's highest-priority open items, no auto-scheduling. */
export function weeklyFocusSuggestions(tasks: Task[], projects: Project[], goals: Goal[]) {
  const dueThisWeek = sortByPriorityThenDue(tasks.filter((t) => isTopLevel(t) && !t.done && isUpcoming(t, 7)));
  const behind = fallingBehind(projects, goals);
  return { topTasks: dueThisWeek.slice(0, 5), behindProjects: behind.projects, behindGoals: behind.goals };
}

/**
 * Builds the full set of coach sections for the Coach page. Kept as plain
 * data (not JSX) so it's easy to test/extend and easy to swap for a real
 * model's output later without touching rendering code.
 */
export function buildCoachSections(input: {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  sessions: FocusSession[];
}): CoachSection[] {
  const sections: CoachSection[] = [];
  const important = mostImportantToday(input.tasks);
  const load = overloadCheck(input.tasks);
  const deadlines = upcomingDeadlines(input.tasks, input.projects, input.goals);
  const behind = fallingBehind(input.projects, input.goals);
  const postponed = repeatedlyPostponed(input.tasks);

  sections.push({
    title: "Today",
    lines: [
      important ? `Most important: "${important.name}" (${important.priority} priority${important.due_date ? `, due ${important.due_date}` : ""}).` : "Nothing due or overdue today.",
      load.plannedMinutes > 0
        ? `${load.plannedMinutes} minutes planned today${load.overloaded ? ` — that's more than the ~${load.capacity}-minute rule of thumb, consider deferring something.` : "."}`
        : "No estimated time scheduled for today yet.",
    ],
  });

  sections.push({
    title: "Upcoming deadlines",
    lines: deadlines.length > 0
      ? deadlines.map((d) => `${d.date} — ${d.label} (${d.kind})`)
      : ["Nothing due in the next 7 days."],
  });

  sections.push({
    title: "Patterns worth noticing",
    lines: [
      ...(postponed.length > 0 ? postponed.map((p) => `"${p.task.name}" has been postponed ${p.count} time${p.count === 1 ? "" : "s"}.`) : []),
      ...(behind.projects.length > 0 ? [`At-risk projects: ${behind.projects.map((p) => p.name).join(", ")}.`] : []),
      ...(behind.goals.length > 0 ? [`At-risk goals: ${behind.goals.map((g) => g.title).join(", ")}.`] : []),
      ...(postponed.length === 0 && behind.projects.length === 0 && behind.goals.length === 0 ? ["Nothing concerning right now — things look on track."] : []),
    ],
  });

  return sections;
}
