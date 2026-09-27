import "server-only";
import { complete, parseJsonResponse } from "./client";

const SYSTEM = `You classify a single freeform inbox capture into one of:
task, project, note, goal, reminder, idea, calendar_event. Only ask for
clarification when the text is genuinely ambiguous between two very different
types (e.g. could be a task or a goal) — otherwise just classify it.

Return JSON: { "type": "task"|"project"|"note"|"goal"|"reminder"|"idea"|"calendar_event",
"needsClarification": boolean, "clarificationQuestion": string | null }`;

export async function classifyInboxItem(text: string) {
  const raw = await complete({ system: SYSTEM, prompt: text, json: true, maxTokens: 200 });
  return parseJsonResponse<{
    type: string;
    needsClarification: boolean;
    clarificationQuestion: string | null;
  }>(raw);
}
