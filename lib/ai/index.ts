import "server-only";
import * as mock from "./providers/mock";
import type { ParsedTaskDraft, WhatNowRecommendation, CoachMode } from "@/types";

/**
 * ============================================================================
 * AI LAYER — CURRENT STATE: MOCK (no external API calls)
 * ============================================================================
 * Every AI feature in the app calls the functions exported from THIS file,
 * never from providers/mock or providers/anthropic directly. Which
 * provider actually runs is decided once, here, by AI_PROVIDER:
 *
 *   AI_PROVIDER unset or "mock"  -> lib/ai/providers/mock      (default)
 *   AI_PROVIDER="anthropic"      -> lib/ai/providers/anthropic (needs ANTHROPIC_API_KEY)
 *
 * The mock provider is real, working, deterministic local logic — not a
 * stub that throws. It's clearly labeled as local/demo mode in its own
 * output (see providers/mock/index.ts) so the UI never has to pretend a
 * real model is running when it isn't.
 * ============================================================================
 */

const USE_ANTHROPIC = process.env.AI_PROVIDER === "anthropic" && !!process.env.ANTHROPIC_API_KEY;

async function loadAnthropicProvider() {
  // Dynamically imported so the mock-only path never needs the Anthropic
  // module (or its "server-only" real network call) evaluated.
  return import("./providers/anthropic/index");
}

export async function parseTaskFromText(
  text: string,
  context: { todayIso: string; timezone: string }
): Promise<ParsedTaskDraft> {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).parseTaskFromText(text, context);
  return mock.parseTaskFromText(text, context);
}

export async function whatShouldIDoNow(
  input: Parameters<typeof mock.whatShouldIDoNow>[0]
): Promise<WhatNowRecommendation> {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).whatShouldIDoNow(input);
  return mock.whatShouldIDoNow(input);
}

export async function coachReply(input: {
  mode: CoachMode;
  userMessage: string;
  contextSummary: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).coachReply(input);
  return mock.coachReply(input);
}

export async function planDay(input: Parameters<typeof mock.planDay>[0]) {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).planDay(input);
  return mock.planDay(input);
}

export async function planWeek(input: Parameters<typeof mock.planWeek>[0]) {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).planWeek(input);
  return mock.planWeek(input);
}

export async function classifyInboxItem(text: string) {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).classifyInboxItem(text);
  return mock.classifyInboxItem(text);
}

export async function interpretAnalytics(metricsSummary: string): Promise<string> {
  if (USE_ANTHROPIC) return (await loadAnthropicProvider()).interpretAnalytics(metricsSummary);
  return mock.interpretAnalytics(metricsSummary);
}

/** True when responses are coming from the mock provider — surface this in the UI. */
export function isAiMocked(): boolean {
  return !USE_ANTHROPIC;
}
