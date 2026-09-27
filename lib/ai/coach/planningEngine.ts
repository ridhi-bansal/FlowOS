import "server-only";
import type { Task, CoachMemory } from "@/types";
import type { CompactTask, FreeWindow, ScheduleContext } from "./types";
import { extractAcceptedDurationMultiplier } from "./reflectionEngine";

export interface WorkloadCapacity {
  planned_minutes_today: number;
  free_minutes_today: number;
  load_ratio: number;
  status: "under_capacity" | "balanced" | "overloaded";
  deficit_or_surplus_minutes: number;
  deep_work_windows_count: number;
  is_fragmented: boolean;
}

export interface TaskWindowFit {
  taskId: string;
  taskName: string;
  estimatedMinutes: number;
  fitsCurrentWindow: boolean;
  recommendedWindow?: FreeWindow;
  score: number;
  matchReason: string;
}

export interface CurrentWindowPlanning {
  current_window: {
    start_at: string;
    end_at: string;
    available_minutes: number;
    next_commitment: string | null;
  } | null;
  fitting_tasks: CompactTask[];
  non_fitting_tasks: CompactTask[];
  recommended_task: {
    task_id: string;
    name: string;
    estimated_minutes: number;
    reason: string;
  } | null;
}

/**
 * Deterministic Planning Engine for FlowOS AI Coach.
 *
 * Mandate:
 * - Deterministic capacity and workload math.
 * - Current-window available time calculation.
 * - Strict separation of fitting vs non-fitting tasks.
 * - Single source of truth for immediate action recommendations.
 */

export function evaluateWorkloadCapacity({
  tasks,
  schedule,
  todayKey,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  todayKey: string;
}): WorkloadCapacity {
  const openTodayTasks = tasks.filter((t) => !t.done && t.due_date === todayKey);
  const plannedMinutes = openTodayTasks.reduce(
    (sum, t) => sum + (t.estimated_minutes ?? 30),
    0
  );
  const freeMinutes = schedule.total_free_minutes;

  let loadRatio = 0;
  if (freeMinutes > 0) {
    loadRatio = Math.round((plannedMinutes / freeMinutes) * 100) / 100;
  } else if (plannedMinutes > 0) {
    loadRatio = Infinity;
  }

  let status: "under_capacity" | "balanced" | "overloaded" = "balanced";
  if (loadRatio > 1.1 || (freeMinutes === 0 && plannedMinutes > 0)) {
    status = "overloaded";
  } else if (loadRatio < 0.7 && freeMinutes > 0) {
    status = "under_capacity";
  }

  const deepWorkWindows = schedule.free_windows.filter((w) => w.duration_minutes >= 60);
  const shortWindows = schedule.free_windows.filter((w) => w.duration_minutes < 45);
  const isFragmented =
    schedule.free_windows.length >= 3 &&
    shortWindows.length / schedule.free_windows.length >= 0.6;

  return {
    planned_minutes_today: plannedMinutes,
    free_minutes_today: freeMinutes,
    load_ratio: loadRatio,
    status,
    deficit_or_surplus_minutes: plannedMinutes - freeMinutes,
    deep_work_windows_count: deepWorkWindows.length,
    is_fragmented: isFragmented,
  };
}

export function findFittingWindow(
  durationMinutes: number,
  freeWindows: FreeWindow[],
  minStartTime?: Date
): FreeWindow | null {
  const eligible = freeWindows.filter((w) => {
    if (w.duration_minutes < durationMinutes) return false;
    if (minStartTime && new Date(w.end) <= minStartTime) return false;
    return true;
  });

  if (eligible.length === 0) return null;
  return eligible[0];
}

/**
 * Builds the deterministic current-window plan.
 * Separates tasks into fitting and non-fitting categories based strictly on
 * available minutes before the next commitment or end of the current free window.
 */
export function buildCurrentWindowPlan({
  tasks,
  schedule,
  toCompact,
  now,
  todayKey,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  toCompact: (t: Task) => CompactTask;
  now: Date;
  todayKey: string;
}): CurrentWindowPlanning {
  const nowMs = +now;

  // 1. Detect next upcoming commitment (native or Google event)
  const nextCommitment = schedule.busy_blocks
    .filter((b) => +new Date(b.start) > nowMs)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))[0];

  let availableMinutes = 0;
  let windowEndIso = now.toISOString();

  if (nextCommitment) {
    availableMinutes = Math.max(0, Math.round((+new Date(nextCommitment.start) - nowMs) / 60000));
    windowEndIso = nextCommitment.start;
  } else {
    // If no upcoming commitment, find the current or next active free window
    const activeWindow = schedule.free_windows.find((w) => +new Date(w.end) > nowMs);
    if (activeWindow) {
      availableMinutes = Math.max(
        0,
        Math.round((+new Date(activeWindow.end) - Math.max(nowMs, +new Date(activeWindow.start))) / 60000)
      );
      windowEndIso = activeWindow.end;
    } else {
      availableMinutes = schedule.total_free_minutes;
    }
  }

  const current_window = {
    start_at: now.toISOString(),
    end_at: windowEndIso,
    available_minutes: availableMinutes,
    next_commitment: nextCommitment ? nextCommitment.title : null,
  };

  const openTasks = tasks.filter((t) => !t.done);
  const fittingTasks: CompactTask[] = [];
  const nonFittingTasks: CompactTask[] = [];

  for (const t of openTasks) {
    const duration = t.estimated_minutes ?? 30;
    const compact = toCompact(t);

    if (duration <= availableMinutes && availableMinutes > 0) {
      fittingTasks.push(compact);
    } else {
      nonFittingTasks.push(compact);
    }
  }

  // 2. Score and rank fitting tasks
  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  fittingTasks.sort((a, b) => {
    let scoreA = priorityScore[a.priority] ?? 1;
    let scoreB = priorityScore[b.priority] ?? 1;

    if (a.is_overdue) scoreA += 4;
    if (b.is_overdue) scoreB += 4;

    if (a.due_date === todayKey) scoreA += 3;
    if (b.due_date === todayKey) scoreB += 3;

    return scoreB - scoreA;
  });

  // 3. Select top recommended task if fitting tasks exist
  let recommended_task: CurrentWindowPlanning["recommended_task"] = null;

  if (fittingTasks.length > 0) {
    const top = fittingTasks[0];
    const reasons: string[] = [];

    if (top.is_overdue) reasons.push("it is overdue");
    else if (top.due_date === todayKey) reasons.push("it is scheduled for today");
    if (top.priority === "high") reasons.push("high priority");
    reasons.push(`fits within your available ${availableMinutes}m window`);

    if (nextCommitment) {
      reasons.push(`before "${nextCommitment.title}"`);
    }

    recommended_task = {
      task_id: top.id,
      name: top.name,
      estimated_minutes: top.estimated_minutes,
      reason: reasons.join(", "),
    };
  }

  return {
    current_window,
    fitting_tasks: fittingTasks,
    non_fitting_tasks: nonFittingTasks,
    recommended_task,
  };
}

export interface PlannedBlock {
  id: string;
  task_id: string;
  task_name: string;
  start_at: string; // ISO datetime
  end_at: string;   // ISO datetime
  duration_minutes: number;
  reason: string;
  is_adaptive_duration?: boolean;
  original_estimated_minutes?: number;
}

export interface DayPlan {
  date: string;
  generated_at: string;
  blocks: PlannedBlock[];
  unscheduled_tasks: CompactTask[];
  capacity_used_minutes: number;
  capacity_available_minutes: number;
  over_capacity_by_minutes: number;
  warnings: string[];
  historical_duration_multiplier: number;
}

export interface UserPlanningConstraints {
  no_work_after?: string; // e.g. "17:00"
  break_at?: string;      // e.g. "13:00"
  break_duration_minutes?: number; // default 30
  buffer_minutes_between_blocks?: number; // default 5
  min_window_minutes?: number; // default 15
  custom_duration_multiplier?: number;
}

/**
 * Calculates an adaptive planning multiplier based on past completed task performance or accepted memories.
 * Does NOT rewrite stored task estimates.
 */
export function calculateHistoricalDurationMultiplier(
  tasks: Task[],
  acceptedMemories?: CoachMemory[]
): number {
  if (acceptedMemories && acceptedMemories.length > 0) {
    const memoryMultiplier = extractAcceptedDurationMultiplier(acceptedMemories);
    if (typeof memoryMultiplier === "number" && memoryMultiplier >= 0.5) {
      return memoryMultiplier;
    }
  }

  const completedWithBoth = tasks.filter(
    (t) =>
      t.done &&
      typeof t.estimated_minutes === "number" &&
      t.estimated_minutes > 0 &&
      typeof t.actual_minutes === "number" &&
      t.actual_minutes > 0
  );

  if (completedWithBoth.length < 3) return 1.0;

  const sumEstimated = completedWithBoth.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);
  const sumActual = completedWithBoth.reduce((acc, t) => acc + (t.actual_minutes || 0), 0);

  if (sumEstimated === 0) return 1.0;

  const ratio = sumActual / sumEstimated;
  if (ratio > 1.15) {
    // Cap conservatively at 2.0x
    return Math.min(2.0, Math.round(ratio * 100) / 100);
  }

  return 1.0;
}

/**
 * Planning Engine V2 — Deterministic Day Plan Generator.
 * Constructs a physically realistic day schedule matching candidate tasks to free calendar windows,
 * taking into account historical duration multipliers, accepted adaptations, and user constraints,
 * without modifying stored task estimates.
 */
export function buildDayPlan({
  tasks,
  schedule,
  now,
  todayKey,
  toCompact,
  constraints,
  acceptedMemories,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  now: Date;
  todayKey: string;
  toCompact: (t: Task) => CompactTask;
  constraints?: UserPlanningConstraints;
  acceptedMemories?: CoachMemory[];
}): DayPlan {
  const nowMs = +now;
  const calculatedMultiplier = calculateHistoricalDurationMultiplier(tasks, acceptedMemories);
  const historicalMultiplier =
    typeof constraints?.custom_duration_multiplier === "number" && constraints.custom_duration_multiplier > 0
      ? constraints.custom_duration_multiplier
      : calculatedMultiplier;
  const bufferMin = constraints?.buffer_minutes_between_blocks ?? 5;
  const minWindowMin = constraints?.min_window_minutes ?? 15;

  // 1. Filter candidate tasks for today
  const openTasks = tasks.filter((t) => !t.done);
  const candidateTasks = openTasks.filter((t) => {
    // Overdue tasks
    if (t.due_date && t.due_date < todayKey) return true;
    // Scheduled for today
    if (t.due_date === todayKey) return true;
    // High-priority unscheduled tasks
    if (t.priority === "high" && !t.due_date) return true;
    return false;
  });

  // Score & sort candidates
  const priorityScore: Record<string, number> = { high: 10, medium: 5, low: 1 };
  candidateTasks.sort((a, b) => {
    let scoreA = priorityScore[a.priority] ?? 1;
    let scoreB = priorityScore[b.priority] ?? 1;
    if (a.due_date && a.due_date < todayKey) scoreA += 15;
    if (b.due_date && b.due_date < todayKey) scoreB += 15;
    if (a.due_date === todayKey) scoreA += 8;
    if (b.due_date === todayKey) scoreB += 8;
    return scoreB - scoreA;
  });

  // Track task planning durations without mutating stored task objects
  let hasDefaultEstimates = false;
  const taskPlanningDurations = new Map<string, { raw: number; planning: number }>();
  for (const t of candidateTasks) {
    const raw = t.estimated_minutes ?? 30;
    if (t.estimated_minutes == null) hasDefaultEstimates = true;
    const planning = Math.round(raw * historicalMultiplier);
    taskPlanningDurations.set(t.id, { raw, planning });
  }

  // 2. Prepare usable free windows
  let maxEndMs = Infinity;
  if (constraints?.no_work_after) {
    const [h, m] = constraints.no_work_after.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const maxDate = new Date(`${todayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      maxEndMs = +maxDate;
    }
  }

  const usableWindows: Array<{ startMs: number; endMs: number }> = [];
  for (const w of schedule.free_windows) {
    let wStartMs = Math.max(nowMs, +new Date(w.start));
    let wEndMs = Math.min(maxEndMs, +new Date(w.end));

    if (wEndMs - wStartMs >= minWindowMin * 60000) {
      if (constraints?.break_at) {
        const [bh, bm] = constraints.break_at.split(":").map(Number);
        if (!isNaN(bh) && !isNaN(bm)) {
          const breakStart = new Date(`${todayKey}T${String(bh).padStart(2, "0")}:${String(bm).padStart(2, "0")}:00`);
          const breakStartMs = +breakStart;
          const breakDuration = (constraints.break_duration_minutes ?? 30) * 60000;
          const breakEndMs = breakStartMs + breakDuration;

          if (breakStartMs > wStartMs && breakEndMs < wEndMs) {
            if (breakStartMs - wStartMs >= minWindowMin * 60000) {
              usableWindows.push({ startMs: wStartMs, endMs: breakStartMs });
            }
            if (wEndMs - breakEndMs >= minWindowMin * 60000) {
              usableWindows.push({ startMs: breakEndMs, endMs: wEndMs });
            }
            continue;
          } else if (breakStartMs <= wStartMs && breakEndMs > wStartMs) {
            wStartMs = Math.max(wStartMs, breakEndMs);
          } else if (breakStartMs < wEndMs && breakEndMs >= wEndMs) {
            wEndMs = Math.min(wEndMs, breakStartMs);
          }
        }
      }

      if (wEndMs - wStartMs >= minWindowMin * 60000) {
        usableWindows.push({ startMs: wStartMs, endMs: wEndMs });
      }
    }
  }

  // 3. Greedily schedule tasks into usable windows
  const blocks: PlannedBlock[] = [];
  const scheduledTaskIds = new Set<string>();
  let blockCounter = 1;

  for (const win of usableWindows) {
    let cursorMs = win.startMs;

    while (win.endMs - cursorMs >= minWindowMin * 60000) {
      const remainingWindowMinutes = Math.floor((win.endMs - cursorMs) / 60000);

      const candidate = candidateTasks.find((t) => {
        if (scheduledTaskIds.has(t.id)) return false;
        const dur = taskPlanningDurations.get(t.id)?.planning ?? 30;
        return dur <= remainingWindowMinutes;
      });

      if (!candidate) {
        break;
      }

      const { raw, planning } = taskPlanningDurations.get(candidate.id)!;
      const blockStart = new Date(cursorMs);
      const blockEnd = new Date(cursorMs + planning * 60000);

      const reasons: string[] = [];
      if (candidate.due_date && candidate.due_date < todayKey) reasons.push("overdue item");
      else if (candidate.due_date === todayKey) reasons.push("scheduled for today");
      if (candidate.priority === "high") reasons.push("high priority");
      reasons.push(`allocated ${planning}m`);

      blocks.push({
        id: `block-${blockCounter++}`,
        task_id: candidate.id,
        task_name: candidate.name,
        start_at: blockStart.toISOString(),
        end_at: blockEnd.toISOString(),
        duration_minutes: planning,
        reason: reasons.join(", "),
        is_adaptive_duration: historicalMultiplier > 1.15,
        original_estimated_minutes: raw,
      });

      scheduledTaskIds.add(candidate.id);
      cursorMs = +blockEnd + bufferMin * 60000;
    }
  }

  // 4. Unscheduled tasks
  const unscheduled_tasks = candidateTasks
    .filter((t) => !scheduledTaskIds.has(t.id))
    .map(toCompact);

  // 5. Compute metrics & warnings
  const capacityAvailableMinutes = usableWindows.reduce(
    (sum, w) => sum + Math.round((w.endMs - w.startMs) / 60000),
    0
  );
  const capacityUsedMinutes = blocks.reduce((sum, b) => sum + b.duration_minutes, 0);
  const totalNeededMinutes = candidateTasks.reduce(
    (sum, t) => sum + (taskPlanningDurations.get(t.id)?.planning ?? 30),
    0
  );
  const overCapacityByMinutes = Math.max(0, totalNeededMinutes - capacityAvailableMinutes);

  const warnings: string[] = [];
  if (overCapacityByMinutes > 0) {
    warnings.push(
      `Planned workload requires ${totalNeededMinutes}m but only ${capacityAvailableMinutes}m of usable focus time is available today (${overCapacityByMinutes}m deficit). ${unscheduled_tasks.length} tasks could not be scheduled.`
    );
  }
  if (historicalMultiplier > 1.15) {
    warnings.push(
      `Planning durations scaled by ${historicalMultiplier}x based on historical task completion times.`
    );
  }
  if (hasDefaultEstimates) {
    warnings.push(
      `One or more tasks lacked an explicit estimate and used a default 30m planning duration.`
    );
  }

  return {
    date: todayKey,
    generated_at: now.toISOString(),
    blocks,
    unscheduled_tasks,
    capacity_used_minutes: capacityUsedMinutes,
    capacity_available_minutes: capacityAvailableMinutes,
    over_capacity_by_minutes: overCapacityByMinutes,
    warnings,
    historical_duration_multiplier: historicalMultiplier,
  };
}
