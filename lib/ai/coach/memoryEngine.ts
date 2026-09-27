import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachMemory, MemoryCategory, MemoryConfidence } from "@/types";

export interface CoachMemoryCandidate {
  category: MemoryCategory;
  content: string;
  confidence: MemoryConfidence;
  source: "explicit_statement" | "pattern_observation" | "reflection";
}

/**
 * Normalizes content for fuzzy deduplication comparison.
 */
function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether two memory texts are essentially referring to the same preference or commitment.
 */
function areMemoriesSimilar(a: string, b: string): boolean {
  const normA = normalizeContent(a);
  const normB = normalizeContent(b);
  if (normA === normB) return true;

  const wordsA = new Set(normA.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(normB.split(" ").filter((w) => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const similarity = (2 * common) / (wordsA.size + wordsB.size);
  return similarity >= 0.7;
}

/**
 * Patterns that indicate temporary status, moods, or one-off task commands
 * that MUST NOT become durable long-term memories.
 */
const TEMPORARY_OR_EPHEMERAL_PATTERNS = [
  /^(i'm|i am|feeling)\s+(tired|exhausted|sleepy|busy|stressed|overwhelmed|sick|unfocused|lazy|hungry|excited|happy|sad)\b/i,
  /^(today|right now|currently|this morning|this afternoon|tonight)\s+(i am|i feel|it's|is)\b/i,
  /\b(just finished|just woke up|having lunch|taking a break|heading out)\b/i,
  /^(create|add|schedule|move|update|delete|complete|mark)\s+(a\s+)?(task|event|block|meeting)\b/i,
  /^(what should i|can you|help me|tell me|explain|why|how do i)\b/i,
  /^(yes|no|ok|okay|sure|thanks|thank you|got it|sounds good|cool)\b/i,
];

/**
 * High-confidence explicit durable statement extractors.
 */
const EXPLICIT_MEMORY_RULES: Array<{
  category: MemoryCategory;
  pattern: RegExp;
  extract: (match: RegExpMatchArray, text: string) => string;
}> = [
  // Recurring commitments (e.g. "Every Friday I have a product review meeting")
  {
    category: "recurring_commitment",
    pattern: /\b(every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend|morning|afternoon|evening|week|month)\b([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
  // Weekly planning or reviews (e.g. "My weekly planning session is every Sunday evening")
  {
    category: "recurring_commitment",
    pattern: /\b(weekly review|weekly planning|retro|sprint review|team sync|standup)\s+(is\s+)?(every|each|on)\b([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
  // Deep work & timing preferences (e.g. "I prefer doing deep work in the morning", "I work best early in the morning")
  {
    category: "preference",
    pattern: /\bi\s+(prefer|like to|always try to|usually try to)\s+(doing|do|schedule|keep|block)\s+([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
  {
    category: "working_style",
    pattern: /\bi\s+(work best|am most productive|focus best|have the most energy)\s+([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
  // Constraints (e.g. "I don't want meetings scheduled during my morning focus block", "Never schedule meetings after 5 PM")
  {
    category: "constraint",
    pattern: /\b(i don't want|i avoid|never schedule|do not schedule|no meetings|keep .* light)\b([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
  // Stable responsibilities / context (e.g. "I lead the mobile team", "I am responsible for client onboarding")
  {
    category: "responsibility",
    pattern: /\bi\s+(am responsible for|lead|manage|head up|own the)\s+([^.!?\n]+)/i,
    extract: (m) => m[0].trim(),
  },
];

/**
 * Deterministically extracts candidate durable memories from an incoming user statement.
 * Strictly ignores temporary moods, transient states, and simple action commands.
 */
export function extractDurableMemories(userText: string): CoachMemoryCandidate[] {
  const trimmed = userText.trim();
  if (trimmed.length < 12 || trimmed.length > 300) return [];

  // Reject temporary statements immediately
  for (const pat of TEMPORARY_OR_EPHEMERAL_PATTERNS) {
    if (pat.test(trimmed)) return [];
  }

  const candidates: CoachMemoryCandidate[] = [];

  for (const rule of EXPLICIT_MEMORY_RULES) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      let content = rule.extract(match, trimmed);
      // Clean leading/trailing punctuation
      content = content.replace(/^[,;:\s]+|[,;:\s]+$/g, "");
      if (content.length >= 10 && content.length <= 160) {
        // Capitalize first letter
        content = content.charAt(0).toUpperCase() + content.slice(1);
        candidates.push({
          category: rule.category,
          content,
          confidence: "high",
          source: "explicit_statement",
        });
      }
    }
  }

  // Deduplicate within the same extracted set
  const uniqueCandidates: CoachMemoryCandidate[] = [];
  for (const c of candidates) {
    if (!uniqueCandidates.some((u) => u.category === c.category && areMemoriesSimilar(u.content, c.content))) {
      uniqueCandidates.push(c);
    }
  }

  return uniqueCandidates.slice(0, 2);
}

/**
 * Persists durable memories for a user, avoiding duplicates through similarity checking.
 * If a matching memory exists, updates its `last_used_at` timestamp rather than creating a duplicate.
 */
export async function persistMemories(
  supabase: SupabaseClient,
  userId: string,
  candidates: CoachMemoryCandidate[],
  sourceMessageId?: string
): Promise<CoachMemory[]> {
  if (candidates.length === 0) return [];

  // 1. Fetch active existing memories for user
  const { data: existingData } = await supabase
    .from("coach_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  const existingMemories = (existingData as CoachMemory[]) || [];
  const saved: CoachMemory[] = [];
  const nowIso = new Date().toISOString();

  for (const cand of candidates) {
    const duplicate = existingMemories.find(
      (m) => m.category === cand.category && areMemoriesSimilar(m.content, cand.content)
    );

    if (duplicate) {
      // Touch duplicate to refresh recency
      await supabase
        .from("coach_memories")
        .update({ last_used_at: nowIso, updated_at: nowIso })
        .eq("id", duplicate.id)
        .eq("user_id", userId);

      saved.push({ ...duplicate, last_used_at: nowIso });
    } else {
      // Insert new high/medium confidence memory
      const { data, error } = await supabase
        .from("coach_memories")
        .insert({
          user_id: userId,
          category: cand.category,
          content: cand.content,
          source: cand.source,
          source_message_id: sourceMessageId || null,
          confidence: cand.confidence,
          status: "active",
          created_at: nowIso,
          updated_at: nowIso,
          last_used_at: nowIso,
        })
        .select("*")
        .single();

      if (!error && data) {
        saved.push(data as CoachMemory);
      }
    }
  }

  return saved;
}

/**
 * Retrieves curated, relevant active long-term memories for the user's current context.
 * Prioritizes high confidence, recency, and relevance.
 */
export async function getRelevantMemories(
  supabase: SupabaseClient,
  userId: string,
  queryText?: string,
  limit: number = 6
): Promise<CoachMemory[]> {
  const { data, error } = await supabase
    .from("coach_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("last_used_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  const allMemories = data as CoachMemory[];
  if (allMemories.length <= limit) return allMemories;

  // If queryText is provided, score memories by token overlap
  if (queryText && queryText.trim()) {
    const queryTokens = new Set(
      queryText
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const scored = allMemories.map((m) => {
      let score = m.confidence === "high" ? 3 : 1;
      const memTokens = m.content.toLowerCase().split(/\s+/);
      for (const t of memTokens) {
        if (queryTokens.has(t)) score += 5;
      }
      return { memory: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.memory);
  }

  return allMemories.slice(0, limit);
}

/**
 * Updates last_used_at for memories referenced during a conversation turn.
 */
export async function touchMemories(
  supabase: SupabaseClient,
  userId: string,
  memoryIds: string[]
): Promise<void> {
  if (memoryIds.length === 0) return;
  const nowIso = new Date().toISOString();
  await supabase
    .from("coach_memories")
    .update({ last_used_at: nowIso })
    .in("id", memoryIds)
    .eq("user_id", userId);
}
