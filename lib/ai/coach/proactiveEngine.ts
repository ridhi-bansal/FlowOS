import "server-only";
import crypto from "crypto";
import type { Task, TaskEvent } from "@/types";
import type { ScheduleContext } from "./types";
import type { DailyState } from "./dailyIntelligenceEngine";

export type CoachTriggerType =
  | "morning_briefing"
  | "day_overloaded"
  | "task_no_longer_fits"
  | "repeated_postponement"
  | "unused_capacity"
  | "large_task_without_window";

export type TriggerPriority = "urgent" | "high" | "medium" | "low";

export interface CoachTriggerAction {
  label: string;
  action_type: "chat_prompt" | "open_planner";
  prompt: string;
}

export interface CoachTrigger {
  id: string; // Deterministic 16-char hex signature
  type: CoachTriggerType;
  priority: TriggerPriority;
  title: string;
  message: string;
  suggested_action: CoachTriggerAction;
  evidence: Record<string, unknown>;
  relevant_entity_id?: string;
  created_at: string;
  expires_at?: string;
}

const PRIORITY_RANK: Record<TriggerPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Deterministic hash signature for trigger deduplication.
 * Prevents identical triggers from repeatedly popping up across page loads and component renders.
 */
export function computeTriggerSignature({
  userId,
  type,
  date,
  entityId = "none",
  stateSignature,
}: {
  userId: string;
  type: CoachTriggerType;
  date: string;
  entityId?: string;
  stateSignature: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${type}:${date}:${entityId}:${stateSignature}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Evaluates proactive triggers deterministically from factual user operating state.
 * Returns at most 3 highest-priority active triggers, filtering out expired or dismissed items.
 */
export function evaluateProactiveTriggers({
  userId,
  dailyState,
  tasks,
  schedule,
  taskEvents = [],
  dismissedSignatures = new Set<string>(),
  now = new Date(),
  timezone = "UTC",
  todayKey,
}: {
  userId: string;
  dailyState: DailyState;
  tasks: Task[];
  schedule: ScheduleContext;
  taskEvents?: TaskEvent[];
  dismissedSignatures?: Set<string> | string[];
  now?: Date;
  timezone?: string;
  todayKey: string;
}): CoachTrigger[] {
  const dismissedSet =
    dismissedSignatures instanceof Set ? dismissedSignatures : new Set(dismissedSignatures || []);

  const candidates: CoachTrigger[] = [];
  const openTasks = tasks.filter((t) => !t.done);
  const todayTasks = openTasks.filter((t) => t.due_date === todayKey);
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < todayKey);

  // 1. Trigger: Morning Briefing
  // Fires only during morning hours (05:00 - 12:59) when there is scheduled work/commitments today
  const localHourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const localHour = parseInt(localHourStr, 10);

  const hasActivityToday =
    todayTasks.length > 0 ||
    overdueTasks.length > 0 ||
    schedule.busy_blocks.length > 0 ||
    dailyState.capacity.free_minutes_today > 0;

  if (localHour >= 5 && localHour < 13 && hasActivityToday) {
    const freeMin = dailyState.capacity.free_minutes_today;
    const taskCount = dailyState.workload.today_task_count;
    const overdueCount = dailyState.workload.overdue_count;
    const meetingCount = schedule.busy_blocks.filter((b) => !b.all_day).length;

    const stateSig = `${taskCount}:${overdueCount}:${meetingCount}:${Math.round(freeMin)}`;
    const sig = computeTriggerSignature({
      userId,
      type: "morning_briefing",
      date: todayKey,
      entityId: "none",
      stateSignature: stateSig,
    });

    const parts: string[] = [`Good morning. You have ${formatMinutes(freeMin)} of usable focus time today`];
    if (meetingCount > 0) {
      parts.push(`across ${schedule.free_windows.length} free window(s), with ${meetingCount} commitment(s) scheduled.`);
    } else {
      parts.push(`with an open calendar.`);
    }
    if (taskCount > 0) {
      parts.push(`You have ${taskCount} task(s) scheduled for today.`);
    }
    if (overdueCount > 0) {
      parts.push(`Note: ${overdueCount} task(s) are overdue.`);
    }

    candidates.push({
      id: sig,
      type: "morning_briefing",
      priority: "high",
      title: "Morning briefing",
      message: parts.join(" "),
      suggested_action: {
        label: "Plan my day",
        action_type: "chat_prompt",
        prompt: "Plan my day",
      },
      evidence: {
        free_minutes_today: freeMin,
        commitments_count: meetingCount,
        today_tasks_count: taskCount,
        overdue_count: overdueCount,
        windows_count: schedule.free_windows.length,
      },
      created_at: now.toISOString(),
      expires_at: `${todayKey}T13:00:00.000Z`,
    });
  }

  // 2. Trigger: Day Overloaded
  // Deterministically fires when planned task workload exceeds available free calendar time by >= 15m
  const plannedMinutes = dailyState.capacity.planned_minutes_today;
  const freeMinutes = dailyState.capacity.free_minutes_today;
  const overCapacityMinutes = Math.max(0, plannedMinutes - freeMinutes);

  if (
    dailyState.capacity.status === "overloaded" ||
    (plannedMinutes > freeMinutes && overCapacityMinutes >= 15)
  ) {
    const stateSig = `${Math.round(plannedMinutes)}:${Math.round(freeMinutes)}:${overCapacityMinutes}`;
    const sig = computeTriggerSignature({
      userId,
      type: "day_overloaded",
      date: todayKey,
      entityId: "none",
      stateSignature: stateSig,
    });

    candidates.push({
      id: sig,
      type: "day_overloaded",
      priority: "high",
      title: "Schedule overloaded",
      message: `You have about ${formatMinutes(freeMinutes)} of usable focus time but roughly ${formatMinutes(plannedMinutes)} of planned work today (${overCapacityMinutes}m deficit). Something will likely need to be postponed or pruned.`,
      suggested_action: {
        label: "Review plan",
        action_type: "chat_prompt",
        prompt: "My schedule is overloaded today. Help me decide what to postpone or prune.",
      },
      evidence: {
        capacity_available_minutes: freeMinutes,
        planned_minutes: plannedMinutes,
        over_capacity_by_minutes: overCapacityMinutes,
        load_ratio: dailyState.capacity.load_ratio,
      },
      created_at: now.toISOString(),
      expires_at: `${todayKey}T23:59:59.999Z`,
    });
  }

  // 3. Trigger: Task No Longer Fits
  // Triggered when an active priority task requires more time than the remaining current window before the next commitment
  if (dailyState.current_window && dailyState.next_commitment) {
    const windowAvailable = dailyState.current_window.available_minutes;
    const candidatesForWindow = todayTasks.length > 0 ? todayTasks : overdueTasks;

    // Find highest priority task that cannot fit into current window
    const nonFittingCandidate = candidatesForWindow.find((t) => {
      const dur = t.estimated_minutes ?? 30;
      return dur > windowAvailable && windowAvailable > 0;
    });

    if (nonFittingCandidate) {
      const dur = nonFittingCandidate.estimated_minutes ?? 30;
      const nextTitle = dailyState.next_commitment.title;
      const stateSig = `${nonFittingCandidate.id}:${dur}:${windowAvailable}:${nextTitle}`;
      const sig = computeTriggerSignature({
        userId,
        type: "task_no_longer_fits",
        date: todayKey,
        entityId: nonFittingCandidate.id,
        stateSignature: stateSig,
      });

      candidates.push({
        id: sig,
        type: "task_no_longer_fits",
        priority: "high",
        title: "Task no longer fits",
        message: `"${nonFittingCandidate.name}" (${dur}m) no longer fits in your current ${windowAvailable}m window before "${nextTitle}".`,
        suggested_action: {
          label: "Find another window",
          action_type: "chat_prompt",
          prompt: `"${nonFittingCandidate.name}" no longer fits before my next meeting. What can I work on instead or when should I schedule it?`,
        },
        evidence: {
          task_id: nonFittingCandidate.id,
          task_name: nonFittingCandidate.name,
          task_duration_minutes: dur,
          window_available_minutes: windowAvailable,
          next_commitment: nextTitle,
          next_commitment_source: dailyState.next_commitment.source,
        },
        relevant_entity_id: nonFittingCandidate.id,
        created_at: now.toISOString(),
        expires_at: dailyState.next_commitment.start_at,
      });
    }
  }

  // 4. Trigger: Repeated Postponement
  // Triggered when a task has been postponed >= 2 times in task events history
  const postponesByTask = new Map<string, number>();
  for (const evt of taskEvents) {
    if (evt.event_type === "postponed") {
      postponesByTask.set(evt.task_id, (postponesByTask.get(evt.task_id) || 0) + 1);
    }
  }

  for (const t of openTasks) {
    const count = postponesByTask.get(t.id) || 0;
    if (count >= 2) {
      const stateSig = `${t.id}:${count}:${t.due_date || "nodue"}`;
      const sig = computeTriggerSignature({
        userId,
        type: "repeated_postponement",
        date: todayKey,
        entityId: t.id,
        stateSignature: stateSig,
      });

      candidates.push({
        id: sig,
        type: "repeated_postponement",
        priority: "medium",
        title: "Task postponed repeatedly",
        message: `You've postponed "${t.name}" ${count} times. Would you like to break it down into smaller actionable steps, reschedule it, or keep it as-is?`,
        suggested_action: {
          label: "Break it down",
          action_type: "chat_prompt",
          prompt: `Break down "${t.name}" into smaller actionable subtasks`,
        },
        evidence: {
          task_id: t.id,
          task_name: t.name,
          postpone_count: count,
          current_due_date: t.due_date,
        },
        relevant_entity_id: t.id,
        created_at: now.toISOString(),
        expires_at: `${todayKey}T23:59:59.999Z`,
      });
      break; // Surface one repeated postponement trigger at a time
    }
  }

  // 5. Trigger: Unused Capacity
  // Fires when surplus free time >= 120m (under capacity) and there is a protected window >= 60m
  const surplusMinutes = freeMinutes - plannedMinutes;
  const hasDeepWindow = schedule.free_windows.some((w) => w.duration_minutes >= 60);

  if (
    dailyState.capacity.status === "under_capacity" &&
    surplusMinutes >= 120 &&
    hasDeepWindow &&
    openTasks.length > 0
  ) {
    const stateSig = `${Math.round(freeMinutes)}:${Math.round(plannedMinutes)}:${surplusMinutes}`;
    const sig = computeTriggerSignature({
      userId,
      type: "unused_capacity",
      date: todayKey,
      entityId: "none",
      stateSignature: stateSig,
    });

    candidates.push({
      id: sig,
      type: "unused_capacity",
      priority: "low",
      title: "Unused focus capacity",
      message: `You have ${formatMinutes(surplusMinutes)} of unallocated focus time available today. It's a great opportunity to make progress on a long-term goal or advance tomorrow's tasks.`,
      suggested_action: {
        label: "Explore priorities",
        action_type: "chat_prompt",
        prompt: "I have extra free time today. What high-impact task or goal should I advance?",
      },
      evidence: {
        free_minutes_today: freeMinutes,
        planned_minutes_today: plannedMinutes,
        surplus_minutes: surplusMinutes,
      },
      created_at: now.toISOString(),
      expires_at: `${todayKey}T23:59:59.999Z`,
    });
  }

  // 6. Trigger: Large Task Without Window
  // Fires when an open candidate task requires >= 60m but exceeds ALL available free windows today
  const maxAvailableWindow = schedule.free_windows.reduce(
    (max, w) => Math.max(max, w.duration_minutes),
    0
  );

  const largeUnfittingTask = todayTasks.find((t) => {
    const dur = t.estimated_minutes ?? 30;
    return dur >= 60 && dur > maxAvailableWindow && maxAvailableWindow > 0;
  });

  if (largeUnfittingTask) {
    const dur = largeUnfittingTask.estimated_minutes ?? 30;
    const stateSig = `${largeUnfittingTask.id}:${dur}:${maxAvailableWindow}`;
    const sig = computeTriggerSignature({
      userId,
      type: "large_task_without_window",
      date: todayKey,
      entityId: largeUnfittingTask.id,
      stateSignature: stateSig,
    });

    candidates.push({
      id: sig,
      type: "large_task_without_window",
      priority: "medium",
      title: "Large task without fitting window",
      message: `"${largeUnfittingTask.name}" requires ${dur}m, but your largest remaining free window today is only ${maxAvailableWindow}m. Would you like to break it down or reschedule it?`,
      suggested_action: {
        label: "Break it down",
        action_type: "chat_prompt",
        prompt: `"${largeUnfittingTask.name}" (${dur}m) does not fit into any remaining free windows today. Help me break it down or reschedule it.`,
      },
      evidence: {
        task_id: largeUnfittingTask.id,
        task_name: largeUnfittingTask.name,
        task_duration_minutes: dur,
        max_available_window_minutes: maxAvailableWindow,
      },
      relevant_entity_id: largeUnfittingTask.id,
      created_at: now.toISOString(),
      expires_at: `${todayKey}T23:59:59.999Z`,
    });
  }

  // Deduplication & Expiry filtering
  const nowMs = +now;
  const filtered = candidates.filter((trigger) => {
    if (dismissedSet.has(trigger.id)) {
      return false;
    }
    if (trigger.expires_at && new Date(trigger.expires_at).getTime() <= nowMs) {
      return false;
    }
    return true;
  });

  const TYPE_PRESENTATION_WEIGHT: Record<CoachTriggerType, number> = {
    task_no_longer_fits: 100,
    day_overloaded: 80,
    large_task_without_window: 70,
    repeated_postponement: 60,
    morning_briefing: 40,
    unused_capacity: 20,
  };

  function getTriggerPresentationScore(trigger: CoachTrigger): number {
    const priorityWeight = (PRIORITY_RANK[trigger.priority] || 1) * 100;
    let typeWeight = TYPE_PRESENTATION_WEIGHT[trigger.type] || 0;
    if (trigger.type === "morning_briefing") {
      const currentHour = now.getHours();
      if (currentHour >= 12) {
        typeWeight = 5; // deprioritize morning briefing in afternoon/evening
      }
    }
    return priorityWeight + typeWeight;
  }

  // Sort by presentation score descending (Priority rank + Type weight + Time-of-day)
  filtered.sort((a, b) => getTriggerPresentationScore(b) - getTriggerPresentationScore(a));

  // Cap at maximum 3 active triggers to avoid cognitive overload
  return filtered.slice(0, 3);
}
