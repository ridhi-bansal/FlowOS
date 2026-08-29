import { newId, nowIso } from "./repository";
import { todayKey, addDaysToKey } from "@/lib/utils/date";
import type {
  Area, Goal, Project, Task, Habit, HabitLog, CalendarEvent,
  FocusSession, TimeEntry, JournalEntry, Integration, Profile,
} from "@/types";

/**
 * Realistic, interconnected demo data for a fictional student, "Maya Chen".
 * Used to seed a fresh local database (see lib/data/index.ts -> seedIfEmpty).
 * This is clearly fictional/local data — never mixed with anything real,
 * and never presented to the user as synced or shared.
 */
export const DEMO_USER_ID = "demo-user-maya";

function daysFromNow(n: number): string {
  return addDaysToKey(todayKey(), n);
}

function atTime(dateIso: string, hh: number, mm = 0): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function buildSeedData() {
  const profile: Profile = {
    id: DEMO_USER_ID,
    full_name: "Maya Chen",
    avatar_url: null,
    persona: "student",
    typical_schedule: "Classes weekday mornings, work block afternoons",
    responsibilities: "Full-time undergrad, part-time tutoring job",
    problems: ["too_many_tasks", "procrastination", "unclear_goals"],
    preferred_style: "structured",
    productivity_method: "time_blocking",
    onboarding_completed: true,
    theme: "light",
    timezone: "America/New_York",
  };

  const areas: Area[] = [
    { id: newId(), user_id: DEMO_USER_ID, name: "School", color: "#635bff" },
    { id: newId(), user_id: DEMO_USER_ID, name: "Health", color: "#159570" },
    { id: newId(), user_id: DEMO_USER_ID, name: "Personal", color: "#c88a00" },
  ];
  const [schoolArea, healthArea] = areas;

  const goals: Goal[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, parent_goal_id: null, area_id: schoolArea.id,
      title: "Finish sophomore year with a 3.7+ GPA", why: "Keep scholarship eligibility",
      horizon: "yearly", deadline: daysFromNow(120), success_metric: "GPA >= 3.7",
      progress: 55, status: "active", obstacles: "Chemistry is eating more time than planned",
    },
    {
      id: newId(), user_id: DEMO_USER_ID, parent_goal_id: null, area_id: healthArea.id,
      title: "Build a consistent exercise habit", why: "Energy has been low this semester",
      horizon: "quarterly", deadline: daysFromNow(60), success_metric: "4 workouts/week",
      progress: 30, status: "at_risk", obstacles: "Mornings are the only open slot",
    },
  ];

  const projects: Project[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, goal_id: goals[0].id, area_id: schoolArea.id,
      name: "Chemistry 201", objective: "Pass with a B+ or better", deadline: daysFromNow(100),
      status: "at_risk", notes: "Midterm coming up in ~2 weeks", color: "#d84b5b",
    },
    {
      id: newId(), user_id: DEMO_USER_ID, goal_id: goals[0].id, area_id: schoolArea.id,
      name: "CS 240 — Data Structures", objective: "Finish all 6 programming assignments",
      deadline: daysFromNow(90), status: "on_track", notes: "Group project starts next week", color: "#635bff",
    },
  ];
  const [chemProject, csProject] = projects;

  const tasks: Task[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, parent_task_id: null, project_id: chemProject.id,
      goal_id: goals[0].id, area_id: schoolArea.id, event_id: null,
      name: "Finish chemistry problem set 4", description: null, status: "next",
      priority: "high", start_date: null, due_date: daysFromNow(1), due_time: "18:00",
      estimated_minutes: 90, actual_minutes: null, energy: "high", context: "@desk",
      recurrence: null, notes: null, done: false, completed_at: null,
      created_at: nowIso(), updated_at: nowIso(),
    },
    {
      id: newId(), user_id: DEMO_USER_ID, parent_task_id: null, project_id: csProject.id,
      goal_id: goals[0].id, area_id: schoolArea.id, event_id: null,
      name: "Implement binary search tree assignment", description: null, status: "scheduled",
      priority: "medium", start_date: null, due_date: daysFromNow(4), due_time: "23:59",
      estimated_minutes: 120, actual_minutes: null, energy: "high", context: "@computer",
      recurrence: null, notes: null, done: false, completed_at: null,
      created_at: nowIso(), updated_at: nowIso(),
    },
    {
      id: newId(), user_id: DEMO_USER_ID, parent_task_id: null, project_id: null,
      goal_id: null, area_id: null, event_id: null,
      name: "Call dentist to reschedule cleaning", description: null, status: "inbox",
      priority: "low", start_date: null, due_date: null, due_time: null,
      estimated_minutes: 10, actual_minutes: null, energy: "low", context: "@phone",
      recurrence: null, notes: null, done: false, completed_at: null,
      created_at: nowIso(), updated_at: nowIso(),
    },
    {
      id: newId(), user_id: DEMO_USER_ID, parent_task_id: null, project_id: chemProject.id,
      goal_id: goals[0].id, area_id: schoolArea.id, event_id: null,
      name: "Review chemistry ch. 5 notes before midterm", description: null, status: "someday",
      priority: "medium", start_date: null, due_date: daysFromNow(10), due_time: null,
      estimated_minutes: 45, actual_minutes: null, energy: "medium", context: "@desk",
      recurrence: null, notes: null, done: false, completed_at: null,
      created_at: nowIso(), updated_at: nowIso(),
    },
    {
      id: newId(), user_id: DEMO_USER_ID, parent_task_id: null, project_id: null,
      goal_id: null, area_id: healthArea.id, event_id: null,
      name: "Morning run", description: null, status: "completed",
      priority: "medium", start_date: null, due_date: daysFromNow(-1), due_time: "07:00",
      estimated_minutes: 30, actual_minutes: 35, energy: "medium", context: "@outside",
      recurrence: "daily", notes: null, done: true, completed_at: nowIso(),
      created_at: nowIso(), updated_at: nowIso(),
    },
  ];

  const events: CalendarEvent[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, task_id: null, title: "Chemistry 201 lecture",
      kind: "event", start_at: atTime(daysFromNow(0), 9, 0), end_at: atTime(daysFromNow(0), 10, 15),
      location: "Science Hall 220", notes: null,
    },
    {
      id: newId(), user_id: DEMO_USER_ID, task_id: null, title: "CS 240 lab",
      kind: "event", start_at: atTime(daysFromNow(0), 13, 0), end_at: atTime(daysFromNow(0), 14, 30),
      location: "CS Building 110", notes: null,
    },
    {
      id: newId(), user_id: DEMO_USER_ID, task_id: tasks[0].id, title: "Focus: Chemistry PS4",
      kind: "time_block", start_at: atTime(daysFromNow(0), 16, 0), end_at: atTime(daysFromNow(0), 17, 30),
      location: null, notes: null,
    },
  ];

  const habits: Habit[] = [
    { id: newId(), user_id: DEMO_USER_ID, name: "Morning run", frequency: "daily", target_per_period: 1, color: "#159570", archived: false },
    { id: newId(), user_id: DEMO_USER_ID, name: "Review flashcards", frequency: "daily", target_per_period: 1, color: "#635bff", archived: false },
  ];

  const habitLogs: HabitLog[] = [
    { id: newId(), habit_id: habits[0].id, logged_date: daysFromNow(-1) },
    { id: newId(), habit_id: habits[0].id, logged_date: daysFromNow(-2) },
    { id: newId(), habit_id: habits[1].id, logged_date: daysFromNow(-1) },
  ];

  const focusSessions: FocusSession[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, task_id: tasks[1].id, session_goal: "Get BST insert/delete working",
      technique: "pomodoro", planned_minutes: 25, actual_minutes: 25,
      started_at: atTime(daysFromNow(-1), 15, 0), ended_at: atTime(daysFromNow(-1), 15, 25),
      rating: 4, reflection: "Good focus, finished insert method",
    },
  ];

  const timeEntries: TimeEntry[] = [
    { id: newId(), user_id: DEMO_USER_ID, task_id: null, category: "study", started_at: atTime(daysFromNow(-1), 15, 0), ended_at: atTime(daysFromNow(-1), 16, 30), notes: null },
    { id: newId(), user_id: DEMO_USER_ID, task_id: null, category: "exercise", started_at: atTime(daysFromNow(-1), 7, 0), ended_at: atTime(daysFromNow(-1), 7, 35), notes: null },
  ];

  const journalEntries: JournalEntry[] = [
    {
      id: newId(), user_id: DEMO_USER_ID, entry_date: daysFromNow(-1), mood: "focused", energy: "medium",
      answers: {
        what_mattered: "Made real progress on the CS assignment",
        what_avoided: "Haven't started reviewing for the chem midterm yet",
      },
    },
  ];

  const integrations: Integration[] = [
    { id: newId(), user_id: DEMO_USER_ID, provider: "google_calendar", status: "not_connected", external_account_email: null, connected_at: null },
    { id: newId(), user_id: DEMO_USER_ID, provider: "todoist", status: "coming_soon", external_account_email: null, connected_at: null },
    { id: newId(), user_id: DEMO_USER_ID, provider: "notion", status: "coming_soon", external_account_email: null, connected_at: null },
  ];

  return {
    profile, areas, goals, projects, tasks, events,
    habits, habitLogs, focusSessions, timeEntries, journalEntries, integrations,
  };
}
