import "server-only";
import type { Task, FocusSession, JournalEntry, TaskEvent } from "@/types";
import type { ScheduleContext } from "./types";

export type BehavioralSignalType =
  | "overdue_task"
  | "stalled_task"
  | "overloaded_day"
  | "unused_capacity"
  | "underestimated_duration"
  | "repeated_rescheduling"
  | "repeated_postponement"
  | "recurring_planning_patterns"
  | "window_mismatch"
  | "focus_friction"
  | "reflection_friction";

export interface BehavioralSignal {
  type: BehavioralSignalType;
  entity_id?: string;
  description: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
}

/**
 * Deterministic behavioral intelligence engine.
 * Computes objective, observable patterns from tasks, schedule, task events,
 * focus sessions, and journal reflections.
 *
 * Mandate:
 * - Identifies factual, observable patterns only.
 * - Never invents psychological explanations or diagnostic labels.
 */
export function extractBehavioralSignals({
  tasks,
  schedule,
  taskEvents = [],
  focusSessions,
  journalEntries,
  todayKey,
}: {
  tasks: Task[];
  schedule: ScheduleContext;
  taskEvents?: TaskEvent[];
  focusSessions: FocusSession[];
  journalEntries: JournalEntry[];
  todayKey: string;
}): BehavioralSignal[] {
  const signals: BehavioralSignal[] = [];
  const openTasks = tasks.filter((t) => !t.done);

  // 1. Overdue Tasks (Tasks with due dates earlier than today)
  const overdueTasks = openTasks
    .filter((t) => t.due_date && t.due_date < todayKey)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  for (const t of overdueTasks.slice(0, 3)) {
    const daysOverdue = Math.max(
      1,
      Math.round((+new Date(todayKey) - +new Date(t.due_date!)) / 86400000)
    );
    signals.push({
      type: "overdue_task",
      entity_id: t.id,
      description: `Task "${t.name}" is overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}.`,
      evidence: `Due on ${t.due_date} (${t.priority} priority)`,
      confidence: "high",
    });
  }

  // 2. Stalled High-Priority Tasks (Created >= 5 days ago, high priority, open, no due date)
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoIso = fiveDaysAgo.toISOString();

  const stalledHighPriority = openTasks.filter(
    (t) => t.priority === "high" && t.created_at <= fiveDaysAgoIso && !t.due_date
  );

  for (const t of stalledHighPriority.slice(0, 2)) {
    signals.push({
      type: "stalled_task",
      entity_id: t.id,
      description: `High-priority task "${t.name}" has been open for 5+ days without a scheduled due date.`,
      evidence: `Created ${t.created_at.slice(0, 10)}`,
      confidence: "medium",
    });
  }

  // 3. Repeated Rescheduling & Postponement (From task_events history)
  if (taskEvents.length > 0) {
    const reschedulesByTask = new Map<string, number>();
    const postponesByTask = new Map<string, number>();

    for (const evt of taskEvents) {
      if (evt.event_type === "due_date_changed") {
        reschedulesByTask.set(evt.task_id, (reschedulesByTask.get(evt.task_id) || 0) + 1);
      } else if (evt.event_type === "postponed") {
        postponesByTask.set(evt.task_id, (postponesByTask.get(evt.task_id) || 0) + 1);
      }
    }

    for (const t of openTasks) {
      const pCount = postponesByTask.get(t.id) || 0;
      const rCount = reschedulesByTask.get(t.id) || 0;

      if (pCount >= 2) {
        signals.push({
          type: "repeated_postponement",
          entity_id: t.id,
          description: `Task "${t.name}" has been postponed ${pCount} times.`,
          evidence: `Logged postponement history in task events`,
          confidence: "high",
        });
      } else if (rCount >= 2) {
        signals.push({
          type: "repeated_rescheduling",
          entity_id: t.id,
          description: `Task "${t.name}" has been rescheduled ${rCount} times.`,
          evidence: `Due date changed ${rCount} times in task history`,
          confidence: "high",
        });
      }
    }
  }

  // 4. Overloaded Day Detection vs Unused Capacity
  const todayTasks = openTasks.filter((t) => t.due_date === todayKey);
  const plannedMinutesToday = todayTasks.reduce(
    (acc, t) => acc + (t.estimated_minutes ?? 30),
    0
  );

  if (plannedMinutesToday > schedule.total_free_minutes && schedule.total_free_minutes > 0) {
    const deficitMinutes = plannedMinutesToday - schedule.total_free_minutes;
    signals.push({
      type: "overloaded_day",
      description: `Today's planned task workload (${plannedMinutesToday}m) exceeds available free calendar time (${schedule.total_free_minutes}m) by ${deficitMinutes} minutes.`,
      evidence: `${todayTasks.length} tasks scheduled today across ${schedule.free_windows.length} free calendar windows.`,
      confidence: "high",
    });
  } else if (schedule.total_free_minutes === 0 && todayTasks.length > 0) {
    signals.push({
      type: "overloaded_day",
      description: `No discretionary free windows remain on today's calendar, but ${todayTasks.length} tasks are scheduled.`,
      evidence: `Zero open calendar windows >= 15 minutes.`,
      confidence: "high",
    });
  } else if (schedule.total_free_minutes >= 180 && plannedMinutesToday <= schedule.total_free_minutes * 0.5) {
    // Unused Capacity signal (Factual opportunity, not judgment)
    signals.push({
      type: "unused_capacity",
      description: `Substantial discretionary capacity available today (${schedule.total_free_minutes}m free vs ${plannedMinutesToday}m planned).`,
      evidence: `Available free calendar time exceeds planned tasks by ${schedule.total_free_minutes - plannedMinutesToday} minutes.`,
      confidence: "high",
    });
  }

  // 5. Recurring Planning Patterns (Focus sessions time-of-day distribution)
  const completedFocusSessions = focusSessions.filter((s) => s.ended_at);
  if (completedFocusSessions.length >= 4) {
    let morningCount = 0;
    let afternoonCount = 0;

    for (const s of completedFocusSessions) {
      const hour = new Date(s.started_at).getHours();
      if (hour >= 6 && hour < 12) morningCount++;
      else if (hour >= 12 && hour < 18) afternoonCount++;
    }

    if (morningCount / completedFocusSessions.length >= 0.6) {
      signals.push({
        type: "recurring_planning_patterns",
        description: `Observed morning focus rhythm: ${morningCount} of ${completedFocusSessions.length} recent focus sessions occurred before 12:00 PM.`,
        evidence: `${Math.round((morningCount / completedFocusSessions.length) * 100)}% morning focus distribution`,
        confidence: "medium",
      });
    } else if (afternoonCount / completedFocusSessions.length >= 0.6) {
      signals.push({
        type: "recurring_planning_patterns",
        description: `Observed afternoon focus rhythm: ${afternoonCount} of ${completedFocusSessions.length} recent focus sessions occurred between 12:00 PM and 6:00 PM.`,
        evidence: `${Math.round((afternoonCount / completedFocusSessions.length) * 100)}% afternoon focus distribution`,
        confidence: "medium",
      });
    }
  }

  // 6. Duration Estimation Patterns (Actual time consistently exceeding estimated time)
  const completedWithEstimates = tasks.filter(
    (t) => t.done && t.estimated_minutes && t.actual_minutes && t.actual_minutes > 0
  );

  const underestimated = completedWithEstimates.filter(
    (t) => (t.actual_minutes ?? 0) > (t.estimated_minutes ?? 0) * 1.3
  );

  if (completedWithEstimates.length >= 3 && underestimated.length / completedWithEstimates.length >= 0.5) {
    signals.push({
      type: "underestimated_duration",
      description: `Tasks frequently take longer than planned (observed in ${underestimated.length} of recent ${completedWithEstimates.length} estimated tasks).`,
      evidence: `Average overrun factor >= 1.3x`,
      confidence: "medium",
    });
  }

  // 7. Stated Avoidance or Friction in Recent Reflections
  if (journalEntries.length > 0) {
    const latest = journalEntries[0];
    const avoided = latest.answers?.avoided?.trim();
    const postponing = latest.answers?.postponing?.trim();

    if (avoided && avoided.length > 3) {
      signals.push({
        type: "reflection_friction",
        description: `User noted avoiding "${avoided}" in recent reflection.`,
        evidence: `Journal reflection dated ${latest.entry_date}`,
        confidence: "high",
      });
    }

    if (postponing && postponing.length > 3) {
      signals.push({
        type: "reflection_friction",
        description: `User noted postponing decision or task regarding "${postponing}".`,
        evidence: `Journal reflection dated ${latest.entry_date}`,
        confidence: "high",
      });
    }
  }

  // 8. Focus Session Friction
  const recentSessions = focusSessions.slice(0, 10);
  const completedRecent = recentSessions.filter((s) => s.ended_at);
  const lowRated = completedRecent.filter((s) => s.rating && s.rating <= 2);

  if (lowRated.length >= 2) {
    signals.push({
      type: "focus_friction",
      description: `Recent focus sessions experienced friction or interruptions (${lowRated.length} sessions rated <= 2/5).`,
      evidence: `${lowRated.length} of ${completedRecent.length} recent completed focus sessions rated <= 2/5`,
      confidence: "medium",
    });
  }

  return signals.slice(0, 6); // Return top 6 highest-signal items
}
