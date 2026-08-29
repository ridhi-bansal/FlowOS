import "server-only";
import { complete, parseJsonResponse } from "./client";
import type { WhatNowRecommendation, Task, CalendarEvent } from "@/types";

const SYSTEM = `You are FlowOS's "What Should I Do Now?" engine. Given the user's open
tasks, today's remaining calendar events, and the current time, pick exactly ONE
task to recommend right now. Prefer: overdue or due-soon items, high priority,
a realistic fit for the time actually available before the next event, and
alignment with what the user said their energy is. Do not recommend something
that needs more time than is available before the next commitment.

Return JSON exactly matching this shape:
{
  "taskId": string | null,
  "taskName": string,
  "minutes": number,
  "reason": string,        // one or two sentences, concrete, explains the "why"
  "confidence": "low" | "medium" | "high"
}
If there are truly no open tasks, return taskId null, taskName "Nothing urgent —
take a break or plan ahead", minutes 0, and a reason saying so.`;

export async function whatShouldIDoNow(input: {
  nowIso: string;
  energy?: "low" | "medium" | "high";
  tasks: Pick<Task, "id" | "name" | "priority" | "due_date" | "due_time" | "estimated_minutes" | "status">[];
  upcomingEvents: Pick<CalendarEvent, "title" | "start_at" | "end_at">[];
}): Promise<WhatNowRecommendation> {
  const prompt = JSON.stringify(input);
  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 400 });
  return parseJsonResponse<WhatNowRecommendation>(raw);
}
