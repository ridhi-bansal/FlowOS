import "server-only";
import { complete, parseJsonResponse } from "./client";
import type { ParsedTaskDraft } from "@/types";

const SYSTEM = `You turn a single sentence of freeform text into a structured task draft.
Today's date and the user's timezone will be given to you — resolve relative dates
("tomorrow", "Friday") against them. If duration, due date, or priority genuinely
cannot be inferred, leave the field null rather than guessing, and set
"ambiguous": true with a short "clarification_question". Priority defaults to
"medium" when nothing in the text signals otherwise. Never invent a due date that
wasn't stated or clearly implied.

Return JSON exactly matching this shape:
{
  "name": string,
  "due_date": string | null,       // YYYY-MM-DD
  "due_time": string | null,       // HH:MM 24h
  "estimated_minutes": number | null,
  "priority": "low" | "medium" | "high",
  "ambiguous": boolean,
  "clarification_question": string | null
}`;

export async function parseTaskFromText(
  text: string,
  context: { todayIso: string; timezone: string }
): Promise<ParsedTaskDraft> {
  const prompt = `Today: ${context.todayIso} (${context.timezone})\nInput: "${text}"`;
  const raw = await complete({ system: SYSTEM, prompt, json: true, maxTokens: 400 });
  return parseJsonResponse<ParsedTaskDraft>(raw);
}
