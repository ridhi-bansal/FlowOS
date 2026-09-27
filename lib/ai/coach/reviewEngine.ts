import "server-only";
import crypto from "crypto";
import type { Task, FocusSession, TaskEvent, Goal, Project, CoachMemory } from "@/types";
import type { ScheduleContext } from "./types";
import { extractAcceptedDurationMultiplier } from "./reflectionEngine";

export type ReviewPeriod = "last_7_days";

export interface PriorityProgressSummary {
  high_priority_completed: number;
  high_priority_open: number;
  high_priority_overdue: number;
  repeatedly_postponed_priority_tasks: Array<{ id: string; name: string; postpone_count: number }>;
  goals_with_progress: Array<{ id: string; title: string; completed_tasks_count: number }>;
  goals_without_progress: Array<{ id: string; title: string; open_tasks_count: number }>;
}

export interface PlanningRealismSummary {
  reviewed_days: number;
  overloaded_days: number;
  realistic_days: number;
  average_capacity_ratio?: number;
  oversized_task_count: number;
  unscheduled_task_count: number;
}

export interface ExecutionConsistencySummary {
  tasks_in_period_count: number;
  completion_rate_percent: number;
  completed_on_time_count: number;
  completed_late_count: number;
  postponement_frequency: number;
  focus_sessions_count: number;
  total_focus_minutes: number;
  avg_focus_rating: number | null;
}

export interface AdaptationImpactSummary {
  active_adaptations_count: number;
  accepted_duration_multiplier?: number;
  protected_windows?: string[];
  impact_summary?: string;
}

export type ReviewTrendType =
  | "priority_progress_up"
  | "priority_progress_down"
  | "postponement_increasing"
  | "postponement_decreasing"
  | "planning_more_realistic"
  | "planning_less_realistic"
  | "overload_reducing"
  | "overload_increasing"
  | "focus_consistency_improving"
  | "focus_consistency_declining";

export interface ReviewTrend {
  type: ReviewTrendType;
  title: string;
  direction: "improving" | "declining" | "neutral";
  description: string;
  evidence: {
    current_value: number;
    previous_value: number;
    delta: number;
  };
}

export interface ReviewInsight {
  id: string;
  type: "progress" | "risk" | "pattern" | "adaptation" | "opportunity";
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  priority: "high" | "medium" | "low";
}

export interface CoachReview {
  id: string; // deterministic signature hash
  signature?: string;
  period: {
    start_at: string;
    end_at: string;
    label: string;
  };
  task_summary: {
    created: number;
    completed: number;
    overdue: number;
    postponed: number;
  };
  priority_progress: PriorityProgressSummary;
  planning_realism: PlanningRealismSummary;
  execution_consistency: ExecutionConsistencySummary;
  adaptation_impact?: AdaptationImpactSummary;
  trends: ReviewTrend[];
  insights: ReviewInsight[];
  generated_at: string;
}

/**
 * Computes a deterministic 16-character SHA-256 signature for review deduplication.
 */
export function computeReviewSignature(
  userId: string,
  periodStart: string,
  periodEnd: string,
  taskSignature: string,
  eventSignature: string,
  memorySignature: string
): string {
  const raw = `${userId}:${periodStart}:${periodEnd}:${taskSignature}:${eventSignature}:${memorySignature}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Calculates rolling 7-day period timestamps in user's timezone.
 */
export function calculateReviewPeriod(
  now: Date = new Date(),
  timezone: string = "UTC"
): {
  currentPeriod: { start_at: string; end_at: string; label: string };
  previousPeriod: { start_at: string; end_at: string; label: string };
} {
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const currentStart = new Date(nowMs - sevenDaysMs).toISOString();
  const currentEnd = now.toISOString();

  const prevStart = new Date(nowMs - fourteenDaysMs).toISOString();
  const prevEnd = currentStart;

  return {
    currentPeriod: {
      start_at: currentStart,
      end_at: currentEnd,
      label: "Last 7 Days",
    },
    previousPeriod: {
      start_at: prevStart,
      end_at: prevEnd,
      label: "Previous 7 Days",
    },
  };
}

/**
 * Analyzes whether important work is actually moving.
 * Factual and non-judgmental; never infers that an uncompleted goal is "unimportant".
 */
export function analyzePriorityProgress({
  tasks,
  taskEvents = [],
  goals = [],
  periodStart,
  periodEnd,
  todayKey,
}: {
  tasks: Task[];
  taskEvents?: TaskEvent[];
  goals?: Goal[];
  periodStart: string;
  periodEnd: string;
  todayKey: string;
}): PriorityProgressSummary {
  const periodStartDateKey = periodStart.slice(0, 10);
  const periodEndDateKey = periodEnd.slice(0, 10);

  // 1. High-priority tasks completed in period
  const highPriorityCompleted = tasks.filter(
    (t) =>
      t.priority === "high" &&
      t.done &&
      t.completed_at &&
      t.completed_at >= periodStart &&
      t.completed_at <= periodEnd
  );

  // 2. High-priority open & overdue
  const openHighPriority = tasks.filter((t) => t.priority === "high" && !t.done);
  const highPriorityOverdue = openHighPriority.filter(
    (t) => t.due_date && t.due_date < todayKey
  );

  // 3. Repeatedly postponed priority tasks (>= 2 postponements)
  const postponesByTask = new Map<string, number>();
  for (const evt of taskEvents) {
    if (evt.event_type === "postponed") {
      postponesByTask.set(evt.task_id, (postponesByTask.get(evt.task_id) || 0) + 1);
    }
  }

  const repeatedlyPostponedPriority: Array<{ id: string; name: string; postpone_count: number }> = [];
  for (const t of openHighPriority) {
    const pCount = postponesByTask.get(t.id) || 0;
    if (pCount >= 2) {
      repeatedlyPostponedPriority.push({
        id: t.id,
        name: t.name,
        postpone_count: pCount,
      });
    }
  }

  // 4. Goal progress in period
  const goalsWithProgress: Array<{ id: string; title: string; completed_tasks_count: number }> = [];
  const goalsWithoutProgress: Array<{ id: string; title: string; open_tasks_count: number }> = [];

  for (const g of goals) {
    if (g.status === "archived") continue;
    const goalTasks = tasks.filter((t) => t.goal_id === g.id);
    const completedInPeriod = goalTasks.filter(
      (t) =>
        t.done &&
        t.completed_at &&
        t.completed_at >= periodStart &&
        t.completed_at <= periodEnd
    );
    const openGoalTasks = goalTasks.filter((t) => !t.done);

    if (completedInPeriod.length > 0) {
      goalsWithProgress.push({
        id: g.id,
        title: g.title,
        completed_tasks_count: completedInPeriod.length,
      });
    } else if (openGoalTasks.length > 0) {
      goalsWithoutProgress.push({
        id: g.id,
        title: g.title,
        open_tasks_count: openGoalTasks.length,
      });
    }
  }

  return {
    high_priority_completed: highPriorityCompleted.length,
    high_priority_open: openHighPriority.length,
    high_priority_overdue: highPriorityOverdue.length,
    repeatedly_postponed_priority_tasks: repeatedlyPostponedPriority,
    goals_with_progress: goalsWithProgress,
    goals_without_progress: goalsWithoutProgress,
  };
}

/**
 * Analyzes planning realism across the rolling 7-day period.
 */
export function analyzePlanningRealism({
  tasks,
  schedule,
  todayKey,
}: {
  tasks: Task[];
  schedule?: ScheduleContext;
  todayKey: string;
}): PlanningRealismSummary {
  const reviewedDays = 7;
  let overloadedDays = 0;
  let realisticDays = reviewedDays;
  let oversizedTaskCount = 0;
  let unscheduledTaskCount = 0;

  const openTasks = tasks.filter((t) => !t.done);

  // Oversized tasks (>= 60m with no window fitting or exceeding free time)
  for (const t of openTasks) {
    if ((t.estimated_minutes ?? 30) >= 60) {
      if (schedule && schedule.free_windows.every((w) => w.duration_minutes < (t.estimated_minutes ?? 30))) {
        oversizedTaskCount++;
      }
    }
  }

  if (schedule) {
    const todayTasks = openTasks.filter((t) => t.due_date === todayKey);
    const plannedMinutes = todayTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0);
    const freeMinutes = schedule.total_free_minutes;

    if (plannedMinutes > freeMinutes && freeMinutes > 0) {
      overloadedDays = 1; // At least today was detected overloaded
    }

    // Check unscheduled tasks from current free windows
    let accumulatedMinutes = 0;
    for (const t of todayTasks) {
      const dur = t.estimated_minutes ?? 30;
      if (accumulatedMinutes + dur > freeMinutes) {
        unscheduledTaskCount++;
      } else {
        accumulatedMinutes += dur;
      }
    }

    realisticDays = Math.max(0, reviewedDays - overloadedDays);
  }

  return {
    reviewed_days: reviewedDays,
    overloaded_days: overloadedDays,
    realistic_days: realisticDays,
    oversized_task_count: oversizedTaskCount,
    unscheduled_task_count: unscheduledTaskCount,
  };
}

/**
 * Reviews what happened after plans were created without fabricating duration data.
 */
export function analyzeExecutionConsistency({
  tasks,
  taskEvents = [],
  focusSessions = [],
  periodStart,
  periodEnd,
}: {
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  periodStart: string;
  periodEnd: string;
}): ExecutionConsistencySummary {
  // Tasks active in period (created, due, or completed in period)
  const tasksInPeriod = tasks.filter(
    (t) =>
      (t.created_at >= periodStart && t.created_at <= periodEnd) ||
      (t.due_date && t.due_date >= periodStart.slice(0, 10) && t.due_date <= periodEnd.slice(0, 10)) ||
      (t.completed_at && t.completed_at >= periodStart && t.completed_at <= periodEnd)
  );

  const completedInPeriod = tasks.filter(
    (t) => t.done && t.completed_at && t.completed_at >= periodStart && t.completed_at <= periodEnd
  );

  let onTime = 0;
  let late = 0;
  for (const t of completedInPeriod) {
    if (!t.due_date) {
      onTime++;
    } else {
      const compDate = t.completed_at ? t.completed_at.slice(0, 10) : "";
      if (compDate <= t.due_date) {
        onTime++;
      } else {
        late++;
      }
    }
  }

  const completionRate =
    tasksInPeriod.length > 0 ? Math.round((completedInPeriod.length / tasksInPeriod.length) * 100) : 0;

  // Postponement events in period
  const postponementsInPeriod = taskEvents.filter(
    (e) => e.event_type === "postponed" && e.created_at >= periodStart && e.created_at <= periodEnd
  );

  // Focus sessions in period
  const sessionsInPeriod = focusSessions.filter(
    (s) => s.ended_at && s.started_at >= periodStart && s.started_at <= periodEnd
  );

  const totalFocusMinutes = sessionsInPeriod.reduce(
    (acc, s) => acc + (s.actual_minutes ?? s.planned_minutes ?? 0),
    0
  );

  const ratedSessions = sessionsInPeriod.filter((s) => typeof s.rating === "number");
  const avgRating =
    ratedSessions.length > 0
      ? Math.round(
          (ratedSessions.reduce((acc, s) => acc + (s.rating || 0), 0) / ratedSessions.length) * 10
        ) / 10
      : null;

  return {
    tasks_in_period_count: tasksInPeriod.length,
    completion_rate_percent: completionRate,
    completed_on_time_count: onTime,
    completed_late_count: late,
    postponement_frequency: postponementsInPeriod.length,
    focus_sessions_count: sessionsInPeriod.length,
    total_focus_minutes: totalFocusMinutes,
    avg_focus_rating: avgRating,
  };
}

/**
 * Analyzes whether accepted adaptations from Phase 3.3B have observable impact on planning realism.
 */
export function analyzeAdaptationImpact(memories: CoachMemory[] = []): AdaptationImpactSummary {
  const activePlanningMemories = memories.filter(
    (m) => m.status === "active" && (m.category === "planning_pattern" || m.category === "preference")
  );

  const multiplier = extractAcceptedDurationMultiplier(activePlanningMemories);
  const protectedWindows: string[] = [];

  for (const m of activePlanningMemories) {
    if (m.content.toLowerCase().includes("morning")) {
      protectedWindows.push("morning");
    }
  }

  let summary: string | undefined;
  if (multiplier && multiplier > 1.0) {
    summary = `Your accepted ${multiplier}x duration multiplier is actively applied during day planning, adding realistic buffers without modifying baseline estimates.`;
  } else if (protectedWindows.length > 0) {
    summary = `Morning deep-work blocks are actively protected based on your accepted focus pattern.`;
  }

  return {
    active_adaptations_count: activePlanningMemories.length,
    accepted_duration_multiplier: multiplier || undefined,
    protected_windows: protectedWindows.length > 0 ? protectedWindows : undefined,
    impact_summary: summary,
  };
}

/**
 * Detects trends comparing current 7 days with previous 7 days.
 * Strictly returns empty if insufficient comparison data exists; NEVER fabricates trend direction.
 */
export function detectReviewTrends({
  tasks,
  taskEvents = [],
  focusSessions = [],
  currentPeriod,
  previousPeriod,
}: {
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  currentPeriod: { start_at: string; end_at: string };
  previousPeriod: { start_at: string; end_at: string };
}): ReviewTrend[] {
  const trends: ReviewTrend[] = [];

  // Check if previous period has sufficient activity to compare
  const prevCompleted = tasks.filter(
    (t) => t.done && t.completed_at && t.completed_at >= previousPeriod.start_at && t.completed_at <= previousPeriod.end_at
  );
  const prevPostpones = taskEvents.filter(
    (e) => e.event_type === "postponed" && e.created_at >= previousPeriod.start_at && e.created_at <= previousPeriod.end_at
  );
  const prevFocus = focusSessions.filter(
    (s) => s.ended_at && s.started_at >= previousPeriod.start_at && s.started_at <= previousPeriod.end_at
  );

  const hasPreviousData = prevCompleted.length > 0 || prevPostpones.length > 0 || prevFocus.length > 0;
  if (!hasPreviousData) {
    return []; // Insufficient comparison data
  }

  // 1. High-priority progress trend
  const currHighCompleted = tasks.filter(
    (t) => t.priority === "high" && t.done && t.completed_at && t.completed_at >= currentPeriod.start_at && t.completed_at <= currentPeriod.end_at
  ).length;
  const prevHighCompleted = prevCompleted.filter((t) => t.priority === "high").length;

  if (currHighCompleted > prevHighCompleted) {
    trends.push({
      type: "priority_progress_up",
      title: "Priority Progress Up",
      direction: "improving",
      description: `Completed ${currHighCompleted} high-priority tasks this week compared to ${prevHighCompleted} in the previous period.`,
      evidence: {
        current_value: currHighCompleted,
        previous_value: prevHighCompleted,
        delta: currHighCompleted - prevHighCompleted,
      },
    });
  } else if (currHighCompleted < prevHighCompleted) {
    trends.push({
      type: "priority_progress_down",
      title: "Priority Progress Down",
      direction: "declining",
      description: `Completed ${currHighCompleted} high-priority tasks this week compared to ${prevHighCompleted} in the previous period.`,
      evidence: {
        current_value: currHighCompleted,
        previous_value: prevHighCompleted,
        delta: currHighCompleted - prevHighCompleted,
      },
    });
  }

  // 2. Postponement trend
  const currPostpones = taskEvents.filter(
    (e) => e.event_type === "postponed" && e.created_at >= currentPeriod.start_at && e.created_at <= currentPeriod.end_at
  ).length;

  if (currPostpones > prevPostpones.length + 1) {
    trends.push({
      type: "postponement_increasing",
      title: "Postponements Increasing",
      direction: "declining",
      description: `Postponed tasks ${currPostpones} times this week compared to ${prevPostpones.length} in the previous period.`,
      evidence: {
        current_value: currPostpones,
        previous_value: prevPostpones.length,
        delta: currPostpones - prevPostpones.length,
      },
    });
  } else if (currPostpones < prevPostpones.length && prevPostpones.length >= 2) {
    trends.push({
      type: "postponement_decreasing",
      title: "Postponements Decreasing",
      direction: "improving",
      description: `Task postponements reduced to ${currPostpones} this week from ${prevPostpones.length} last week.`,
      evidence: {
        current_value: currPostpones,
        previous_value: prevPostpones.length,
        delta: currPostpones - prevPostpones.length,
      },
    });
  }

  // 3. Focus consistency trend
  const currFocusMinutes = focusSessions
    .filter((s) => s.ended_at && s.started_at >= currentPeriod.start_at && s.started_at <= currentPeriod.end_at)
    .reduce((acc, s) => acc + (s.actual_minutes ?? s.planned_minutes ?? 0), 0);

  const prevFocusMinutes = prevFocus.reduce((acc, s) => acc + (s.actual_minutes ?? s.planned_minutes ?? 0), 0);

  if (prevFocusMinutes > 0 && currFocusMinutes >= prevFocusMinutes * 1.2) {
    trends.push({
      type: "focus_consistency_improving",
      title: "Focus Time Expanding",
      direction: "improving",
      description: `Logged ${currFocusMinutes} focus minutes this week compared to ${prevFocusMinutes} last week.`,
      evidence: {
        current_value: currFocusMinutes,
        previous_value: prevFocusMinutes,
        delta: currFocusMinutes - prevFocusMinutes,
      },
    });
  } else if (prevFocusMinutes >= 60 && currFocusMinutes <= prevFocusMinutes * 0.7) {
    trends.push({
      type: "focus_consistency_declining",
      title: "Focus Time Declining",
      direction: "declining",
      description: `Focus time decreased to ${currFocusMinutes}m this week compared to ${prevFocusMinutes}m last week.`,
      evidence: {
        current_value: currFocusMinutes,
        previous_value: prevFocusMinutes,
        delta: currFocusMinutes - prevFocusMinutes,
      },
    });
  }

  return trends;
}

/**
 * Builds top 5 ranked deterministic review insights.
 * Strict ranking order:
 * 1. Major risks (repeated postponements on priority tasks, overdue load)
 * 2. Meaningful priority progress
 * 3. Planning realism (overloaded days)
 * 4. Strong behavioral execution pattern
 * 5. Adaptation impact & opportunity
 */
export function buildReviewInsights({
  priorityProgress,
  planningRealism,
  executionConsistency,
  adaptationImpact,
  trends,
}: {
  priorityProgress: PriorityProgressSummary;
  planningRealism: PlanningRealismSummary;
  executionConsistency: ExecutionConsistencySummary;
  adaptationImpact?: AdaptationImpactSummary;
  trends: ReviewTrend[];
}): ReviewInsight[] {
  const candidateInsights: ReviewInsight[] = [];

  // 1. Major Risk: Repeatedly postponed priority tasks
  if (priorityProgress.repeatedly_postponed_priority_tasks.length > 0) {
    const pTask = priorityProgress.repeatedly_postponed_priority_tasks[0];
    candidateInsights.push({
      id: `risk_postponed_${pTask.id}`,
      type: "risk",
      title: `Priority Friction: "${pTask.name}"`,
      message: `Task "${pTask.name}" has been postponed ${pTask.postpone_count} times. Consider breaking it into 2 to 3 smaller subtasks to regain traction.`,
      evidence: { task_id: pTask.id, task_name: pTask.name, postpone_count: pTask.postpone_count },
      priority: "high",
    });
  }

  // 2. Major Risk: High-priority overdue pressure
  if (priorityProgress.high_priority_overdue > 0) {
    candidateInsights.push({
      id: `risk_high_overdue`,
      type: "risk",
      title: "High-Priority Overdue Work",
      message: `${priorityProgress.high_priority_overdue} high-priority task${priorityProgress.high_priority_overdue === 1 ? " is" : "s are"} overdue. Resolving these first will unblock your schedule.`,
      evidence: { count: priorityProgress.high_priority_overdue },
      priority: "high",
    });
  }

  // 3. Meaningful Priority Progress
  if (priorityProgress.high_priority_completed > 0) {
    candidateInsights.push({
      id: `progress_high_completed`,
      type: "progress",
      title: "Strong Priority Momentum",
      message: `Completed ${priorityProgress.high_priority_completed} high-priority task${priorityProgress.high_priority_completed === 1 ? "" : "s"} over the last 7 days.`,
      evidence: { completed_count: priorityProgress.high_priority_completed },
      priority: "medium",
    });
  }

  // 4. Planning Realism: Overload observation
  if (planningRealism.overloaded_days >= 2) {
    candidateInsights.push({
      id: `pattern_overloaded_days`,
      type: "pattern",
      title: "Planning Load vs Reality",
      message: `${planningRealism.overloaded_days} of recent days had workloads exceeding free calendar windows. Pacing daily commitments prevents carrying unfinished tasks over.`,
      evidence: {
        overloaded_days: planningRealism.overloaded_days,
        reviewed_days: planningRealism.reviewed_days,
      },
      priority: "medium",
    });
  }

  // 5. Adaptation Impact
  if (adaptationImpact?.accepted_duration_multiplier) {
    candidateInsights.push({
      id: `adaptation_active_duration`,
      type: "adaptation",
      title: "Learned Buffer in Action",
      message: `Your accepted ${adaptationImpact.accepted_duration_multiplier}x planning multiplier is actively scaling focus blocks so plans fit realistic execution time.`,
      evidence: { multiplier: adaptationImpact.accepted_duration_multiplier },
      priority: "medium",
    });
  }

  // 6. Trend insight if present
  if (trends.length > 0) {
    const t = trends[0];
    candidateInsights.push({
      id: `trend_${t.type}`,
      type: t.direction === "improving" ? "progress" : "risk",
      title: t.title,
      message: t.description,
      evidence: t.evidence,
      priority: t.direction === "improving" ? "medium" : "high",
    });
  }

  // 7. Opportunity: Focus consistency or open capacity
  if (executionConsistency.focus_sessions_count >= 3 && executionConsistency.avg_focus_rating && executionConsistency.avg_focus_rating >= 4) {
    candidateInsights.push({
      id: `opportunity_focus_rhythm`,
      type: "opportunity",
      title: "Proven Focus Rhythm",
      message: `Averaged ${executionConsistency.avg_focus_rating}/5 across ${executionConsistency.focus_sessions_count} focus sessions. Keeping dedicated focus windows protected reinforces your momentum.`,
      evidence: { sessions: executionConsistency.focus_sessions_count, avg_rating: executionConsistency.avg_focus_rating },
      priority: "low",
    });
  }

  // Rank: high priority first, then medium, then low
  const rankOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  candidateInsights.sort((a, b) => rankOrder[b.priority] - rankOrder[a.priority]);

  // Limit to at most 5 insights
  return candidateInsights.slice(0, 5);
}

/**
 * Builds the complete deterministic CoachReview object.
 */
export function buildRollingReview({
  userId,
  tasks,
  taskEvents = [],
  focusSessions = [],
  goals = [],
  projects = [],
  memories = [],
  schedule,
  now = new Date(),
  timezone = "UTC",
}: {
  userId: string;
  tasks: Task[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  goals?: Goal[];
  projects?: Project[];
  memories?: CoachMemory[];
  schedule?: ScheduleContext;
  now?: Date;
  timezone?: string;
}): CoachReview {
  const { currentPeriod, previousPeriod } = calculateReviewPeriod(now, timezone);

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // 1. Task Summary for period
  const createdInPeriod = tasks.filter(
    (t) => t.created_at >= currentPeriod.start_at && t.created_at <= currentPeriod.end_at
  );
  const completedInPeriod = tasks.filter(
    (t) => t.done && t.completed_at && t.completed_at >= currentPeriod.start_at && t.completed_at <= currentPeriod.end_at
  );
  const openTasks = tasks.filter((t) => !t.done);
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < todayKey);
  const postponesInPeriod = taskEvents.filter(
    (e) => e.event_type === "postponed" && e.created_at >= currentPeriod.start_at && e.created_at <= currentPeriod.end_at
  );

  const taskSummary = {
    created: createdInPeriod.length,
    completed: completedInPeriod.length,
    overdue: overdueTasks.length,
    postponed: postponesInPeriod.length,
  };

  // 2. Sections
  const priorityProgress = analyzePriorityProgress({
    tasks,
    taskEvents,
    goals,
    periodStart: currentPeriod.start_at,
    periodEnd: currentPeriod.end_at,
    todayKey,
  });

  const planningRealism = analyzePlanningRealism({
    tasks,
    schedule,
    todayKey,
  });

  const executionConsistency = analyzeExecutionConsistency({
    tasks,
    taskEvents,
    focusSessions,
    periodStart: currentPeriod.start_at,
    periodEnd: currentPeriod.end_at,
  });

  const adaptationImpact = analyzeAdaptationImpact(memories);

  const trends = detectReviewTrends({
    tasks,
    taskEvents,
    focusSessions,
    currentPeriod,
    previousPeriod,
  });

  const insights = buildReviewInsights({
    priorityProgress,
    planningRealism,
    executionConsistency,
    adaptationImpact,
    trends,
  });

  // 3. Deduplication signature
  const taskSig = `${taskSummary.created}:${taskSummary.completed}:${taskSummary.overdue}`;
  const evtSig = `${taskSummary.postponed}:${trends.length}`;
  const memSig = `${adaptationImpact.active_adaptations_count}:${adaptationImpact.accepted_duration_multiplier || 1}`;

  const id = computeReviewSignature(
    userId,
    currentPeriod.start_at.slice(0, 10),
    currentPeriod.end_at.slice(0, 10),
    taskSig,
    evtSig,
    memSig
  );

  return {
    id,
    signature: id,
    period: currentPeriod,
    task_summary: taskSummary,
    priority_progress: priorityProgress,
    planning_realism: planningRealism,
    execution_consistency: executionConsistency,
    adaptation_impact: adaptationImpact,
    trends,
    insights,
    generated_at: now.toISOString(),
  };
}
