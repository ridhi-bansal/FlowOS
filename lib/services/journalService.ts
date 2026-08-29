"use client";

import { journalEntries as entryRepo, newId, nowIso } from "@/lib/data";
import type { JournalEntry } from "@/types";

export const PROMPTS: { key: string; question: string }[] = [
  { key: "what_mattered", question: "What actually mattered today?" },
  { key: "time_sink", question: "What consumed more time than expected?" },
  { key: "avoided", question: "What did I avoid?" },
  { key: "energized", question: "What gave me energy?" },
  { key: "drained", question: "What drained me?" },
  { key: "postponing", question: "What decision am I postponing?" },
  { key: "tomorrow", question: "What should I do differently tomorrow?" },
];

export function listAllEntries(): Promise<JournalEntry[]> {
  return entryRepo.list();
}

export function entryForDate(entries: JournalEntry[], date: string): JournalEntry | null {
  return entries.find((e) => e.entry_date === date) ?? null;
}

/** Creates today's entry if missing, or updates it — one entry per date, upserted by date rather than id. */
export async function saveEntry(
  entries: JournalEntry[],
  date: string,
  patch: { mood?: string | null; energy?: string | null; answers: Record<string, string> }
): Promise<JournalEntry> {
  const existing = entryForDate(entries, date);
  if (existing) {
    return entryRepo.update(existing.id, { ...patch, answers: { ...existing.answers, ...patch.answers } });
  }
  const entry: JournalEntry = {
    id: newId(),
    user_id: "local",
    entry_date: date,
    mood: patch.mood ?? null,
    energy: patch.energy ?? null,
    answers: patch.answers,
  };
  return entryRepo.create(entry as JournalEntry & { created_at?: string; updated_at?: string });
}

export function sortByDateDesc(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}
