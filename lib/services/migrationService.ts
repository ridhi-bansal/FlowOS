"use client";

import { createLocalRepo } from "@/lib/data/local/genericRepo";
import { createClient } from "@/lib/supabase/client";
import type {
  Task, Project, Goal, Area, CalendarEvent, Habit, HabitLog,
  FocusSession, TimeEntry, JournalEntry, Integration,
} from "@/types";

/**
 * ============================================================================
 * LOCAL -> SUPABASE MIGRATION
 * ============================================================================
 * A one-time, explicit, user-initiated import (Settings > "Import local
 * data"). Never runs automatically. Never deletes local data — IndexedDB
 * is left untouched after a successful import; the person can clear it
 * separately via Settings > "Reset local data" once they've confirmed
 * their cloud data looks right.
 *
 * Local row ids are already valid UUIDs (crypto.randomUUID(), see
 * lib/data/repository.ts's newId()), so they're reused as-is in Supabase —
 * no id remapping needed. Every row's user_id is re-stamped to the
 * currently signed-in Supabase user, overwriting whatever placeholder
 * ("local") the local-mode data had.
 *
 * Insert order matters for foreign keys: areas/goals before projects,
 * projects before tasks, tasks before events (which can reference a
 * task_id), and subtasks are inserted in a second pass after their
 * parents exist (parent_task_id is nulled out on the first pass so a
 * child never tries to reference a parent that isn't in the database yet).
 * ============================================================================
 */

export interface MigrationPreflight {
  hasLocalData: boolean;
  localCounts: Record<string, number>;
  cloudAlreadyHasData: boolean;
  cloudCounts: Record<string, number>;
}

function localRepos() {
  return {
    areas: createLocalRepo<Area>("areas"),
    goals: createLocalRepo<Goal>("goals"),
    projects: createLocalRepo<Project>("projects"),
    tasks: createLocalRepo<Task>("tasks"),
    events: createLocalRepo<CalendarEvent>("events"),
    habits: createLocalRepo<Habit>("habits"),
    habitLogs: createLocalRepo<HabitLog>("habit_logs"),
    focusSessions: createLocalRepo<FocusSession>("focus_sessions"),
    timeEntries: createLocalRepo<TimeEntry>("time_entries"),
    journalEntries: createLocalRepo<JournalEntry>("journal_entries"),
    integrations: createLocalRepo<Integration>("integrations"),
  };
}

/** Checks what's locally available and whether the cloud account already has data, without changing anything. */
export async function preflightMigration(): Promise<MigrationPreflight> {
  const local = localRepos();
  const localCounts: Record<string, number> = {};
  for (const [key, r] of Object.entries(local)) {
    localCounts[key] = (await r.list()).length;
  }
  const hasLocalData = Object.values(localCounts).some((n) => n > 0);

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const cloudCounts: Record<string, number> = {};
  if (userData.user) {
    for (const table of ["tasks", "projects", "goals", "events", "habits"]) {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userData.user.id);
      cloudCounts[table] = count ?? 0;
    }
  }
  const cloudAlreadyHasData = Object.values(cloudCounts).some((n) => n > 0);

  return { hasLocalData, localCounts, cloudAlreadyHasData, cloudCounts };
}

export interface MigrationResult {
  imported: Record<string, number>;
  errors: string[];
}

/**
 * Performs the import. Caller is responsible for confirming with the user
 * first, especially when preflightMigration() reported cloudAlreadyHasData
 * — this function does not re-check that itself, so it can also be used
 * for an intentional re-import/merge if the person explicitly wants that.
 */
export async function migrateLocalDataToSupabase(): Promise<MigrationResult> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("You must be signed in to Supabase before importing local data.");
  }
  const userId = userData.user.id;
  const imported: Record<string, number> = {};
  const errors: string[] = [];

  async function insertAll<T extends Record<string, unknown>>(table: string, rows: T[]) {
    if (rows.length === 0) {
      imported[table] = 0;
      return;
    }
    const stamped = rows.map((r) => ({ ...r, user_id: userId }));
    const { error, count } = await supabase.from(table).insert(stamped, { count: "exact" });
    if (error) {
      errors.push(`${table}: ${error.message}`);
      imported[table] = 0;
    } else {
      imported[table] = count ?? stamped.length;
    }
  }

  const local = localRepos();
  const [areas, goals, projects, tasks, events, habits, habitLogs, focusSessions, timeEntries, journalEntries, integrations] =
    await Promise.all([
      local.areas.list(), local.goals.list(), local.projects.list(), local.tasks.list(),
      local.events.list(), local.habits.list(), local.habitLogs.list(), local.focusSessions.list(),
      local.timeEntries.list(), local.journalEntries.list(), local.integrations.list(),
    ]);

  // Dependency order: areas/goals -> projects -> tasks (parents, then
  // subtasks in a second pass) -> everything that can reference a task.
  await insertAll("areas", areas);
  await insertAll("goals", goals);
  await insertAll("projects", projects);

  const parentTasks = tasks.filter((t) => !t.parent_task_id);
  const subtasks = tasks.filter((t) => t.parent_task_id);
  await insertAll("tasks", parentTasks);
  await insertAll("tasks", subtasks); // parents now exist, safe to insert children referencing them

  await insertAll("events", events);
  await insertAll("habits", habits);
  await insertAll("habit_logs", habitLogs);
  await insertAll("focus_sessions", focusSessions);
  await insertAll("time_entries", timeEntries);
  await insertAll("journal_entries", journalEntries);
  await insertAll("integrations", integrations);

  return { imported, errors };
}
