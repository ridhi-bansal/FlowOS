import "server-only";
import { complete, parseJsonResponse } from "./client";

const DAY_SYSTEM = `You generate a realistic daily plan from the user's tasks, fixed
calendar events, and stated energy. Rules:
- Never schedule 100% of available time — leave realistic buffer (at least ~15%).
- Respect fixed events; only place tasks in the actual open windows between them.
- Prefer high-priority and due-soon tasks first, but don't ignore energy fit
  (e.g. don't stack three high-focus tasks back to back if energy is low).
- If there isn't enough open time for everything, leave the lowest-priority
  items unscheduled rather than overloading the day.

Return JSON: { "blocks": [ { "taskId": string, "taskName": string, "start": "HH:MM",
"end": "HH:MM", "reason": string } ], "unscheduled": [ { "taskId": string, "taskName": string, "reason": string } ] }`;

const WEEK_SYSTEM = `You generate a guided weekly plan from a look-back (what went
well/poorly, what was postponed) and a look-ahead (deadlines, goals, commitments).
Produce 3 top outcomes for the week, not a wall-to-wall schedule. Be conservative —
this is a starting point the user will adjust, not a locked schedule.

Return JSON: { "topOutcomes": [string], "suggestedProjects": [string],
"suggestedTasks": [string], "habitFocus": [string], "notes": string }`;

export async function planDay(input: {
  dateIso: string;
  wakingWindow: { start: string; end: string };
  energy?: "low" | "medium" | "high";
  fixedEvents: { title: string; start: string; end: string }[];
  candidateTasks: { id: string; name: string; priority: string; estimatedMinutes: number | null; dueDate: string | null }[];
}) {
  const raw = await complete({ system: DAY_SYSTEM, prompt: JSON.stringify(input), json: true, maxTokens: 900 });
  return parseJsonResponse(raw);
}

export async function planWeek(input: {
  weekStartIso: string;
  lookBack: { wentWell: string; didnt: string; postponed: string; patterns: string };
  lookAhead: { deadlines: string[]; goals: string[]; commitments: string[] };
}) {
  const raw = await complete({ system: WEEK_SYSTEM, prompt: JSON.stringify(input), json: true, maxTokens: 700 });
  return parseJsonResponse(raw);
}
