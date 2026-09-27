import "server-only";
import type { Task, FocusSession, TaskEvent } from "@/types";
import type { CompactTask, FreeWindow, ScheduleContext } from "./types";
import { evaluateWorkloadCapacity, type WorkloadCapacity } from "./planningEngine";

export type DailyRiskType =
  | "overloaded_day"
  | "calendar_pressure"
  | "overdue_pressure"
  | "large_task_before_commitment"
  | "repeated_postponement"
  | "insufficient_capacity"
  | "fragmented_schedule"
  | "stalled_priority";

export interface DailyRisk {
  type: DailyRiskType;
  title: string;
  description: string;
  evidence: string;
  severity: "low" | "medium" | "high";
  suggested_action?: string;
}

export type DailyOpportunityType =
  | "protected_deep_work_window"
  | "short_admin_window"
  | "unused_capacity"
  | "good_task_fit"
  | "goal_progress_window";

export interface DailyOpportunity {
  type: DailyOpportunityType;
  title: string;
  description: string;
  evidence: string;
  window?: FreeWindow;
  suggested_task_id?: string;
}

export interface DailyState {
  date: string; // YYYY-MM-DD
  now: {
    iso: string;
    formatted: string; // HH:MM
  };
  current_window: {
    start_at: string;
    end_at: string;
    available_minutes: number;
  } | null;
  next_commitment: {
    title: string;
    start_at: string;
    end_at: string;
    source: "native" | "google";
  } | null;
  capacity: WorkloadCapacity;
  workload: {
    overdue_count: number;
    today_task_count: number;
    high_priority_count: number;
    total_planned_minutes: number;
  };
  priorities: CompactTask[];
  risks: DailyRisk[];
  opportunities: DailyOpportunity[];
}

/**
 * Deterministic Daily Intelligence Engine.
 * Evaluates the current day state, identifying concrete mathematical workload metrics,
 * factual calendar risks, and discrete scheduling opportunities.
 */
export function buildDailyState({
  tasks,
  schedule,
  taskEvents = [],
  focusSessions = [],
  now,
  todayKey,
  timezone,
  toCompact,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  now: Date;
  todayKey: string;
  timezone: string;
  toCompact: (t: Task) => CompactTask;
}): DailyState {
  const nowMs = +now;

  // 1. Formatted time string
  const formattedTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  // 2. Next commitment (busy block in the future)
  const upcomingCommitments = schedule.busy_blocks
    .filter((b) => +new Date(b.start) > nowMs)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  const nextBusy = upcomingCommitments[0] || null;
  const next_commitment = nextBusy
    ? {
        title: nextBusy.title,
        start_at: nextBusy.start,
        end_at: nextBusy.end,
        source: nextBusy.source,
      }
    : null;

  // 3. Current window
  let current_window: DailyState["current_window"] = null;
  if (nextBusy) {
    const availMin = Math.max(0, Math.round((+new Date(nextBusy.start) - nowMs) / 60000));
    current_window = {
      start_at: now.toISOString(),
      end_at: nextBusy.start,
      available_minutes: availMin,
    };
  } else {
    const activeWindow = schedule.free_windows.find((w) => +new Date(w.end) > nowMs);
    if (activeWindow) {
      const availMin = Math.max(
        0,
        Math.round((+new Date(activeWindow.end) - Math.max(nowMs, +new Date(activeWindow.start))) / 60000)
      );
      current_window = {
        start_at: now.toISOString(),
        end_at: activeWindow.end,
        available_minutes: availMin,
      };
    } else if (schedule.total_free_minutes > 0) {
      current_window = {
        start_at: now.toISOString(),
        end_at: now.toISOString(),
        available_minutes: schedule.total_free_minutes,
      };
    }
  }

  // 4. Workload Capacity
  const capacity = evaluateWorkloadCapacity({ tasks, schedule, todayKey });

  // 5. Workload Metrics
  const openTasks = tasks.filter((t) => !t.done);
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < todayKey);
  const todayTasks = openTasks.filter((t) => t.due_date === todayKey);
  const highPriorityTasks = openTasks.filter((t) => t.priority === "high");

  const workload = {
    overdue_count: overdueTasks.length,
    today_task_count: todayTasks.length,
    high_priority_count: highPriorityTasks.length,
    total_planned_minutes: capacity.planned_minutes_today,
  };

  // 6. Priorities (Top 3-5 open tasks)
  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedCandidates = [...openTasks].sort((a, b) => {
    let scoreA = priorityScore[a.priority] ?? 1;
    let scoreB = priorityScore[b.priority] ?? 1;
    if (a.due_date && a.due_date < todayKey) scoreA += 4;
    if (b.due_date && b.due_date < todayKey) scoreB += 4;
    if (a.due_date === todayKey) scoreA += 3;
    if (b.due_date === todayKey) scoreB += 3;
    return scoreB - scoreA;
  });

  const priorities = sortedCandidates.slice(0, 5).map(toCompact);

  // 7. Deterministic Risk Detection
  const risks: DailyRisk[] = [];

  // Risk A: Overloaded Day
  if (capacity.status === "overloaded") {
    risks.push({
      type: "overloaded_day",
      title: "Workload Exceeds Calendar Capacity",
      description: `Planned tasks require ${capacity.planned_minutes_today}m, but available free calendar time is ${capacity.free_minutes_today}m.`,
      evidence: `Load ratio: ${capacity.load_ratio}x (${capacity.deficit_or_surplus_minutes}m deficit)`,
      severity: "high",
      suggested_action: "Defer lower priority tasks or reduce estimated scope.",
    });
  }

  // Risk B: Overdue Pressure
  if (overdueTasks.length >= 2) {
    risks.push({
      type: "overdue_pressure",
      title: "Multiple Overdue Tasks",
      description: `You have ${overdueTasks.length} overdue tasks pending from previous days.`,
      evidence: `${overdueTasks.map((t) => `"${t.name}"`).slice(0, 2).join(", ")} are past due`,
      severity: overdueTasks.length >= 4 ? "high" : "medium",
      suggested_action: "Reschedule or complete the most urgent overdue item first.",
    });
  }

  // Risk C: Large Task Before Imminent Commitment
  if (current_window && nextBusy && current_window.available_minutes < 45) {
    const largeTask = priorities.find((t) => t.estimated_minutes >= 60);
    if (largeTask) {
      risks.push({
        type: "large_task_before_commitment",
        title: "Top Priority Does Not Fit Remaining Window",
        description: `Top task "${largeTask.name}" needs ${largeTask.estimated_minutes}m, but only ${current_window.available_minutes}m remain before "${nextBusy.title}".`,
        evidence: `Available: ${current_window.available_minutes}m vs Needed: ${largeTask.estimated_minutes}m`,
        severity: "medium",
        suggested_action: "Work on a shorter tactical task or break down the larger task.",
      });
    }
  }

  // Risk D: Calendar Pressure (Back-to-back commitments with minimal buffer)
  if (upcomingCommitments.length >= 3) {
    let tightTransitions = 0;
    for (let i = 0; i < upcomingCommitments.length - 1; i++) {
      const gapMin = Math.round(
        (+new Date(upcomingCommitments[i + 1].start) - +new Date(upcomingCommitments[i].end)) / 60000
      );
      if (gapMin < 15) tightTransitions++;
    }
    if (tightTransitions >= 2) {
      risks.push({
        type: "calendar_pressure",
        title: "Back-to-Back Commitment Density",
        description: `${upcomingCommitments.length} upcoming commitments have tight transitions under 15 minutes.`,
        evidence: `${tightTransitions} transitions with < 15m buffer`,
        severity: "medium",
        suggested_action: "Protect recovery buffers between scheduled meetings.",
      });
    }
  }

  // Risk E: Stalled High-Priority Tasks
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoIso = fiveDaysAgo.toISOString();
  const stalledHigh = openTasks.filter(
    (t) => t.priority === "high" && t.created_at <= fiveDaysAgoIso && !t.due_date
  );
  if (stalledHigh.length > 0) {
    risks.push({
      type: "stalled_priority",
      title: "Stalled High-Priority Work",
      description: `Task "${stalledHigh[0].name}" has been open for 5+ days without a scheduled due date.`,
      evidence: `Created on ${stalledHigh[0].created_at.slice(0, 10)}`,
      severity: "medium",
      suggested_action: "Assign a target due date or break into immediate next actions.",
    });
  }

  // Risk F: Repeated Postponement
  if (taskEvents.length > 0) {
    const postCounts = new Map<string, number>();
    for (const evt of taskEvents) {
      if (evt.event_type === "postponed") {
        postCounts.set(evt.task_id, (postCounts.get(evt.task_id) || 0) + 1);
      }
    }
    for (const t of openTasks) {
      const cnt = postCounts.get(t.id) || 0;
      if (cnt >= 2) {
        risks.push({
          type: "repeated_postponement",
          title: "Chronic Postponement",
          description: `Task "${t.name}" has been postponed ${cnt} times.`,
          evidence: `Logged in task events history`,
          severity: cnt >= 4 ? "high" : "medium",
          suggested_action: "Evaluate obstacles or reduce scope with 'break_down_task'.",
        });
        break; // Report top chronic postponement
      }
    }
  }

  // Risk G: Fragmented Schedule
  if (capacity.is_fragmented) {
    risks.push({
      type: "fragmented_schedule",
      title: "Fragmented Focus Time",
      description: "Available calendar time is broken into multiple small windows under 45 minutes.",
      evidence: `${schedule.free_windows.length} windows, majority < 45m`,
      severity: "low",
      suggested_action: "Group short administrative tasks into these intervals.",
    });
  }

  // 8. Deterministic Opportunity Detection
  const opportunities: DailyOpportunity[] = [];

  // Opportunity A: Protected Deep Work Window
  const futureWindows = schedule.free_windows.filter((w) => +new Date(w.end) > nowMs);
  const deepWindows = futureWindows.filter((w) => w.duration_minutes >= 60);
  if (deepWindows.length > 0) {
    const bestDeep = deepWindows.sort((a, b) => b.duration_minutes - a.duration_minutes)[0];
    const topHighTask = priorities.find((t) => t.priority === "high" && t.estimated_minutes <= bestDeep.duration_minutes);
    opportunities.push({
      type: "protected_deep_work_window",
      title: "Deep Work Window Available",
      description: `A continuous ${bestDeep.duration_minutes}m window is available starting at ${bestDeep.start.slice(11, 16)}.`,
      evidence: `Free window: ${bestDeep.duration_minutes} minutes`,
      window: bestDeep,
      suggested_task_id: topHighTask?.id,
    });
  }

  // Opportunity B: Unused Capacity
  if (capacity.status === "under_capacity" && capacity.free_minutes_today >= 180) {
    opportunities.push({
      type: "unused_capacity",
      title: "Substantial Open Capacity",
      description: `You have ${capacity.free_minutes_today}m of free calendar time today with only ${capacity.planned_minutes_today}m planned.`,
      evidence: `Surplus capacity: ${capacity.free_minutes_today - capacity.planned_minutes_today} minutes`,
    });
  }

  // Opportunity C: Short Admin Window
  const shortWindows = futureWindows.filter((w) => w.duration_minutes >= 15 && w.duration_minutes <= 30);
  if (shortWindows.length > 0) {
    const quickTask = priorities.find((t) => t.estimated_minutes <= 25);
    opportunities.push({
      type: "short_admin_window",
      title: "Tactical Admin Window",
      description: `A ${shortWindows[0].duration_minutes}m gap is available at ${shortWindows[0].start.slice(11, 16)} for quick execution.`,
      evidence: `Window duration: ${shortWindows[0].duration_minutes}m`,
      window: shortWindows[0],
      suggested_task_id: quickTask?.id,
    });
  }

  return {
    date: todayKey,
    now: {
      iso: now.toISOString(),
      formatted: formattedTime,
    },
    current_window,
    next_commitment,
    capacity,
    workload,
    priorities,
    risks: risks.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
  };
}
