import "server-only";
import crypto from "crypto";
import type { Task, FocusSession, TaskEvent, CoachMemory } from "@/types";
import type { ScheduleContext } from "./types";
import type { DailyState } from "./dailyIntelligenceEngine";

export type ReflectionObservationType =
  | "completed_as_planned"
  | "completed_late"
  | "not_completed"
  | "postponed"
  | "duration_overrun"
  | "duration_underrun"
  | "unused_capacity"
  | "overloaded_day"
  | "fragmented_schedule"
  | "successful_focus_window";

export interface ReflectionObservation {
  type: ReflectionObservationType;
  entity_id?: string;
  entity_name?: string;
  date: string;
  evidence: Record<string, unknown>;
  confidence: number; // 0.0 to 1.0
}

export type AdaptationType =
  | "duration_adjustment"
  | "protect_time_window"
  | "reduce_planning_load"
  | "prefer_shorter_tasks"
  | "break_down_repeatedly_postponed_task"
  | "use_available_capacity";

export interface AdaptationCandidate {
  id: string; // deterministic SHA-256 signature
  type: AdaptationType;
  title: string;
  explanation: string;
  suggested_action: {
    label: string;
    prompt: string;
  };
  evidence: ReflectionObservation[];
  confidence: number;
  confidence_level: "high" | "medium" | "low";
  status: "candidate" | "accepted" | "rejected" | "expired";
  target_value?: {
    multiplier?: number;
    window?: "morning" | "afternoon";
    task_id?: string;
    task_name?: string;
  };
  created_at: string;
}

export interface DailyReflectionSummary {
  id: string; // deterministic signature hash
  date: string;
  tasks_planned_count: number;
  tasks_completed_count: number;
  tasks_postponed_count: number;
  observations: ReflectionObservation[];
  adaptation_candidates: AdaptationCandidate[];
  reflection_prompt?: {
    headline: string;
    message: string;
    suggested_action?: {
      label: string;
      prompt: string;
    };
  };
}

/**
 * Computes a deterministic 16-character SHA-256 signature for deduplication.
 * When the underlying state remains identical, the signature stays unchanged across page reloads.
 */
export function computeReflectionSignature(
  userId: string,
  date: string,
  entityId: string,
  stateSignature: string
): string {
  const raw = `${userId}:${date}:${entityId}:${stateSignature}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function getLocalHour(isoString: string, timezone: string = "UTC"): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(isoString));
    return parseInt(formatted, 10);
  } catch {
    return new Date(isoString).getUTCHours();
  }
}

/**
 * Compares planned vs actual task performance and schedule execution using concrete factual signals.
 * Never invents psychological explanations or unobserved timestamps.
 */
export function analyzeTaskOutcomes({
  tasks,
  taskEvents = [],
  focusSessions = [],
  todayKey,
  schedule,
  dailyState,
  timezone = "UTC",
}: {
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  todayKey: string;
  schedule?: ScheduleContext;
  dailyState?: DailyState;
  timezone?: string;
}): ReflectionObservation[] {
  const observations: ReflectionObservation[] = [];

  // 1. Task Completion Timing & Status for today's planned tasks
  const todayTasks = tasks.filter((t) => t.due_date === todayKey);
  for (const t of todayTasks) {
    if (t.done) {
      const completedDate = t.completed_at ? t.completed_at.slice(0, 10) : todayKey;
      if (completedDate <= todayKey) {
        observations.push({
          type: "completed_as_planned",
          entity_id: t.id,
          entity_name: t.name,
          date: todayKey,
          evidence: {
            task_name: t.name,
            due_date: t.due_date,
            completed_at: t.completed_at,
          },
          confidence: 0.9,
        });
      } else {
        observations.push({
          type: "completed_late",
          entity_id: t.id,
          entity_name: t.name,
          date: todayKey,
          evidence: {
            task_name: t.name,
            due_date: t.due_date,
            completed_at: t.completed_at,
          },
          confidence: 0.9,
        });
      }
    } else {
      observations.push({
        type: "not_completed",
        entity_id: t.id,
        entity_name: t.name,
        date: todayKey,
        evidence: {
          task_name: t.name,
          due_date: t.due_date,
          status: t.status,
          priority: t.priority,
        },
        confidence: 0.85,
      });
    }
  }

  // 2. Postponement Events in task history
  for (const evt of taskEvents) {
    if (evt.event_type === "postponed") {
      const task = tasks.find((t) => t.id === evt.task_id);
      observations.push({
        type: "postponed",
        entity_id: evt.task_id,
        entity_name: task?.name || "Task",
        date: evt.created_at ? evt.created_at.slice(0, 10) : todayKey,
        evidence: {
          event_type: "postponed",
          old_value: evt.old_value,
          new_value: evt.new_value,
          created_at: evt.created_at,
        },
        confidence: 0.95,
      });
    }
  }

  // 3. Duration Overrun and Underrun Observations
  const completedWithBoth = tasks.filter(
    (t) =>
      t.done &&
      typeof t.estimated_minutes === "number" &&
      t.estimated_minutes > 0 &&
      typeof t.actual_minutes === "number" &&
      t.actual_minutes > 0
  );

  for (const t of completedWithBoth) {
    const est = t.estimated_minutes!;
    const act = t.actual_minutes!;
    const ratio = act / est;

    if (ratio > 1.15) {
      observations.push({
        type: "duration_overrun",
        entity_id: t.id,
        entity_name: t.name,
        date: t.completed_at ? t.completed_at.slice(0, 10) : todayKey,
        evidence: {
          task_name: t.name,
          estimated_minutes: est,
          actual_minutes: act,
          overrun_ratio: Math.round(ratio * 100) / 100,
          excess_minutes: act - est,
        },
        confidence: 0.9,
      });
    } else if (ratio < 0.85 && est >= 30) {
      observations.push({
        type: "duration_underrun",
        entity_id: t.id,
        entity_name: t.name,
        date: t.completed_at ? t.completed_at.slice(0, 10) : todayKey,
        evidence: {
          task_name: t.name,
          estimated_minutes: est,
          actual_minutes: act,
          underrun_ratio: Math.round(ratio * 100) / 100,
          saved_minutes: est - act,
        },
        confidence: 0.85,
      });
    }
  }

  // 4. Successful Focus Windows (Rating >= 4 and Duration >= 30m)
  for (const s of focusSessions) {
    if (s.ended_at && (s.actual_minutes ?? s.planned_minutes ?? 0) >= 30 && (s.rating ?? 0) >= 4) {
      const hour = getLocalHour(s.started_at, timezone);
      const timeOfDay = hour >= 6 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "evening";
      observations.push({
        type: "successful_focus_window",
        entity_id: s.id,
        date: s.started_at.slice(0, 10),
        evidence: {
          session_id: s.id,
          duration_minutes: s.actual_minutes ?? s.planned_minutes,
          rating: s.rating,
          time_of_day: timeOfDay,
          started_at: s.started_at,
        },
        confidence: 0.9,
      });
    }
  }

  // 5. Schedule & Capacity Observations
  if (schedule) {
    const plannedMinutesToday = todayTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0);
    if (schedule.total_free_minutes > 0 && plannedMinutesToday > schedule.total_free_minutes) {
      observations.push({
        type: "overloaded_day",
        date: todayKey,
        evidence: {
          planned_minutes: plannedMinutesToday,
          free_minutes: schedule.total_free_minutes,
          deficit_minutes: plannedMinutesToday - schedule.total_free_minutes,
        },
        confidence: 0.95,
      });
    } else if (schedule.total_free_minutes >= 180 && plannedMinutesToday <= schedule.total_free_minutes * 0.5) {
      observations.push({
        type: "unused_capacity",
        date: todayKey,
        evidence: {
          planned_minutes: plannedMinutesToday,
          free_minutes: schedule.total_free_minutes,
          surplus_minutes: schedule.total_free_minutes - plannedMinutesToday,
        },
        confidence: 0.9,
      });
    }

    const shortWindows = schedule.free_windows.filter((w) => w.duration_minutes < 45);
    if (schedule.free_windows.length >= 3 && shortWindows.length / schedule.free_windows.length >= 0.6) {
      observations.push({
        type: "fragmented_schedule",
        date: todayKey,
        evidence: {
          total_windows: schedule.free_windows.length,
          short_windows: shortWindows.length,
        },
        confidence: 0.85,
      });
    }
  } else if (dailyState) {
    if (dailyState.capacity.status === "overloaded") {
      observations.push({
        type: "overloaded_day",
        date: todayKey,
        evidence: {
          planned_minutes: dailyState.capacity.planned_minutes_today,
          free_minutes: dailyState.capacity.free_minutes_today,
          deficit_minutes: dailyState.capacity.deficit_or_surplus_minutes,
        },
        confidence: 0.95,
      });
    }
  }

  return observations;
}

/**
 * Deterministically constructs bounded, explainable adaptation candidates from repeated observations.
 * Follows strict confidence thresholds:
 * - High confidence: >= 3 consistent observations (confidence >= 0.7)
 * - Medium confidence: >= 2 consistent observations (confidence >= 0.5)
 * - Low confidence: 1 observation (confidence < 0.5; not automatically converted to planning adaptations)
 */
export function buildAdaptationCandidates({
  userId,
  observations,
  tasks,
  taskEvents = [],
  focusSessions = [],
  existingMemories = [],
  todayKey,
}: {
  userId: string;
  observations: ReflectionObservation[];
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  existingMemories?: CoachMemory[];
  todayKey: string;
}): AdaptationCandidate[] {
  const candidates: AdaptationCandidate[] = [];

  // Check which adaptations already exist in active memories
  const activeMemoryTexts = existingMemories
    .filter((m) => m.status === "active")
    .map((m) => m.content.toLowerCase());

  // 1. Duration Underestimation Pattern (Observed tasks taking > 15% longer than planned)
  const durationOverruns = observations.filter((o) => o.type === "duration_overrun");
  if (durationOverruns.length > 0) {
    const totalEst = durationOverruns.reduce((acc, o) => acc + ((o.evidence.estimated_minutes as number) || 0), 0);
    const totalAct = durationOverruns.reduce((acc, o) => acc + ((o.evidence.actual_minutes as number) || 0), 0);
    const avgRatio = totalEst > 0 ? totalAct / totalEst : 1.25;
    const boundedMultiplier = Math.min(2.0, Math.round(avgRatio * 100) / 100);
    const overrunPercent = Math.round((boundedMultiplier - 1.0) * 100);

    const isAlreadyAdopted = activeMemoryTexts.some(
      (txt) => txt.includes("duration adjustment") || txt.includes("multiplier")
    );

    if (!isAlreadyAdopted) {
      const count = durationOverruns.length;
      let confidence = 0.35;
      let confidenceLevel: "high" | "medium" | "low" = "low";

      if (count >= 3) {
        confidence = 0.85;
        confidenceLevel = "high";
      } else if (count >= 2) {
        confidence = 0.60;
        confidenceLevel = "medium";
      }

      // Only generate actionable candidate if confidence is medium or high (>= 2 observations)
      if (count >= 2) {
        const id = computeReflectionSignature(
          userId,
          todayKey,
          "duration_adjustment",
          `overruns:${count}:ratio:${boundedMultiplier}`
        );

        candidates.push({
          id,
          type: "duration_adjustment",
          title: "Account for Task Underestimation",
          explanation: `Your completed tasks have averaged ~${overrunPercent}% longer than initial estimates across ${count} tasks. Adapting future planning to give tasks more room will make your schedule more realistic without changing your baseline estimates.`,
          suggested_action: {
            label: `Use ${boundedMultiplier}x Multiplier`,
            prompt: `I noticed my tasks take about ${overrunPercent}% longer than estimated. Let's factor a ${boundedMultiplier}x multiplier into future day planning.`,
          },
          evidence: durationOverruns,
          confidence,
          confidence_level: confidenceLevel,
          status: "candidate",
          target_value: {
            multiplier: boundedMultiplier,
          },
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // 2. Duration Overestimation Pattern (Observed tasks taking < 85% of estimated time consistently)
  const durationUnderruns = observations.filter((o) => o.type === "duration_underrun");
  if (durationUnderruns.length >= 3) {
    const isAlreadyAdopted = activeMemoryTexts.some((txt) => txt.includes("overestimating duration"));
    if (!isAlreadyAdopted) {
      const id = computeReflectionSignature(
        userId,
        todayKey,
        "duration_overestimation",
        `underruns:${durationUnderruns.length}`
      );

      candidates.push({
        id,
        type: "duration_adjustment",
        title: "Calibrate Task Overestimation",
        explanation: `You've consistently completed estimated tasks ahead of schedule across ${durationUnderruns.length} tasks. We can calibrate planning windows to fit more efficiently.`,
        suggested_action: {
          label: "Adjust Estimates",
          prompt: "I tend to complete tasks faster than estimated. Let's calibrate future planning blocks accordingly.",
        },
        evidence: durationUnderruns,
        confidence: 0.75,
        confidence_level: "high",
        status: "candidate",
        target_value: {
          multiplier: 0.85,
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  // 3. Repeated Postponement Pattern (Tasks postponed >= 2 times in task events)
  if (taskEvents.length > 0) {
    const postponesByTask = new Map<string, number>();
    for (const evt of taskEvents) {
      if (evt.event_type === "postponed") {
        postponesByTask.set(evt.task_id, (postponesByTask.get(evt.task_id) || 0) + 1);
      }
    }

    const openTasks = tasks.filter((t) => !t.done);
    for (const t of openTasks) {
      const pCount = postponesByTask.get(t.id) || 0;
      if (pCount >= 2) {
        const taskEvts = observations.filter(
          (o) => o.type === "postponed" && o.entity_id === t.id
        );
        const id = computeReflectionSignature(
          userId,
          todayKey,
          t.id,
          `postponed:${pCount}`
        );

        candidates.push({
          id,
          type: "break_down_repeatedly_postponed_task",
          title: `Break Down "${t.name}"`,
          explanation: `Task "${t.name}" has been postponed ${pCount} times. Breaking it down into 2 to 4 smaller actionable steps can resolve friction and make starting easier.`,
          suggested_action: {
            label: "Break Down Task",
            prompt: `Task "${t.name}" has been postponed ${pCount} times. Help me break it down into smaller actionable subtasks.`,
          },
          evidence: taskEvts.length > 0 ? taskEvts : [
            {
              type: "postponed",
              entity_id: t.id,
              entity_name: t.name,
              date: todayKey,
              evidence: { postpone_count: pCount },
              confidence: 0.9,
            },
          ],
          confidence: pCount >= 3 ? 0.85 : 0.65,
          confidence_level: pCount >= 3 ? "high" : "medium",
          status: "candidate",
          target_value: {
            task_id: t.id,
            task_name: t.name,
          },
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // 4. Successful Morning Focus Window Pattern (Focus sessions rated >= 4 in morning >= 3 times)
  const morningSessions = observations.filter(
    (o) => o.type === "successful_focus_window" && o.evidence.time_of_day === "morning"
  );
  if (morningSessions.length >= 3) {
    const isAlreadyAdopted = activeMemoryTexts.some(
      (txt) => txt.includes("morning focus") || txt.includes("morning deep work")
    );
    if (!isAlreadyAdopted) {
      const id = computeReflectionSignature(
        userId,
        todayKey,
        "protect_morning_window",
        `morning_sessions:${morningSessions.length}`
      );

      candidates.push({
        id,
        type: "protect_time_window",
        title: "Protect Morning Deep Work",
        explanation: `You've completed ${morningSessions.length} successful morning focus sessions with high focus ratings. Protecting morning windows for deep work aligns with your proven rhythm.`,
        suggested_action: {
          label: "Protect Morning Blocks",
          prompt: "My morning focus sessions have been the most productive. Let's protect morning windows for deep work.",
        },
        evidence: morningSessions,
        confidence: 0.80,
        confidence_level: "high",
        status: "candidate",
        target_value: {
          window: "morning",
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  // 5. Overloaded Planning Pattern (Repeated overloaded day observations)
  const overloadedDays = observations.filter((o) => o.type === "overloaded_day");
  if (overloadedDays.length >= 2) {
    const isAlreadyAdopted = activeMemoryTexts.some((txt) => txt.includes("reduce planning load") || txt.includes("overload"));
    if (!isAlreadyAdopted) {
      const id = computeReflectionSignature(
        userId,
        todayKey,
        "reduce_planning_load",
        `overloaded_days:${overloadedDays.length}`
      );

      candidates.push({
        id,
        type: "reduce_planning_load",
        title: "Pace Daily Planning Load",
        explanation: `Planned workload has exceeded available calendar time in recent planning cycles. Pacing daily commitments prevents carryover stress and keeps your plan realistic.`,
        suggested_action: {
          label: "Pace Daily Load",
          prompt: "I often schedule more work than fits on my calendar. Let's cap my daily planned workload more conservatively.",
        },
        evidence: overloadedDays,
        confidence: overloadedDays.length >= 3 ? 0.85 : 0.65,
        confidence_level: overloadedDays.length >= 3 ? "high" : "medium",
        status: "candidate",
        created_at: new Date().toISOString(),
      });
    }
  }

  // 6. Unused Capacity Pattern (Repeated unused capacity observations)
  const unusedCapacityObs = observations.filter((o) => o.type === "unused_capacity");
  if (unusedCapacityObs.length >= 2) {
    const id = computeReflectionSignature(
      userId,
      todayKey,
      "use_available_capacity",
      `unused_capacity:${unusedCapacityObs.length}`
    );

    candidates.push({
      id,
      type: "use_available_capacity",
      title: "Take Advantage of Open Windows",
      explanation: `You've had substantial open calendar capacity. Scheduling focused deep-work blocks into these windows can make meaningful progress on your goals without feeling rushed.`,
      suggested_action: {
        label: "Schedule Deep Work",
        prompt: "I have open calendar time today. What's the highest-leverage task I can schedule into an open window?",
      },
      evidence: unusedCapacityObs,
      confidence: 0.70,
      confidence_level: "medium",
      status: "candidate",
      created_at: new Date().toISOString(),
    });
  }

  return candidates;
}

/**
 * Extracts accepted duration planning multiplier from durable active Coach memories.
 * Returns null if no accepted duration adjustment memory exists.
 */
export function extractAcceptedDurationMultiplier(memories: CoachMemory[]): number | null {
  if (!memories || memories.length === 0) return null;

  for (const m of memories) {
    if (m.status === "active" && (m.category === "planning_pattern" || m.category === "preference")) {
      const match = m.content.match(/multiplier:\s*([0-9.]+)/i) ||
                    m.content.match(/([0-9.]+)x\s*multiplier/i) ||
                    m.content.match(/duration adjustment.*?([0-9.]+)x/i);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val >= 0.5 && val <= 2.5) {
          return val;
        }
      }
    }
  }

  return null;
}

/**
 * Assembles the full DailyReflectionSummary for the user.
 * Evaluates task outcomes, identifies adaptation candidates, and prepares a deterministic reflection prompt if useful.
 */
export function buildDailyReflection({
  userId,
  date,
  tasks,
  taskEvents = [],
  focusSessions = [],
  schedule,
  dailyState,
  existingMemories = [],
  timezone = "UTC",
  now = new Date(),
}: {
  userId: string;
  date: string;
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  schedule?: ScheduleContext;
  dailyState?: DailyState;
  existingMemories?: CoachMemory[];
  timezone?: string;
  now?: Date;
}): DailyReflectionSummary {
  // 1. Gather factual observations
  const observations = analyzeTaskOutcomes({
    tasks,
    taskEvents,
    focusSessions,
    todayKey: date,
    schedule,
    dailyState,
    timezone: timezone || "UTC",
  });

  // 2. Derive adaptation candidates
  const adaptationCandidates = buildAdaptationCandidates({
    userId,
    observations,
    tasks,
    taskEvents,
    focusSessions,
    existingMemories,
    todayKey: date,
  });

  // 3. Count planned, completed, and postponed tasks for today
  const todayTasks = tasks.filter((t) => t.due_date === date);
  const completedToday = tasks.filter(
    (t) => t.done && t.completed_at && t.completed_at.slice(0, 10) === date
  );
  const postponedToday = taskEvents.filter(
    (e) => e.event_type === "postponed" && e.created_at && e.created_at.slice(0, 10) === date
  );

  const plannedCount = todayTasks.length;
  const completedCount = completedToday.length;
  const postponedCount = postponedToday.length;

  // 4. Deterministic signature
  const stateHash = `${plannedCount}:${completedCount}:${postponedCount}:${adaptationCandidates.length}`;
  const id = computeReflectionSignature(userId, date, "daily_reflection", stateHash);

  // 5. Construct lightweight prompt when useful
  const hour = now.getHours();
  let reflectionPrompt: DailyReflectionSummary["reflection_prompt"] | undefined;

  // Show end-of-day reflection if afternoon/evening (>= 15:00) or if tasks were planned/completed today
  if (plannedCount > 0 || completedCount > 0 || hour >= 15) {
    let msg = `You planned ${plannedCount} task${plannedCount === 1 ? "" : "s"} today and completed ${completedCount}.`;
    if (postponedCount > 0) {
      msg += ` ${postponedCount} task${postponedCount === 1 ? "" : "s"} were postponed.`;
    }

    if (adaptationCandidates.length > 0) {
      msg += ` I've also identified a helpful scheduling adaptation: ${adaptationCandidates[0].title}.`;
    }

    reflectionPrompt = {
      headline: "Daily Reflection",
      message: msg,
      suggested_action: adaptationCandidates[0]?.suggested_action || {
        label: "Reflect on Today",
        prompt: `Let's do a quick reflection on today's progress (${completedCount}/${plannedCount} tasks completed).`,
      },
    };
  }

  return {
    id,
    date,
    tasks_planned_count: plannedCount,
    tasks_completed_count: completedCount,
    tasks_postponed_count: postponedCount,
    observations,
    adaptation_candidates: adaptationCandidates,
    reflection_prompt: reflectionPrompt,
  };
}
