import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildScheduleContext } from "./scheduleEngine";
import { extractBehavioralSignals } from "./behaviorEngine";
import { evaluateWorkloadCapacity, buildCurrentWindowPlan, buildDayPlan } from "./planningEngine";
import { buildDailyState } from "./dailyIntelligenceEngine";
import { evaluateProactiveTriggers } from "./proactiveEngine";
import { buildDailyReflection } from "./reflectionEngine";
import { buildRollingReview } from "./reviewEngine";
import { buildExecutionState } from "./executionEngine";
import { getRelevantMemories } from "./memoryEngine";
import type {
  CompactGoal,
  CompactTask,
  FocusSummary,
  HabitConsistency,
  UserOperatingContext,
} from "./types";
import type {
  FocusSession,
  Goal,
  Habit,
  HabitLog,
  JournalEntry,
  Profile,
  Project,
  Task,
  TaskEvent,
} from "@/types";

export async function buildUserOperatingContext(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
  currentMessageText?: string
): Promise<UserOperatingContext> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();
  const sevenDaysAgoDateKey = sevenDaysAgoIso.slice(0, 10);

  // 1. Parallel fetch all relevant entity tables and long-term memory for this user
  const [
    { data: profileData },
    { data: tasksData },
    { data: projectsData },
    { data: goalsData },
    { data: journalData },
    { data: focusSessionsData },
    { data: habitsData },
    { data: habitLogsData },
    { data: taskEventsData },
    { data: nativeEventsData },
    relevantMemories,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("tasks").select("*").eq("user_id", userId),
    supabase.from("projects").select("id, name, status").eq("user_id", userId),
    supabase.from("goals").select("*").eq("user_id", userId),
    supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(3),
    supabase
      .from("focus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("started_at", sevenDaysAgoIso)
      .order("started_at", { ascending: false }),
    supabase.from("habits").select("*").eq("user_id", userId).eq("archived", false),
    supabase
      .from("habit_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_date", sevenDaysAgoDateKey),
    supabase
      .from("task_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("events")
      .select("id, title, start_at, end_at, kind, task_id")
      .eq("user_id", userId)
      .gte("start_at", sevenDaysAgoIso),
    getRelevantMemories(supabase, userId, currentMessageText, 6),
  ]);

  const profile = profileData as Profile | null;
  const allTasks: Task[] = (tasksData as Task[]) || [];
  const projects: Project[] = (projectsData as Project[]) || [];
  const goals: Goal[] = (goalsData as Goal[]) || [];
  const journalEntries: JournalEntry[] = (journalData as JournalEntry[]) || [];
  const focusSessions: FocusSession[] = (focusSessionsData as FocusSession[]) || [];
  const habits: Habit[] = (habitsData as Habit[]) || [];
  const habitLogs: HabitLog[] = (habitLogsData as HabitLog[]) || [];
  const taskEvents: TaskEvent[] = (taskEventsData as TaskEvent[]) || [];

  const timezone = profile?.timezone || "UTC";

  // 2. Compute date and time strings in user's timezone
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  // 3. Compute schedule geometry
  const schedule = await buildScheduleContext(supabase, userId, timezone, now);

  // 4. Map project names and goals
  const projectMap = new Map<string, string>();
  for (const p of projects) {
    projectMap.set(p.id, p.name);
  }

  const goalMap = new Map<string, string>();
  for (const g of goals) {
    goalMap.set(g.id, g.title);
  }

  // 5. Curate and partition tasks
  const openTasks = allTasks.filter((t) => !t.done);
  const completedToday = allTasks.filter(
    (t) => t.done && t.completed_at && t.completed_at.slice(0, 10) === dateKey
  );

  function toCompact(t: Task): CompactTask {
    const isOverdue = Boolean(t.due_date && t.due_date < dateKey);
    return {
      id: t.id,
      name: t.name,
      priority: t.priority,
      due_date: t.due_date,
      due_time: t.due_time,
      estimated_minutes: t.estimated_minutes ?? 30,
      status: t.status,
      project_name: t.project_id ? projectMap.get(t.project_id) : undefined,
      goal_title: t.goal_id ? goalMap.get(t.goal_id) : undefined,
      is_overdue: isOverdue,
      postpone_count: 0,
    };
  }

  const overdue = openTasks
    .filter((t) => t.due_date && t.due_date < dateKey)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, 6)
    .map(toCompact);

  const todayTasks = openTasks
    .filter((t) => t.due_date === dateKey)
    .sort((a, b) => {
      const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    })
    .slice(0, 10)
    .map(toCompact);

  const upcomingUrgent = openTasks
    .filter((t) => t.due_date && t.due_date > dateKey && t.priority === "high")
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, 4)
    .map(toCompact);

  // Stalled or avoided tasks (High priority open for >= 5 days without due date)
  const fiveDaysAgoIso = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const stalledOrAvoided = openTasks
    .filter((t) => t.priority === "high" && t.created_at <= fiveDaysAgoIso && !t.due_date)
    .slice(0, 4)
    .map(toCompact);

  // Top 3 resolution
  const topThree = todayTasks.length > 0 ? todayTasks.slice(0, 3) : overdue.slice(0, 3);

  // 6. Curate active goals
  const compactGoals: CompactGoal[] = goals
    .filter((g) => g.status !== "archived" && g.status !== "done")
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      title: g.title,
      horizon: g.horizon,
      status: g.status,
      deadline: g.deadline,
      why: g.why,
      obstacles: g.obstacles,
      progress_percent: g.progress || 0,
    }));

  // 7. Recent reflection context
  const latestJournal = journalEntries[0];
  const recentReflection = latestJournal
    ? {
        date: latestJournal.entry_date,
        mood: latestJournal.mood,
        energy: latestJournal.energy,
        what_mattered: latestJournal.answers?.what_mattered || null,
        avoided: latestJournal.answers?.avoided || null,
        postponing: latestJournal.answers?.postponing || null,
      }
    : undefined;

  // 8. Deterministic capacity evaluation
  const capacity = evaluateWorkloadCapacity({
    tasks: allTasks,
    schedule,
    todayKey: dateKey,
  });

  // 9. Deterministic Current-Window Planning
  const planning = buildCurrentWindowPlan({
    tasks: allTasks,
    schedule,
    toCompact,
    now,
    todayKey: dateKey,
  });

  // 10. Deterministic Daily Intelligence & Planning Engine V2
  const dailyState = buildDailyState({
    tasks: allTasks,
    schedule,
    taskEvents,
    focusSessions,
    now,
    todayKey: dateKey,
    timezone,
    toCompact,
  });

  const dayPlan = buildDayPlan({
    tasks: allTasks,
    schedule,
    now,
    todayKey: dateKey,
    toCompact,
    acceptedMemories: relevantMemories,
  });

  // 11. Deterministic Proactive Intelligence Triggers
  const activeTriggers = evaluateProactiveTriggers({
    userId,
    dailyState,
    tasks: allTasks,
    schedule,
    taskEvents,
    now,
    timezone,
    todayKey: dateKey,
  });

  // 12. Deterministic Daily Reflection & Adaptation Candidates
  const dailyReflection = buildDailyReflection({
    userId,
    date: dateKey,
    tasks: allTasks,
    taskEvents,
    focusSessions,
    schedule,
    dailyState,
    existingMemories: relevantMemories,
    timezone,
    now,
  });

  // 13. Deterministic Rolling 7-Day Review
  const rollingReview = buildRollingReview({
    userId,
    tasks: allTasks,
    taskEvents,
    focusSessions,
    goals,
    projects,
    memories: relevantMemories,
    schedule,
    now,
    timezone,
  });

  // 14. Behavioral intelligence signals (with task events)
  const behavioralSignals = extractBehavioralSignals({
    tasks: allTasks,
    schedule,
    taskEvents,
    focusSessions,
    journalEntries,
    todayKey: dateKey,
  });

  // 12. Focus sessions summary (last 7 days)
  const completedFocusSessions = focusSessions.filter((s) => s.ended_at);
  const totalFocusMinutes = completedFocusSessions.reduce(
    (acc, s) => acc + (s.actual_minutes ?? s.planned_minutes ?? 0),
    0
  );
  const ratedSessions = completedFocusSessions.filter((s) => typeof s.rating === "number");
  const avgRating =
    ratedSessions.length > 0
      ? Math.round(
          (ratedSessions.reduce((acc, s) => acc + (s.rating || 0), 0) / ratedSessions.length) * 10
        ) / 10
      : null;

  const focusSummary: FocusSummary = {
    completed_sessions_7d: completedFocusSessions.length,
    total_focus_minutes_7d: totalFocusMinutes,
    avg_rating: avgRating,
  };

  // 13. Habit consistency (last 7 days)
  const todayHabitLogs = habitLogs.filter((l) => l.logged_date === dateKey);
  const completedTodayHabitIds = new Set(todayHabitLogs.map((l) => l.habit_id));
  const maxPossibleLogs = Math.max(1, habits.length * 7);
  const avg7dRatePercent =
    habits.length > 0
      ? Math.min(100, Math.round((habitLogs.length / maxPossibleLogs) * 100))
      : 0;

  const habitConsistency: HabitConsistency = {
    total_habits: habits.length,
    completed_today: completedTodayHabitIds.size,
    avg_7d_rate_percent: avg7dRatePercent,
  };

  // 14. Deterministic Execution State
  const executionState = buildExecutionState({
    tasks: allTasks,
    schedule,
    nativeEvents: (nativeEventsData as any[]) || [],
    taskEvents,
    now,
    todayKey: dateKey,
    acceptedMemories: relevantMemories,
    toCompact,
  });

  return {
    user: {
      name: profile?.full_name || "User",
      timezone,
      persona: profile?.persona || null,
      preferred_style: profile?.preferred_style || null,
      productivity_method: profile?.productivity_method || null,
    },
    now: {
      iso: now.toISOString(),
      date: dateKey,
      time: timeStr,
      day_of_week: dayOfWeek,
    },
    schedule,
    capacity,
    planning,
    daily_state: dailyState,
    day_plan: dayPlan,
    active_triggers: activeTriggers,
    reflection: dailyReflection,
    review_summary: rollingReview,
    execution_state: executionState,
    execution: {
      top_three: topThree,
      overdue_tasks: overdue,
      today_tasks: todayTasks,
      upcoming_urgent_tasks: upcomingUrgent,
      stalled_or_avoided_tasks: stalledOrAvoided,
      total_open_tasks: openTasks.length,
      completed_today_count: completedToday.length,
    },
    behavioral_signals: behavioralSignals,
    focus_summary: focusSummary,
    habit_consistency: habitConsistency,
    memory: {
      relevant: relevantMemories,
    },
    goals: compactGoals,
    recent_reflection: recentReflection,
  };
}
