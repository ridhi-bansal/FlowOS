import "server-only";

/**
 * Single choke point for talking to the AI provider. Every other file in
 * lib/ai/* calls `complete()` instead of an SDK directly, so switching
 * providers (or models) later means editing only this file.
 *
 * The API key is read from process.env — never pass it to, or reference
 * it from, any Client Component.
 */

export interface CompleteOptions {
  system?: string;
  prompt: string;
  /** If set, asks the model to return only JSON matching this shape (describe it in the prompt). */
  json?: boolean;
  maxTokens?: number;
}

export async function complete({ system, prompt, json, maxTokens = 1024 }: CompleteOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: json
        ? `${system ?? ""}\n\nRespond with ONLY valid JSON. No preamble, no markdown fences, no commentary.`
        : system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI provider error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .map((block: { type: string; text?: string }) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");

  return text.trim();
}

/** Parses a model response that was asked to return JSON, stripping stray fences defensively. */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  return JSON.parse(cleaned) as T;
}
