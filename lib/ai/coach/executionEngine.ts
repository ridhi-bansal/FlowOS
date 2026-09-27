import "server-only";
import type { Task, CoachMemory, TaskEvent, CalendarEvent } from "@/types";
import type { CompactTask, ScheduleContext } from "./types";
import { calculateHistoricalDurationMultiplier } from "./planningEngine";

export interface ActiveExecutionTask {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  source: "user_selected" | "coach_recommended" | "planned_block";
  startedAt?: string;
}

export interface ExecutionWindow {
  start: string; // ISO
  end: string;   // ISO
  availableMinutes: number;
}

export interface ExecutionCommitment {
  start: string; // ISO
  title: string;
  source: "native" | "google";
}

export interface PlannedExecutionBlock {
  taskId: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  durationMinutes: number;
}

export interface ExecutionRecoveryOption {
  type: "choose_smaller_task" | "break_down_task" | "reschedule_task" | "replan_remaining_day";
  taskId?: string;
  label: string;
  prompt: string;
}

export interface ExecutionState {
  now: string;
  activeTask?: ActiveExecutionTask | null;
  recommendedTask?: {
    taskId: string;
    title: string;
    reason: string;
    estimatedMinutes: number;
  } | null;
  currentWindow?: ExecutionWindow | null;
  nextCommitment?: ExecutionCommitment | null;
  plannedBlock?: PlannedExecutionBlock | null;
  canStartRecommendedTask: boolean;
  blockers: string[];
  recoveryOptions: ExecutionRecoveryOption[];
}

/**
 * Deterministic Execution Engine for FlowOS AI Coach.
 *
 * Mandate:
 * - Deterministic single source of truth for "What should I do right now?"
 * - HARD INVARIANT: NEVER recommend an impossible task that cannot fit the current free window.
 * - Prioritize active planned blocks when valid and fitting.
 * - Detect calendar commitments (native and read-only Google Calendar overlay).
 * - Generate explainable recovery options when reality invalidates planned work.
 */
export function buildExecutionState({
  tasks,
  schedule,
  nativeEvents = [],
  activeTaskId,
  taskEvents = [],
  now = new Date(),
  todayKey,
  acceptedMemories,
  toCompact,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  nativeEvents?: CalendarEvent[];
  activeTaskId?: string;
  taskEvents?: TaskEvent[];
  now?: Date;
  todayKey: string;
  acceptedMemories?: CoachMemory[];
  toCompact?: (t: Task) => CompactTask;
}): ExecutionState {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const blockers: string[] = [];
  const recoveryOptions: ExecutionRecoveryOption[] = [];

  // 1. Calculate planning multiplier
  const multiplier = calculateHistoricalDurationMultiplier(tasks, acceptedMemories);

  // 2. Identify Current & Next Calendar Geometry
  // Check if user is currently in a busy commitment (meeting or event)
  const currentBusy = schedule.busy_blocks.find((b) => {
    if (b.all_day) return false;
    const startMs = new Date(b.start).getTime();
    const endMs = new Date(b.end).getTime();
    return startMs <= nowMs && endMs > nowMs;
  });

  const nextCommitmentBlock = schedule.busy_blocks
    .filter((b) => !b.all_day && new Date(b.start).getTime() > nowMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];

  const nextCommitment: ExecutionCommitment | null = nextCommitmentBlock
    ? {
        start: nextCommitmentBlock.start,
        title: nextCommitmentBlock.title,
        source: nextCommitmentBlock.source,
      }
    : null;

  let availableMinutes = 0;
  let windowStart = nowIso;
  let windowEnd = nowIso;

  if (currentBusy) {
    // Currently in a meeting / busy block: 0 minutes available right now
    availableMinutes = 0;
    windowStart = currentBusy.start;
    windowEnd = currentBusy.end;
    blockers.push(`Currently busy with "${currentBusy.title}" until ${new Date(currentBusy.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  } else if (nextCommitment) {
    const nextStartMs = new Date(nextCommitment.start).getTime();
    availableMinutes = Math.max(0, Math.round((nextStartMs - nowMs) / 60000));
    windowStart = nowIso;
    windowEnd = nextCommitment.start;
  } else {
    // No upcoming commitment; check current or next free window
    const activeWindow = schedule.free_windows.find((w) => new Date(w.end).getTime() > nowMs);
    if (activeWindow) {
      const wStartMs = Math.max(nowMs, new Date(activeWindow.start).getTime());
      const wEndMs = new Date(activeWindow.end).getTime();
      availableMinutes = Math.max(0, Math.round((wEndMs - wStartMs) / 60000));
      windowStart = new Date(wStartMs).toISOString();
      windowEnd = activeWindow.end;
    } else {
      availableMinutes = schedule.total_free_minutes;
    }
  }

  const currentWindow: ExecutionWindow = {
    start: windowStart,
    end: windowEnd,
    availableMinutes,
  };

  // 3. Inspect Native Time Blocks for today (Planned Block Awareness)
  const timeBlocks = nativeEvents.filter(
    (e) => e.kind === "time_block" && e.task_id
  );

  let plannedBlock: PlannedExecutionBlock | null = null;
  const activeTimeBlock = timeBlocks.find((b) => {
    const s = new Date(b.start_at).getTime();
    const e = new Date(b.end_at).getTime();
    // Covers now or starts within 10 minutes
    return (s <= nowMs && e > nowMs) || (s > nowMs && s - nowMs <= 10 * 60000);
  });

  if (activeTimeBlock && activeTimeBlock.task_id) {
    const task = tasks.find((t) => t.id === activeTimeBlock.task_id);
    if (task) {
      const dur = Math.round(
        (new Date(activeTimeBlock.end_at).getTime() - new Date(activeTimeBlock.start_at).getTime()) / 60000
      );
      plannedBlock = {
        taskId: task.id,
        title: task.name,
        start: activeTimeBlock.start_at,
        end: activeTimeBlock.end_at,
        durationMinutes: dur,
      };
    }
  }

  // 4. Resolve Active Task (if explicitly started or passed in)
  let activeTask: ActiveExecutionTask | null = null;
  if (activeTaskId) {
    const t = tasks.find((item) => item.id === activeTaskId);
    if (t && !t.done) {
      activeTask = {
        taskId: t.id,
        title: t.name,
        estimatedMinutes: Math.round((t.estimated_minutes ?? 30) * multiplier),
        source: plannedBlock?.taskId === t.id ? "planned_block" : "user_selected",
      };
    }
  }

  // 5. Candidate Task Scoring & Hard Invariant Filter
  const openTasks = tasks.filter((t) => !t.done);

  // Map postpone counts
  const postponesByTask = new Map<string, number>();
  for (const evt of taskEvents) {
    if (evt.event_type === "postponed") {
      postponesByTask.set(evt.task_id, (postponesByTask.get(evt.task_id) || 0) + 1);
    }
  }

  interface ScoredTask {
    task: Task;
    rawDuration: number;
    effectiveDuration: number;
    score: number;
    fits: boolean;
    reasons: string[];
  }

  const scoredTasks: ScoredTask[] = openTasks.map((t) => {
    const rawDuration = t.estimated_minutes ?? 30;
    const effectiveDuration = Math.round(rawDuration * multiplier);
    const fits = availableMinutes > 0 && effectiveDuration <= availableMinutes;

    let score = 0;
    const reasons: string[] = [];

    // Planned block preference
    if (plannedBlock && plannedBlock.taskId === t.id) {
      score += 25;
      reasons.push("scheduled in your planned focus block");
    }

    // Overdue
    if (t.due_date && t.due_date < todayKey) {
      score += 15;
      reasons.push("it is overdue");
    } else if (t.due_date === todayKey) {
      score += 10;
      reasons.push("scheduled for today");
    } else if (t.due_date) {
      const days = Math.round((new Date(t.due_date).getTime() - nowMs) / 86400000);
      if (days <= 3 && days >= 0) {
        score += 3;
        reasons.push(`due in ${days === 0 ? "today" : days + "d"}`);
      }
    }

    // Priority
    if (t.priority === "high") {
      score += 8;
      reasons.push("high priority");
    } else if (t.priority === "medium") {
      score += 4;
    }

    // Postponed friction
    const pCount = postponesByTask.get(t.id) || 0;
    if (pCount > 0) {
      score += Math.min(pCount, 4);
      reasons.push(`postponed ${pCount}x`);
    }

    // Window fit bonus
    if (fits) {
      reasons.push(`fits within ${availableMinutes}m available`);
      if (nextCommitment) {
        reasons.push(`before "${nextCommitment.title}"`);
      }
    }

    return {
      task: t,
      rawDuration,
      effectiveDuration,
      score,
      fits,
      reasons,
    };
  });

  // Sort by score descending
  scoredTasks.sort((a, b) => b.score - a.score);

  // HARD INVARIANT: Fitting tasks only for recommendation
  const fittingTasks = scoredTasks.filter((st) => st.fits);
  const oversizedTasks = scoredTasks.filter((st) => !st.fits);

  let recommendedTask: ExecutionState["recommendedTask"] = null;
  let canStartRecommendedTask = false;

  if (availableMinutes <= 0) {
    // No window right now
    canStartRecommendedTask = false;
    if (!currentBusy) {
      blockers.push("No available free window in current schedule.");
    }
    recoveryOptions.push({
      type: "replan_remaining_day",
      label: "Replan the rest of my day",
      prompt: "Replan the rest of my day based on my current schedule.",
    });
  } else if (fittingTasks.length > 0) {
    const top = fittingTasks[0];
    recommendedTask = {
      taskId: top.task.id,
      title: top.task.name,
      reason: top.reasons.join(", "),
      estimatedMinutes: top.effectiveDuration,
    };
    canStartRecommendedTask = true;
  } else {
    // Open tasks exist, but NONE fit within availableMinutes
    canStartRecommendedTask = false;
    const shortestTask = [...scoredTasks].sort((a, b) => a.effectiveDuration - b.effectiveDuration)[0];

    if (shortestTask) {
      blockers.push(
        `You have ${availableMinutes}m before "${nextCommitment?.title || "your next commitment"}", but your shortest open task ("${shortestTask.task.name}") requires ${shortestTask.effectiveDuration}m.`
      );

      // Offer concrete recovery options:
      // 1. Break down top priority task
      const topOversized = oversizedTasks[0] || shortestTask;
      recoveryOptions.push({
        type: "break_down_task",
        taskId: topOversized.task.id,
        label: `Break down "${topOversized.task.name}"`,
        prompt: `Break down "${topOversized.task.name}" into smaller tasks that fit in ${availableMinutes} minutes.`,
      });

      // 2. Reschedule task
      recoveryOptions.push({
        type: "reschedule_task",
        taskId: topOversized.task.id,
        label: `Reschedule "${topOversized.task.name}"`,
        prompt: `Reschedule "${topOversized.task.name}" to the next suitable free window today.`,
      });

      // 3. Replan remaining day
      recoveryOptions.push({
        type: "replan_remaining_day",
        label: "Replan the rest of today",
        prompt: "Replan the rest of my day to match my remaining free windows.",
      });
    } else {
      blockers.push("No open tasks on your list right now.");
    }
  }

  // If a fitting task was recommended, also offer a smaller alternative if available
  if (recommendedTask && fittingTasks.length > 1) {
    const smallerAlternative = fittingTasks.find(
      (ft) => ft.effectiveDuration < recommendedTask!.estimatedMinutes
    );
    if (smallerAlternative) {
      recoveryOptions.push({
        type: "choose_smaller_task",
        taskId: smallerAlternative.task.id,
        label: `Quick alternative: "${smallerAlternative.task.name}" (${smallerAlternative.effectiveDuration}m)`,
        prompt: `I prefer a smaller task right now. Let's do "${smallerAlternative.task.name}".`,
      });
    }
  }

  return {
    now: nowIso,
    activeTask,
    recommendedTask,
    currentWindow,
    nextCommitment,
    plannedBlock,
    canStartRecommendedTask,
    blockers,
    recoveryOptions,
  };
}
