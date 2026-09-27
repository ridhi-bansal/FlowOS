import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildUserOperatingContext } from "@/lib/ai/coach/contextEngine";
import { buildCoachSystemPrompt } from "@/lib/ai/coach/prompts";
import { COACH_TOOLS, executeCoachTool } from "@/lib/ai/coach/tools";
import { extractDurableMemories, persistMemories, touchMemories } from "@/lib/ai/coach/memoryEngine";
import { streamTurn } from "@/lib/ai/providers/anthropic/client";
import type { CoachMode } from "@/types";

/**
 * GET /api/coach/chat
 * Loads the active conversation and recent messages for the authenticated user.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Find latest conversation for user
  const { data: conv } = await supabase
    .from("coach_conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Evaluate fresh proactive triggers, reflection, review, and execution state for current user state
  let triggers: any[] = [];
  let reflection: any = null;
  let review: any = null;
  let executionState: any = null;
  let dailyState: any = null;
  let dayPlan: any = null;
  try {
    const context = await buildUserOperatingContext(supabase, user.id);
    triggers = context.active_triggers || [];
    reflection = context.reflection || null;
    review = context.review_summary || null;
    executionState = context.execution_state || null;
    dailyState = context.daily_state || null;
    dayPlan = context.day_plan || null;
  } catch {
    // Evaluation is non-blocking
  }

  if (!conv) {
    return NextResponse.json({
      conversation: null,
      messages: [],
      triggers,
      reflection,
      review,
      execution_state: executionState,
      daily_state: dailyState,
      day_plan: dayPlan,
    });
  }

  const { data: messages } = await supabase
    .from("coach_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(30);

  return NextResponse.json({
    conversation: conv,
    messages: messages || [],
    triggers,
    reflection,
    review,
    execution_state: executionState,
    daily_state: dailyState,
    day_plan: dayPlan,
  });
}

/**
 * POST /api/coach/chat
 * Genuine incremental streaming endpoint via Server-Sent Events (SSE).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const userMessage: string = body.message?.trim();
  let conversationId: string | undefined = body.conversationId;
  const mode: CoachMode = body.mode || "coach";

  if (!userMessage) {
    return NextResponse.json(
      { error: "invalid_request", message: "Message content cannot be empty." },
      { status: 400 }
    );
  }

  // 1. Resolve or create active conversation
  if (conversationId) {
    const { data: existing } = await supabase
      .from("coach_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) conversationId = undefined;
  }

  if (!conversationId) {
    const { data: latest } = await supabase
      .from("coach_conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      conversationId = latest.id;
    } else {
      const { data: newConv } = await supabase
        .from("coach_conversations")
        .insert({
          user_id: user.id,
          mode,
          title: userMessage.slice(0, 40),
        })
        .select("id")
        .single();

      conversationId = newConv?.id;
    }
  }

  if (!conversationId) {
    return NextResponse.json(
      { error: "database_error", message: "Could not initialize coach conversation." },
      { status: 500 }
    );
  }

  // 2. Persist incoming user message
  const { data: savedMsg } = await supabase
    .from("coach_messages")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: userMessage,
    })
    .select("id")
    .single();

  // 3. Extract and persist any explicit durable long-term memories
  const memoryCandidates = extractDurableMemories(userMessage);
  if (memoryCandidates.length > 0) {
    await persistMemories(supabase, user.id, memoryCandidates, savedMsg?.id);
  }

  // 4. Load recent conversation history (last 10 messages)
  const { data: historyData } = await supabase
    .from("coach_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(10);

  const modelMessages = (historyData || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 5. Assemble UserOperatingContext (with current-window planning and relevant memories)
  const context = await buildUserOperatingContext(supabase, user.id, new Date(), userMessage);
  const systemPrompt = buildCoachSystemPrompt(context, mode);

  // Touch relevant memories to maintain recency
  if (context.memory.relevant.length > 0) {
    touchMemories(
      supabase,
      user.id,
      context.memory.relevant.map((m) => m.id)
    ).catch(() => {});
  }

  const activeConvId = conversationId;
  const currentUserId = user.id;

  // 5. Create SSE ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function sendEvent(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        // Local / Demo mode fallback with incremental text emission
        const fallbackText =
          `[Demo Mode] I can see your schedule for today: you have ${context.schedule.total_free_minutes} minutes ` +
          `of open discretionary time and ${context.execution.today_tasks.length} tasks scheduled.\n\n` +
          `To activate real conversational intelligence and tool execution, add ANTHROPIC_API_KEY to your environment (.env.local).`;

        sendEvent("text", { text: fallbackText });

        await supabase.from("coach_messages").insert({
          conversation_id: activeConvId,
          user_id: currentUserId,
          role: "assistant",
          content: fallbackText,
        });

        sendEvent("done", { conversationId: activeConvId });
        controller.close();
        return;
      }

      try {
        let accumulatedAssistantText = "";

        // First streaming turn (may invoke tools or stream text)
        const turnResult = await streamTurn({
          system: systemPrompt,
          messages: modelMessages,
          tools: COACH_TOOLS,
          maxTokens: 1500,
          onTextDelta(delta) {
            accumulatedAssistantText += delta;
            sendEvent("text", { text: delta });
          },
        });

        // Handle tool calls if returned by model
        if (turnResult.toolCalls && turnResult.toolCalls.length > 0) {
          const toolResultsForNextTurn: any[] = [];

          for (const call of turnResult.toolCalls) {
            const exec = await executeCoachTool(call.name, call.input, currentUserId, supabase);
            if (exec.receipt) {
              sendEvent("action", exec.receipt);
            }
            toolResultsForNextTurn.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(exec.success ? exec.data : { error: exec.error }),
            });
          }

          // Follow-up streaming turn to explain results if needed
          const followUpMessages: any[] = [
            ...modelMessages,
            {
              role: "assistant",
              content: [
                ...(turnResult.text ? [{ type: "text", text: turnResult.text }] : []),
                ...turnResult.toolCalls.map((tc) => ({
                  type: "tool_use",
                  id: tc.id,
                  name: tc.name,
                  input: tc.input,
                })),
              ],
            },
            {
              role: "user",
              content: toolResultsForNextTurn,
            },
          ];

          await streamTurn({
            system: systemPrompt,
            messages: followUpMessages,
            maxTokens: 1000,
            onTextDelta(delta) {
              accumulatedAssistantText += delta;
              sendEvent("text", { text: delta });
            },
          });
        }

        const finalSavedText = accumulatedAssistantText.trim() || "Action completed.";

        // Persist complete assistant message to Supabase
        await supabase.from("coach_messages").insert({
          conversation_id: activeConvId,
          user_id: currentUserId,
          role: "assistant",
          content: finalSavedText,
        });

        sendEvent("done", { conversationId: activeConvId });
        controller.close();
      } catch (err: any) {
        const isUnavailable =
          err?.status === 401 || err?.status === 429 || (err?.status && err.status >= 500) || err?.code === "ENOTFOUND";
        const message = isUnavailable
          ? "Coach AI is temporarily unavailable. Your tasks and schedule are still available."
          : (err?.message || "Coach AI is temporarily unavailable. Your tasks and schedule are still available.");
        sendEvent("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
