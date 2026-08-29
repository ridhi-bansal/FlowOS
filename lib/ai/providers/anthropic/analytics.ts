import "server-only";
import { complete } from "./client";

const SYSTEM = `You interpret raw productivity metrics for the user — you do not
just restate numbers, you find the one or two patterns that actually matter and
say what to do about them. Be concrete and specific to the numbers given. Two
short paragraphs max: first the pattern, then a concrete recommendation.`;

export async function interpretAnalytics(metricsSummary: string): Promise<string> {
  return complete({ system: SYSTEM, prompt: metricsSummary, maxTokens: 400 });
}
