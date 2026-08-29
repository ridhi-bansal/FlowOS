"use client";

import { habits as habitRepo, habitLogs as logRepo, newId, nowIso } from "@/lib/data";
import type { Habit, HabitLog } from "@/types";
import { todayKey, dateKey } from "@/lib/utils/date";

export interface NewHabitInput {
  name: string;
  frequency?: Habit["frequency"];
  target_per_period?: number;
  color?: string | null;
}

export function createHabit(input: NewHabitInput): Promise<Habit> {
  const habit: Habit = {
    id: newId(),
    user_id: "local",
    name: input.name.trim(),
    frequency: input.frequency ?? "daily",
    target_per_period: input.target_per_period ?? 1,
    color: input.color ?? "#159570",
    archived: false,
  };
  return habitRepo.create(habit as Habit & { created_at?: string; updated_at?: string });
}

export function updateHabit(id: string, patch: Partial<Habit>): Promise<Habit> {
  return habitRepo.update(id, patch);
}

export function archiveHabit(id: string): Promise<Habit> {
  return habitRepo.update(id, { archived: true });
}

export async function deleteHabit(id: string): Promise<void> {
  const logs = await logRepo.list();
  await Promise.all(logs.filter((l) => l.habit_id === id).map((l) => logRepo.remove(l.id)));
  await habitRepo.remove(id);
}

export function listAllHabits(): Promise<Habit[]> {
  return habitRepo.list();
}
export function listAllHabitLogs(): Promise<HabitLog[]> {
  return logRepo.list();
}

/** Toggles today's log for a habit — the core "did I do this today" interaction. */
export async function toggleTodayLog(habitId: string): Promise<void> {
  const logs = await logRepo.list();
  const today = todayKey();
  const existing = logs.find((l) => l.habit_id === habitId && l.logged_date === today);
  if (existing) {
    await logRepo.remove(existing.id);
  } else {
    await logRepo.create({ id: newId(), habit_id: habitId, logged_date: today } as HabitLog & { created_at?: string; updated_at?: string });
  }
}

export function isLoggedToday(logs: HabitLog[], habitId: string): boolean {
  const today = todayKey();
  return logs.some((l) => l.habit_id === habitId && l.logged_date === today);
}

/** Current consecutive-day streak ending today or yesterday (a miss today doesn't zero out until tomorrow). */
export function currentStreak(logs: HabitLog[], habitId: string): number {
  const dates = new Set(logs.filter((l) => l.habit_id === habitId).map((l) => l.logged_date));
  let streak = 0;
  const cursor = new Date();
  // If today isn't logged yet, start counting from yesterday so a still-open day doesn't break the streak.
  if (!dates.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Completion rate over the last N days (0-100). */
export function completionRate(logs: HabitLog[], habitId: string, days = 7): number {
  const dates = new Set(logs.filter((l) => l.habit_id === habitId).map((l) => l.logged_date));
  let hits = 0;
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    if (dates.has(dateKey(cursor))) hits++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.round((hits / days) * 100);
}
