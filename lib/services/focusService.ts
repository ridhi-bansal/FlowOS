"use client";

import { focusSessions as sessionRepo, newId, nowIso } from "@/lib/data";
import type { FocusSession } from "@/types";
import { todayKey } from "@/lib/utils/date";

export interface StartSessionInput {
  taskId?: string | null;
  sessionGoal: string;
  plannedMinutes: number;
  technique?: string;
}

export function startSession(input: StartSessionInput): Promise<FocusSession> {
  const session: FocusSession = {
    id: newId(),
    user_id: "local",
    task_id: input.taskId ?? null,
    session_goal: input.sessionGoal,
    technique: input.technique ?? "pomodoro",
    planned_minutes: input.plannedMinutes,
    actual_minutes: null,
    started_at: nowIso(),
    ended_at: null,
    rating: null,
    reflection: null,
  };
  return sessionRepo.create(session as FocusSession & { created_at?: string; updated_at?: string });
}

export function completeSession(id: string, actualMinutes: number, rating?: number | null, reflection?: string | null): Promise<FocusSession> {
  return sessionRepo.update(id, { ended_at: nowIso(), actual_minutes: actualMinutes, rating: rating ?? null, reflection: reflection ?? null });
}

/** Abandons an unfinished session (e.g. the user starts a fresh one instead) — just removes the incomplete row. */
export function cancelSession(id: string): Promise<void> {
  return sessionRepo.remove(id);
}

export function listAllSessions(): Promise<FocusSession[]> {
  return sessionRepo.list();
}

export function getActiveSession(sessions: FocusSession[]): FocusSession | null {
  const open = sessions.filter((s) => !s.ended_at);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

function todayIso(): string {
  return todayKey();
}

export function todaysSessions(sessions: FocusSession[]): FocusSession[] {
  const today = todayIso();
  return sessions.filter((s) => s.started_at.slice(0, 10) === today);
}

export function totalMinutesToday(sessions: FocusSession[]): number {
  return todaysSessions(sessions).reduce((sum, s) => sum + (s.actual_minutes ?? (s.ended_at ? 0 : 0)), 0);
}
