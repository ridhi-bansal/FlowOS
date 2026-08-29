"use client";

import { getPostponeCount, isOverdue, isTopLevel } from "./taskService";
import { projectProgress } from "./projectService";
import { goalProgress } from "./goalService";
import { dateKey } from "@/lib/utils/date";
import type { Task, Project, Goal, FocusSession, Habit, HabitLog } from "@/types";

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return dateKey(d);
  });
}

export interface DayCount {
  date: string;
  label: string;
  value: number;
}

export function completionsLast7Days(tasks: Task[]): DayCount[] {
  const days = lastNDays(7);
  return days.map((date) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    value: tasks.filter((t) => t.done && t.completed_at && dateKey(new Date(t.completed_at)) === date).length,
  }));
}

export function focusMinutesLast7Days(sessions: FocusSession[]): DayCount[] {
  const days = lastNDays(7);
  return days.map((date) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    value: sessions.filter((s) => s.ended_at && dateKey(new Date(s.started_at)) === date).reduce((sum, s) => sum + (s.actual_minutes ?? 0), 0),
  }));
}

export interface TaskStats {
  total: number;
  completed: number;
  completionRate: number;
  overdue: number;
  avgEstimatedMinutes: number | null;
}

export function taskStats(tasks: Task[]): TaskStats {
  const topLevel = tasks.filter(isTopLevel);
  const completed = topLevel.filter((t) => t.done);
  const withEstimate = topLevel.filter((t) => t.estimated_minutes != null);
  return {
    total: topLevel.length,
    completed: completed.length,
    completionRate: topLevel.length === 0 ? 0 : Math.round((completed.length / topLevel.length) * 100),
    overdue: topLevel.filter(isOverdue).length,
    avgEstimatedMinutes: withEstimate.length === 0 ? null : Math.round(withEstimate.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0) / withEstimate.length),
  };
}

export interface PostponedTask {
  task: Task;
  count: number;
}

export function mostPostponedTasks(tasks: Task[], limit = 5): PostponedTask[] {
  return tasks
    .filter((t) => isTopLevel(t) && !t.done)
    .map((t) => ({ task: t, count: getPostponeCount(t.id) }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function projectStatusBreakdown(projects: Project[]): { status: string; count: number }[] {
  const active = projects.filter((p) => p.status !== "archived");
  const counts: Record<string, number> = {};
  for (const p of active) counts[p.status] = (counts[p.status] ?? 0) + 1;
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

export interface GoalSummary {
  goal: Goal;
  percent: number;
}
export function goalSummaries(goals: Goal[], projects: Project[], tasks: Task[]): GoalSummary[] {
  return goals
    .filter((g) => g.status !== "archived")
    .map((g) => ({ goal: g, percent: goalProgress(projects, tasks, g.id).percent }));
}

export function habitConsistency(habits: Habit[], logs: HabitLog[]): { habit: Habit; rate: number }[] {
  const days = lastNDays(7);
  return habits
    .filter((h) => !h.archived)
    .map((h) => {
      const hits = days.filter((d) => logs.some((l) => l.habit_id === h.id && l.logged_date === d)).length;
      return { habit: h, rate: Math.round((hits / 7) * 100) };
    });
}

/**
 * Local rule-based observations — same philosophy as whatNowService: plain
 * conditional logic over real data, not a call to any AI model. Every
 * string here is a direct, checkable consequence of the numbers passed in.
 */
export function generateInsights(input: {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  sessions: FocusSession[];
}): string[] {
  const insights: string[] = [];
  const stats = taskStats(input.tasks);
  const postponed = mostPostponedTasks(input.tasks, 1);
  const focus7 = focusMinutesLast7Days(input.sessions);
  const totalFocus7 = focus7.reduce((s, d) => s + d.value, 0);
  const atRiskProjects = input.projects.filter((p) => p.status === "at_risk" || p.status === "behind");
  const behindGoals = input.goals.filter((g) => g.status === "at_risk" || g.status === "behind");

  if (stats.overdue > 0) {
    insights.push(`You have ${stats.overdue} overdue task${stats.overdue === 1 ? "" : "s"} — worth clearing or rescheduling before adding more.`);
  }
  if (stats.total > 0) {
    insights.push(`Your completion rate is ${stats.completionRate}% across ${stats.total} tracked task${stats.total === 1 ? "" : "s"}.`);
  }
  if (postponed.length > 0 && postponed[0].count >= 2) {
    insights.push(`"${postponed[0].task.name}" has been pushed back ${postponed[0].count} times — consider breaking it into a smaller first step.`);
  }
  if (totalFocus7 > 0) {
    insights.push(`You've logged ${totalFocus7} minutes of focused work in the last 7 days.`);
  } else {
    insights.push(`No focus sessions logged in the last 7 days — the Focus page can help you track deep work time.`);
  }
  if (atRiskProjects.length > 0) {
    insights.push(`${atRiskProjects.length} project${atRiskProjects.length === 1 ? " is" : "s are"} marked at risk or behind: ${atRiskProjects.map((p) => p.name).join(", ")}.`);
  }
  if (behindGoals.length > 0) {
    insights.push(`${behindGoals.length} goal${behindGoals.length === 1 ? " is" : "s are"} marked at risk or behind: ${behindGoals.map((g) => g.title).join(", ")}.`);
  }
  if (insights.length === 0) {
    insights.push("Not enough activity yet to surface a pattern — check back after a few days of use.");
  }
  return insights;
}
