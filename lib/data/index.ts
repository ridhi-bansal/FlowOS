"use client";

import { createLocalRepo } from "./local/genericRepo";
import { createSupabaseRepo } from "./remote/genericSupabaseRepo";
import { supabaseProfileRepo } from "./remote/profileRepo";
import { buildSeedData } from "./seed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { StoreName } from "@/lib/db/indexedStore";
export { newId, nowIso } from "./repository";
export type { Repository } from "./repository";
import type {
  Profile, Task, Project, Goal, Area, Tag, Milestone, CalendarEvent,
  FocusSession, TimeEntry, Habit, HabitLog, JournalEntry, Review,
  CoachConversation, CoachMessage, Integration, AppNotification,
} from "@/types";

/**
 * ============================================================================
 * DATA LAYER — LOCAL (IndexedDB) or CLOUD (Supabase), decided by env config
 * ============================================================================
 * This is the ONLY file the rest of the app should import repositories from.
 * Every page/component does `import { tasks, projects, ... } from "@/lib/data"`
 * — never `@/lib/data/local/...`, never `@/lib/data/remote/...`, never
 * IndexedDB or Supabase directly.
 *
 * Which backend is live is decided once, here, by isSupabaseConfigured()
 * (lib/supabase/config.ts — true iff NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are set):
 *   - Not configured -> IndexedDB (lib/data/local/genericRepo.ts)   — dev/demo mode
 *   - Configured      -> Supabase (lib/data/remote/genericSupabaseRepo.ts) — real cloud persistence, RLS-protected
 *
 * Both sides implement the exact same Repository<T> interface
 * (lib/data/repository.ts), so no component needs to know or care which
 * one is active. This is the same switch pattern as lib/auth/index.ts.
 *
 * IMPORTANT: local IndexedDB data is NOT automatically migrated when you
 * turn on Supabase — see lib/services/migrationService.ts and the "Import
 * local data" control in Settings for a safe, explicit, one-time import.
 * ============================================================================
 */

const CLOUD = isSupabaseConfigured();

function repo<T extends { id: string; user_id?: string; created_at?: string; updated_at?: string }>(table: StoreName) {
  return CLOUD ? createSupabaseRepo<T>(table) : createLocalRepo<T>(table);
}

export const profiles = CLOUD ? supabaseProfileRepo : createLocalRepo<Profile>("profiles");
export const areas = repo<Area>("areas");
export const tags = repo<Tag>("tags");
export const goals = repo<Goal>("goals");
export const projects = repo<Project>("projects");
export const milestones = repo<Milestone>("milestones");
export const tasks = repo<Task>("tasks");
export const events = repo<CalendarEvent>("events");
export const focusSessions = repo<FocusSession>("focus_sessions");
export const timeEntries = repo<TimeEntry>("time_entries");
export const habits = repo<Habit>("habits");
export const habitLogs = repo<HabitLog>("habit_logs");
export const journalEntries = repo<JournalEntry>("journal_entries");
export const reviews = repo<Review>("reviews");
export const coachConversations = repo<CoachConversation>("coach_conversations");
export const coachMessages = repo<CoachMessage>("coach_messages");
export const integrations = repo<Integration>("integrations");
export const notifications = repo<AppNotification>("notifications");

const SEEDED_FLAG_KEY = "flowos.seeded.v1";

/**
 * Populates a fresh browser with the demo student account (see seed.ts) the
 * first time FlowOS runs there. Local mode only — a real Supabase account
 * should never get fictional "Maya Chen" data mixed into it, so this is a
 * complete no-op in cloud mode regardless of whether the flag/local data
 * exist. No-op on every later local-mode load too. This is demo data
 * only — real user-created data is never touched or overwritten by it.
 */
export async function seedIfEmpty(): Promise<void> {
  if (typeof window === "undefined") return;
  if (CLOUD) return;
  if (window.localStorage.getItem(SEEDED_FLAG_KEY)) return;

  const existing = await profiles.list();
  if (existing.length > 0) {
    window.localStorage.setItem(SEEDED_FLAG_KEY, "1");
    return;
  }

  const seed = buildSeedData();
  await profiles.create(seed.profile);
  await Promise.all(seed.areas.map((a) => areas.create(a)));
  await Promise.all(seed.goals.map((g) => goals.create(g)));
  await Promise.all(seed.projects.map((p) => projects.create(p)));
  await Promise.all(seed.tasks.map((t) => tasks.create(t)));
  await Promise.all(seed.events.map((e) => events.create(e)));
  await Promise.all(seed.habits.map((h) => habits.create(h)));
  await Promise.all(seed.habitLogs.map((h) => habitLogs.create(h)));
  await Promise.all(seed.focusSessions.map((f) => focusSessions.create(f)));
  await Promise.all(seed.timeEntries.map((t) => timeEntries.create(t)));
  await Promise.all(seed.journalEntries.map((j) => journalEntries.create(j)));
  await Promise.all(seed.integrations.map((i) => integrations.create(i)));

  window.localStorage.setItem(SEEDED_FLAG_KEY, "1");
}

/**
 * Wipes this browser's local IndexedDB/localStorage FlowOS data. Used by
 * Settings > "Reset local data."
 *
 * Deliberately imports createLocalRepo directly instead of using the
 * `tasks`/`projects`/etc. exports above: those exports point at Supabase
 * in cloud mode, and this function must NEVER delete cloud data — its job
 * is exclusively "clear what's cached/stored in this browser," which is a
 * real, separate, meaningful action even in cloud mode (e.g. clearing out
 * pre-migration local data after a successful import). Always operates on
 * IndexedDB regardless of which mode is currently active.
 */
export async function resetAllLocalData(): Promise<void> {
  const local = {
    profiles: createLocalRepo<Profile>("profiles"),
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
  await Promise.all(
    Object.values(local).map((r) => r.list().then((rows) => Promise.all(rows.map((row) => r.remove(row.id)))))
  );
  window.localStorage.removeItem(SEEDED_FLAG_KEY);
}
