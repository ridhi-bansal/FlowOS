import "server-only";

/**
 * Gemini AI Provider Client
 * Communicates with Google's Gemini API via native fetch (REST and SSE streaming).
 * Zero extra npm dependencies.
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
}

export interface ModelTurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  rawContentBlocks?: any[];
}

/**
 * Resolves the Gemini model name to use.
 * Defaults to 'gemini-3.8-flash'. Ignores non-Gemini AI_MODEL values like 'claude-*'.
 */
export function getGeminiModel(): string {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (process.env.AI_MODEL && !process.env.AI_MODEL.startsWith("claude-")) {
    return process.env.AI_MODEL;
  }
  return "gemini-3.8-flash";
}

/**
 * Recursively normalizes JSON schema types to uppercase for Gemini's OpenAPI validator.
 * Throws safely if an ARRAY schema is missing the mandatory 'items' definition.
 */
export function formatSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(formatSchemaForGemini);

  const copy: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      copy[key] = value.toUpperCase();
    } else if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, any> = {};
      for (const [propName, propVal] of Object.entries(value)) {
        props[propName] = formatSchemaForGemini(propVal);
      }
      copy[key] = props;
    } else if (key === "items" && typeof value === "object" && value !== null) {
      copy[key] = formatSchemaForGemini(value);
    } else {
      copy[key] = value;
    }
  }

  if (copy.type === "ARRAY" && !copy.items) {
    throw new Error(
      "Invalid schema: ARRAY type must have an 'items' definition in Gemini OpenAPI specifications."
    );
  }

  return copy;
}

/**
 * Converts generic Tool definitions into Gemini functionDeclarations format.
 */
export function convertToolsToGemini(
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>
) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: formatSchemaForGemini(tool.input_schema),
      })),
    },
  ];
}

/**
 * Converts conversational messages into Gemini's contents array format.
 * Guarantees that:
 * - The first turn has role: "user"
 * - Roles strictly alternate between "user" and "model"
 * - The final turn has role: "user" when requesting model response
 * - Semantic conversation content and tool calls/responses are preserved
 */
export function convertMessagesToGemini(
  messages: Array<{ role: "user" | "assistant"; content: any }>
): any[] {
  const parsedTurns: Array<{ role: "user" | "model"; parts: any[] }> = [];

  for (const msg of messages) {
    const geminiRole: "user" | "model" = msg.role === "assistant" ? "model" : "user";

    if (typeof msg.content === "string") {
      if (msg.content.trim().length > 0) {
        parsedTurns.push({
          role: geminiRole,
          parts: [{ text: msg.content }],
        });
      }
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts: any[] = [];
      for (const item of msg.content) {
        if (typeof item === "string") {
          if (item.trim().length > 0) parts.push({ text: item });
        } else if (item.type === "text" && item.text) {
          parts.push({ text: item.text });
        } else if (item.type === "tool_use") {
          parts.push({
            functionCall: {
              id: item.id,
              name: item.name,
              args: item.input || {},
            },
          });
        } else if (item.type === "tool_result") {
          let parsedResponse: any = {};
          try {
            parsedResponse =
              typeof item.content === "string" ? JSON.parse(item.content) : item.content;
          } catch {
            parsedResponse = { output: item.content };
          }
          parts.push({
            functionResponse: {
              id: item.tool_use_id,
              name: item.name || "tool_result",
              response: parsedResponse,
            },
          });
        } else if (item.functionCall) {
          parts.push({ functionCall: item.functionCall });
        } else if (item.functionResponse) {
          parts.push({ functionResponse: item.functionResponse });
        }
      }

      if (parts.length > 0) {
        parsedTurns.push({
          role: geminiRole,
          parts,
        });
      }
    }
  }

  // Merge consecutive turns with the same role to maintain strict alternation
  const alternating: Array<{ role: "user" | "model"; parts: any[] }> = [];
  for (const turn of parsedTurns) {
    if (alternating.length > 0 && alternating[alternating.length - 1].role === turn.role) {
      alternating[alternating.length - 1].parts.push(...turn.parts);
    } else {
      alternating.push({ role: turn.role, parts: [...turn.parts] });
    }
  }

  // If conversation is completely empty, provide an initial user turn
  if (alternating.length === 0) {
    alternating.push({ role: "user", parts: [{ text: "Hello" }] });
  }

  // Ensure first content has role "user" without destroying model turns
  if (alternating[0].role !== "user") {
    alternating.unshift({ role: "user", parts: [{ text: "Hello" }] });
  }

  // Ensure final content has role "user" when requesting model response
  if (alternating[alternating.length - 1].role === "model") {
    alternating.push({ role: "user", parts: [{ text: "Please continue." }] });
  }

  return alternating;
}

/**
 * Executes a Gemini HTTP request with at most 2 total attempts for transient capacity errors (503 / 429).
 * Google Generative Language API occasionally returns 503 (UNAVAILABLE / model overloaded)
 * or 429 (RESOURCE_EXHAUSTED) during momentary capacity spikes.
 * Client errors (400, 401, 403, 404, schema, auth) are never retried.
 * Retrying happens strictly before any response stream or body is consumed.
 */
export async function fetchWithTransientRetry(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch = fetch,
  delayMs: number = 1000
): Promise<Response> {
  const res = await fetchFn(url, init);
  if (res.status === 503 || res.status === 429) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return fetchFn(url, init);
  }
  return res;
}

/**
 * Executes a single-turn completion with Gemini.
 */
export async function complete({
  system,
  prompt,
  json,
  maxTokens = 1024,
}: CompleteOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const bodyPayload: Record<string, any> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt || "" }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: {
        thinkingLevel: "low",
      },
    },
  };

  if (system) {
    bodyPayload.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  if (json) {
    bodyPayload.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetchWithTransientRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const error: any = new Error(`AI provider error (${res.status}): ${errText}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((p: any) => p.text || "")
    .filter(Boolean)
    .join("\n");

  return text.trim();
}

/**
 * Executes a multi-turn turn with Gemini, returning text and function calls.
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const bodyPayload: Record<string, any> = {
    contents: convertMessagesToGemini(messages),
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: {
        thinkingLevel: "low",
      },
    },
  };

  if (system) {
    bodyPayload.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  const geminiTools = convertToolsToGemini(tools);
  if (geminiTools) {
    bodyPayload.tools = geminiTools;
  }

  const res = await fetchWithTransientRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const error: any = new Error(`AI provider error (${res.status}): ${errText}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const part of parts) {
    if (part.text) {
      text += (text ? "\n" : "") + part.text;
    } else if (part.functionCall) {
      toolCalls.push({
        id: part.functionCall.id || `call_${toolCalls.length + 1}_${part.functionCall.name}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    }
  }

  return {
    text: text.trim(),
    toolCalls,
    stopReason: candidate?.finishReason?.toLowerCase() || "stop",
    rawContentBlocks: parts,
  };
}

/**
 * Executes a streaming conversational turn with Gemini via SSE.
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (see .env.example) to enable AI features."
    );
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const bodyPayload: Record<string, any> = {
    contents: convertMessagesToGemini(messages),
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: {
        thinkingLevel: "low",
      },
    },
  };

  if (system) {
    bodyPayload.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  const geminiTools = convertToolsToGemini(tools);
  if (geminiTools) {
    bodyPayload.tools = geminiTools;
  }

  const res = await fetchWithTransientRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    const error: any = new Error(`AI provider error (${res.status}): ${errText}`);
    error.status = res.status;
    throw error;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let fullText = "";
  const toolCalls: ToolCall[] = [];
  let stopReason = "stop";

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

      const candidate = eventData.candidates?.[0];
      if (candidate?.finishReason) {
        stopReason = candidate.finishReason;
      }

      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          fullText += part.text;
          if (onTextDelta) {
            onTextDelta(part.text);
          }
        }
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id || `call_${toolCalls.length + 1}_${part.functionCall.name}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          });
        }
      }
    }
  }

  return {
    text: fullText.trim(),
    toolCalls,
    stopReason: stopReason.toLowerCase(),
  };
}

/**
 * Parses a model response that was asked to return JSON, stripping stray fences defensively.
 */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  return JSON.parse(cleaned) as T;
}
