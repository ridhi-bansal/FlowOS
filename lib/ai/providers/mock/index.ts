import type { ParsedTaskDraft, WhatNowRecommendation, Task, CalendarEvent, CoachMode } from "@/types";
import { addDaysToKey } from "@/lib/utils/date";

/**
 * ============================================================================
 * MOCK AI PROVIDER — no network calls, no API key, fully local
 * ============================================================================
 * This is FlowOS's current AI implementation. It uses plain rule-based logic
 * to approximate what each real feature will eventually do. It is NOT an LLM
 * and should never be described to the user as "AI" without qualification —
 * the coach UI should visibly label replies as running in local/demo mode.
 *
 * Every function here has the exact same signature as its counterpart in
 * lib/ai/providers/anthropic/*, so lib/ai/index.ts can switch between them
 * with one env var and nothing else in the app has to change.
 * ============================================================================
 */

const CLOCK_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
const DURATION_RE = /(\d+)\s*(min|minute|hour|hr)s?/i;

export async function parseTaskFromText(
  text: string,
  context: { todayIso: string; timezone: string }
): Promise<ParsedTaskDraft> {
  const lower = text.toLowerCase();

  let due_date: string | null = null;
  if (lower.includes("today")) due_date = context.todayIso;
  else if (lower.includes("tomorrow")) {
    // Was: new Date(context.todayIso) [parses as UTC midnight] -> setDate+1
    // [mutates in server-local time] -> toISOString() [back to UTC]. That
    // round-trip can shift the result by a day depending on the runtime's
    // UTC offset. Plain date-key arithmetic avoids Date-object round-trips
    // entirely.
    due_date = addDaysToKey(context.todayIso, 1);
  }

  let due_time: string | null = null;
  const timeMatch = text.match(CLOCK_RE);
  if (timeMatch && (lower.includes(" at ") || timeMatch[3])) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
    due_time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  let estimated_minutes: number | null = null;
  const durMatch = text.match(DURATION_RE);
  if (durMatch) {
    const n = parseInt(durMatch[1], 10);
    estimated_minutes = durMatch[2].startsWith("hour") || durMatch[2] === "hr" ? n * 60 : n;
  }

  const priority: ParsedTaskDraft["priority"] = /urgent|asap|important|high priority/.test(lower)
    ? "high"
    : /low priority|whenever|someday/.test(lower)
      ? "low"
      : "medium";

  // Strip the bits we parsed out of the name so it isn't cluttered.
  const name = text
    .replace(CLOCK_RE, "")
    .replace(DURATION_RE, "")
    .replace(/\b(today|tomorrow|at|for)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const ambiguous = due_date === null && due_time === null;

  return {
    name: name || text.trim(),
    due_date,
    due_time,
    estimated_minutes,
    priority,
    ambiguous,
    clarification_question: ambiguous
      ? "I couldn't find a date in that — when should this be done?"
      : null,
  };
}

type WhatNowTask = Pick<Task, "id" | "name" | "priority" | "due_date" | "due_time" | "estimated_minutes" | "status">;

export async function whatShouldIDoNow(input: {
  nowIso: string;
  energy?: "low" | "medium" | "high";
  tasks: WhatNowTask[];
  upcomingEvents: Pick<CalendarEvent, "title" | "start_at" | "end_at">[];
}): Promise<WhatNowRecommendation> {
  const now = new Date(input.nowIso);
  const open = input.tasks.filter((t) => t.status !== "completed");

  if (open.length === 0) {
    return {
      taskId: null,
      taskName: "Nothing urgent — take a break or plan ahead",
      minutes: 0,
      reason: "Your task list is clear right now.",
      confidence: "high",
    };
  }

  // Available minutes before the next event, if any.
  const nextEvent = input.upcomingEvents
    .filter((e) => new Date(e.start_at) > now)
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))[0];
  const availableMinutes = nextEvent
    ? Math.max(0, Math.round((+new Date(nextEvent.start_at) - +now) / 60000))
    : Infinity;

  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const scored = open
    .map((t) => {
      let score = priorityScore[t.priority] ?? 1;
      if (t.due_date) {
        const daysUntilDue = (+new Date(t.due_date) - +now) / 86400000;
        if (daysUntilDue <= 0) score += 4;
        else if (daysUntilDue <= 1) score += 2;
        else if (daysUntilDue <= 3) score += 1;
      }
      const fits = (t.estimated_minutes ?? 30) <= availableMinutes;
      return { task: t, score, fits };
    })
    .filter((s) => s.fits)
    .sort((a, b) => b.score - a.score);

  const pick = scored[0] ?? { task: open[0], score: 0 };
  const t = pick.task;
  const minutes = t.estimated_minutes ?? 30;

  const reasons: string[] = [];
  if (t.due_date && +new Date(t.due_date) <= +now) reasons.push("it's overdue");
  else if (t.due_date) {
    const days = Math.round((+new Date(t.due_date) - +now) / 86400000);
    if (days <= 1) reasons.push("it's due very soon");
  }
  if (t.priority === "high") reasons.push("it's marked high priority");
  if (nextEvent) reasons.push(`you have about ${availableMinutes} minutes before "${nextEvent.title}"`);
  if (reasons.length === 0) reasons.push("it's next in line and fits the time you have");

  return {
    taskId: t.id,
    taskName: t.name,
    minutes,
    reason: `Do this because ${reasons.join(", ")}.`,
    confidence: scored.length > 0 ? "medium" : "low",
  };
}

const MODE_LABEL: Record<CoachMode, string> = {
  strategist: "Strategist",
  executor: "Executor",
  coach: "Coach",
  analyst: "Analyst",
  minimalist: "Minimalist",
  study_coach: "Study Coach",
};

export async function coachReply(input: {
  mode: CoachMode;
  userMessage: string;
  contextSummary: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  return (
    `[Local demo mode — ${MODE_LABEL[input.mode]}] I can't reach a real AI model right now, so this is a ` +
    `canned local response rather than a genuine analysis of "${input.userMessage}". Here's what I can see ` +
    `from your data:\n\n${input.contextSummary}\n\nConnect ANTHROPIC_API_KEY (see .env.example) to get real ` +
    `coaching instead of this placeholder.`
  );
}

export async function planDay(input: {
  dateIso: string;
  wakingWindow: { start: string; end: string };
  energy?: "low" | "medium" | "high";
  fixedEvents: { title: string; start: string; end: string }[];
  candidateTasks: { id: string; name: string; priority: string; estimatedMinutes: number | null; dueDate: string | null }[];
}) {
  // Naive greedy scheduler: sort by priority/due date, drop tasks into the
  // gaps between fixed events, leave the rest unscheduled. No real
  // reasoning about energy fit — a real model would do much better here.
  const sorted = [...input.candidateTasks].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  const blocks: { taskId: string; taskName: string; start: string; end: string; reason: string }[] = [];
  const unscheduled: { taskId: string; taskName: string; reason: string }[] = [];

  let cursorMinutes = toMinutes(input.wakingWindow.start);
  const dayEnd = toMinutes(input.wakingWindow.end);
  const busy = [...input.fixedEvents].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  for (const task of sorted) {
    const duration = task.estimatedMinutes ?? 30;
    // Skip past any fixed events that start before the cursor could finish this task.
    while (busy.length && toMinutes(busy[0].start) < cursorMinutes + duration) {
      cursorMinutes = Math.max(cursorMinutes, toMinutes(busy[0].end));
      busy.shift();
    }
    if (cursorMinutes + duration > dayEnd) {
      unscheduled.push({ taskId: task.id, taskName: task.name, reason: "Not enough open time left today (local mock scheduler)." });
      continue;
    }
    blocks.push({
      taskId: task.id,
      taskName: task.name,
      start: fromMinutes(cursorMinutes),
      end: fromMinutes(cursorMinutes + duration),
      reason: "Placed by priority order in the next open slot (local mock — not a real plan).",
    });
    cursorMinutes += duration + 10; // small buffer between blocks
  }

  return { blocks, unscheduled };
}

export async function planWeek(input: {
  weekStartIso: string;
  lookBack: { wentWell: string; didnt: string; postponed: string; patterns: string };
  lookAhead: { deadlines: string[]; goals: string[]; commitments: string[] };
}) {
  return {
    topOutcomes: input.lookAhead.deadlines.slice(0, 3).length
      ? input.lookAhead.deadlines.slice(0, 3)
      : ["Review your upcoming deadlines and pick your top 3 for the week."],
    suggestedProjects: [],
    suggestedTasks: input.lookAhead.commitments.slice(0, 5),
    habitFocus: [],
    notes:
      "This is a local placeholder plan, not a generated one — connect ANTHROPIC_API_KEY for real weekly planning.",
  };
}

export async function classifyInboxItem(text: string) {
  const lower = text.toLowerCase();
  let type = "task";
  if (/\bidea\b|what if|maybe (i|we) could/.test(lower)) type = "idea";
  else if (/\bproject\b|\bplan (for|to)\b/.test(lower)) type = "project";
  else if (/\bgoal\b|\bby (this|next) (year|quarter)\b/.test(lower)) type = "goal";
  else if (/\bremind me\b|\bdon't forget\b/.test(lower)) type = "reminder";
  else if (/^(note|fyi)[:\-]/.test(lower)) type = "note";
  else if (/\d{1,2}(:\d{2})?\s*(am|pm)\b.*(meeting|call|appointment|lunch|dinner)/.test(lower)) type = "calendar_event";

  return { type, needsClarification: false, clarificationQuestion: null };
}

export async function interpretAnalytics(metricsSummary: string): Promise<string> {
  return (
    `[Local demo mode] Here are the raw numbers without real interpretation ` +
    `(connect ANTHROPIC_API_KEY for genuine analysis):\n\n${metricsSummary}`
  );
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
