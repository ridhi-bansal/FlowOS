import "server-only";
import * as mock from "./providers/mock";
import type { ParsedTaskDraft, WhatNowRecommendation, CoachMode } from "@/types";
import type { ModelTurnResult, ToolCall } from "./providers/anthropic/client";

export type { ModelTurnResult, ToolCall };

export type AiProviderName = "gemini" | "anthropic" | "mock";

/**
 * Resolves the currently active AI provider:
 * - AI_PROVIDER="gemini" (requires GEMINI_API_KEY)
 * - AI_PROVIDER="anthropic" (requires ANTHROPIC_API_KEY)
 * - AI_PROVIDER="mock" or unset -> "mock" (default local deterministic fallback)
 */
export function getActiveAiProvider(): AiProviderName {
  const configured = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  if (configured === "gemini" && !!process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (configured === "anthropic" && !!process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (configured === "mock") {
    return "mock";
  }
  // Auto-detection when AI_PROVIDER is unset or "auto"
  if (!configured || configured === "auto") {
    if (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return "gemini";
    if (process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) return "anthropic";
  }
  return "mock";
}

/** True when responses are coming from the local mock provider */
export function isAiMocked(): boolean {
  return getActiveAiProvider() === "mock";
}

async function loadAnthropicProvider() {
  return import("./providers/anthropic/index");
}

async function loadGeminiProvider() {
  return import("./providers/gemini/index");
}

export async function parseTaskFromText(
  text: string,
  context: { todayIso: string; timezone: string }
): Promise<ParsedTaskDraft> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).parseTaskFromText(text, context);
  if (provider === "anthropic") return (await loadAnthropicProvider()).parseTaskFromText(text, context);
  return mock.parseTaskFromText(text, context);
}

export async function whatShouldIDoNow(
  input: Parameters<typeof mock.whatShouldIDoNow>[0]
): Promise<WhatNowRecommendation> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).whatShouldIDoNow(input);
  if (provider === "anthropic") return (await loadAnthropicProvider()).whatShouldIDoNow(input);
  return mock.whatShouldIDoNow(input);
}

export async function coachReply(input: {
  mode: CoachMode;
  userMessage: string;
  contextSummary: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).coachReply(input);
  if (provider === "anthropic") return (await loadAnthropicProvider()).coachReply(input);
  return mock.coachReply(input);
}

export async function planDay(input: Parameters<typeof mock.planDay>[0]) {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).planDay(input);
  if (provider === "anthropic") return (await loadAnthropicProvider()).planDay(input);
  return mock.planDay(input);
}

export async function planWeek(input: Parameters<typeof mock.planWeek>[0]) {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).planWeek(input);
  if (provider === "anthropic") return (await loadAnthropicProvider()).planWeek(input);
  return mock.planWeek(input);
}

export async function classifyInboxItem(text: string) {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).classifyInboxItem(text);
  if (provider === "anthropic") return (await loadAnthropicProvider()).classifyInboxItem(text);
  return mock.classifyInboxItem(text);
}

export async function interpretAnalytics(metricsSummary: string): Promise<string> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") return (await loadGeminiProvider()).interpretAnalytics(metricsSummary);
  if (provider === "anthropic") return (await loadAnthropicProvider()).interpretAnalytics(metricsSummary);
  return mock.interpretAnalytics(metricsSummary);
}

/**
 * Universal streaming turn for interactive Coach conversations.
 * Routes dynamically to Gemini or Anthropic based on active configuration.
 */
export async function streamTurn(options: {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  maxTokens?: number;
  onTextDelta?: (delta: string) => void;
}): Promise<ModelTurnResult> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") {
    const { streamTurn: geminiStream } = await import("./providers/gemini/client");
    return geminiStream(options);
  }
  if (provider === "anthropic") {
    const { streamTurn: anthropicStream } = await import("./providers/anthropic/client");
    return anthropicStream(options);
  }
  throw new Error(
    "No active AI provider configured for streaming. Set AI_PROVIDER=gemini (with GEMINI_API_KEY) or AI_PROVIDER=anthropic (with ANTHROPIC_API_KEY)."
  );
}

/**
 * Universal non-streaming turn for conversational tool calling.
 */
export async function completeTurn(options: {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  maxTokens?: number;
}): Promise<ModelTurnResult> {
  const provider = getActiveAiProvider();
  if (provider === "gemini") {
    const { completeTurn: geminiTurn } = await import("./providers/gemini/client");
    return geminiTurn(options);
  }
  if (provider === "anthropic") {
    const { completeTurn: anthropicTurn } = await import("./providers/anthropic/client");
    return anthropicTurn(options);
  }
  throw new Error(
    "No active AI provider configured. Set AI_PROVIDER=gemini (with GEMINI_API_KEY) or AI_PROVIDER=anthropic (with ANTHROPIC_API_KEY)."
  );
}
