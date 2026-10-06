import "server-only";

/**
 * Single choke point for talking to the AI provider.
 * The API key is read from process.env — never pass it to, or reference
 * it from, any Client Component.
 */

export interface CompleteOptions {
  system?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant"; content: any }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  json?: boolean;
  maxTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  thoughtSignature?: string;
}

export interface ModelTurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  rawContentBlocks?: any[];
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
      messages: [{ role: "user", content: prompt || "" }],
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

/**
 * Executes a conversational turn with multi-turn messages and tool definitions.
 */
export async function completeTurn({
  system,
  messages,
  tools,
  maxTokens = 1500,
}: {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  maxTokens?: number;
}): Promise<ModelTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const bodyPayload: Record<string, any> = {
    model: process.env.AI_MODEL || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages,
  };

  if (tools && tools.length > 0) {
    bodyPayload.tools = tools;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI provider error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const contentBlocks = data.content ?? [];

  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of contentBlocks) {
    if (block.type === "text") {
      text += (text ? "\n" : "") + block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input || {},
      });
    }
  }

  return {
    text: text.trim(),
    toolCalls,
    stopReason: data.stop_reason || "end_turn",
    rawContentBlocks: contentBlocks,
  };
}

/**
 * Executes a streaming conversational turn with incremental text delivery via SSE.
 * Connects directly to Anthropic's streaming API (stream: true).
 */
export async function streamTurn({
  system,
  messages,
  tools,
  maxTokens = 1500,
  onTextDelta,
}: {
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const bodyPayload: Record<string, any> = {
    model: process.env.AI_MODEL || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    bodyPayload.tools = tools;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status}): ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let fullText = "";
  const toolCalls: ToolCall[] = [];
  const currentToolsByIndex = new Map<number, { id: string; name: string; rawJson: string }>();
  let stopReason = "end_turn";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") continue;

      let eventData: any;
      try {
        eventData = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (eventData.type === "content_block_start") {
        if (eventData.content_block?.type === "tool_use") {
          currentToolsByIndex.set(eventData.index, {
            id: eventData.content_block.id,
            name: eventData.content_block.name,
            rawJson: "",
          });
        }
      } else if (eventData.type === "content_block_delta") {
        if (eventData.delta?.type === "text_delta" && eventData.delta.text) {
          fullText += eventData.delta.text;
          if (onTextDelta) {
            onTextDelta(eventData.delta.text);
          }
        } else if (eventData.delta?.type === "input_json_delta" && eventData.delta.partial_json) {
          const t = currentToolsByIndex.get(eventData.index);
          if (t) {
            t.rawJson += eventData.delta.partial_json;
          }
        }
      } else if (eventData.type === "message_delta") {
        if (eventData.delta?.stop_reason) {
          stopReason = eventData.delta.stop_reason;
        }
      }
    }
  }

  // Parse accumulated tool calls
  for (const [, tool] of currentToolsByIndex.entries()) {
    let parsedInput = {};
    try {
      if (tool.rawJson.trim()) {
        parsedInput = JSON.parse(tool.rawJson);
      }
    } catch {
      parsedInput = {};
    }
    toolCalls.push({
      id: tool.id,
      name: tool.name,
      input: parsedInput,
    });
  }

  return {
    text: fullText.trim(),
    toolCalls,
    stopReason,
  };
}

/** Parses a model response that was asked to return JSON, stripping stray fences defensively. */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  return JSON.parse(cleaned) as T;
}
