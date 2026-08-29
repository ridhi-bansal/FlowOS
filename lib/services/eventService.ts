"use client";

import { events as eventsRepo, newId, nowIso } from "@/lib/data";
import type { CalendarEvent, Task } from "@/types";
import { dateKey as localDateKey } from "@/lib/utils/date";

/**
 * Domain logic for calendar events, built the same way as
 * lib/services/taskService.ts: components call these functions, never the
 * raw `events` repository from @/lib/data directly.
 */

export interface NewEventInput {
  title: string;
  kind?: CalendarEvent["kind"];
  start_at: string; // ISO datetime
  end_at: string; // ISO datetime
  location?: string | null;
  notes?: string | null;
  task_id?: string | null;
}

export function createEvent(input: NewEventInput): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    id: newId(),
    user_id: "local",
    task_id: input.task_id ?? null,
    title: input.title.trim(),
    kind: input.kind ?? "event",
    start_at: input.start_at,
    end_at: input.end_at,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
  return eventsRepo.create(event);
}

export function updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<CalendarEvent> {
  return eventsRepo.update(id, patch);
}

export function deleteEvent(id: string): Promise<void> {
  return eventsRepo.remove(id);
}

export function listAllEvents(): Promise<CalendarEvent[]> {
  return eventsRepo.list();
}

// ---- View helpers -------------------------------------------------------

export function dateKey(iso: string): string {
  // Fixed: was `iso.slice(0, 10)`, which reads the UTC calendar date off
  // an already-UTC ISO string — wrong for any timezone west/east of UTC
  // whenever local and UTC disagree on which day it is. Convert to the
  // viewer's local date instead.
  return localDateKey(new Date(iso));
}

/** Groups events by their calendar day (YYYY-MM-DD), sorted by start time within each day. */
export function groupEventsByDay(all: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of all) {
    const key = dateKey(e.start_at);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  return map;
}

/**
 * Synthetic "task deadline" markers for tasks with a due_date, so the
 * calendar can show them alongside real events without writing a
 * duplicate row into the events store. These are NOT persisted — they're
 * derived fresh from tasks every render and are visually distinct
 * (kind: "task") from real scheduled events.
 */
export function taskDeadlineMarkers(tasks: Task[]): CalendarEvent[] {
  return tasks
    .filter((t) => !t.done && t.due_date)
    .map((t) => {
      const time = t.due_time ?? "23:59";
      const startIso = `${t.due_date}T${time}:00`;
      return {
        id: `task-deadline-${t.id}`,
        user_id: "local",
        task_id: t.id,
        title: t.name,
        kind: "task" as const,
        start_at: new Date(startIso).toISOString(),
        end_at: new Date(startIso).toISOString(),
        location: null,
        notes: null,
      };
    });
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
export function toDateKey(d: Date): string {
  return localDateKey(d);
}
