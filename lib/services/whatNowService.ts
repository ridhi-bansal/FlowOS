"use client";

import { events as eventsRepo } from "@/lib/data";
import { getPostponeCount, isOverdue, isDueToday, sortByPriorityThenDue } from "./taskService";
import type { Task, WhatNowRecommendation } from "@/types";

/**
 * ============================================================================
 * WHAT SHOULD I DO NOW? — local rule-based recommender
 * ============================================================================
 * Deliberately NOT calling any external AI API (see lib/ai/index.ts, which
 * is server-only and reserved for a future real backend). This runs
 * entirely client-side against the local task/event data, using a
 * transparent scoring rule so the "Why" shown to the user is always true.
 *
 * This mirrors the shape of the mock logic in
 * lib/ai/providers/mock/index.ts, but lives here (not in lib/ai) because
 * it needs to run in client components against IndexedDB-backed data —
 * lib/ai/index.ts is import "server-only" and can't be.
 * ============================================================================
 */

function minutesUntil(iso: string, from: Date): number {
  return Math.round((+new Date(iso) - +from) / 60000);
}

export async function whatShouldIDoNow(
  openTasks: Task[],
  energy: "low" | "medium" | "high" | undefined,
  now: Date = new Date()
): Promise<WhatNowRecommendation> {
  const candidates = openTasks.filter((t) => !t.done);

  if (candidates.length === 0) {
    return {
      taskId: null,
      taskName: "Nothing on your list right now",
      minutes: 0,
      reason: "Your task list is clear. Good moment to plan ahead or take a break.",
      confidence: "high",
    };
  }

  const allEvents = await eventsRepo.list();
  const nextEvent = allEvents
    .filter((e) => +new Date(e.start_at) > +now)
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))[0];
  const availableMinutes = nextEvent ? Math.max(0, minutesUntil(nextEvent.start_at, now)) : Infinity;

  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const scored = candidates
    .map((t) => {
      let score = priorityScore[t.priority] ?? 1;
      const reasons: string[] = [];

      if (isOverdue(t)) {
        score += 4;
        reasons.push("it's overdue");
      } else if (isDueToday(t)) {
        score += 3;
        reasons.push("it's due today");
      } else if (t.due_date) {
        const days = Math.round((+new Date(t.due_date) - +now) / 86400000);
        if (days <= 3) {
          score += 1;
          reasons.push(`it's due in ${days} day${days === 1 ? "" : "s"}`);
        }
      }

      if (t.priority === "high") reasons.push("it's marked high priority");

      const postponeCount = getPostponeCount(t.id);
      if (postponeCount > 0) {
        score += Math.min(postponeCount, 3);
        reasons.push(`you've pushed it back ${postponeCount} time${postponeCount === 1 ? "" : "s"} already`);
      }

      if (energy && t.energy && energy === t.energy) {
        score += 1;
        reasons.push(`it matches your current ${energy} energy`);
      }

      const duration = t.estimated_minutes ?? 30;
      const fits = duration <= availableMinutes;

      return { task: t, score, reasons, duration, fits };
    })
    .sort((a, b) => b.score - a.score);

  const fitting = scored.filter((s) => s.fits);
  const pick = (fitting[0] ?? scored[0]);

  const reasonParts = pick.reasons.length > 0 ? pick.reasons : ["it's next in line"];
  if (nextEvent && Number.isFinite(availableMinutes)) {
    reasonParts.push(`you have about ${availableMinutes} min before "${nextEvent.title}"`);
  }

  return {
    taskId: pick.task.id,
    taskName: pick.task.name,
    minutes: pick.duration,
    reason: `Because ${reasonParts.join(", ")}.`,
    confidence: pick.fits ? (pick.score >= 5 ? "high" : "medium") : "low",
  };
}

/** Convenience export used by the dashboard's Top 3 fallback list. */
export function rankByUrgency(tasks: Task[]): Task[] {
  return sortByPriorityThenDue(tasks.filter((t) => !t.done));
}
