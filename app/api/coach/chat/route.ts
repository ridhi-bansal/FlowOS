import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildUserOperatingContext } from "@/lib/ai/coach/contextEngine";
import { buildCoachSystemPrompt } from "@/lib/ai/coach/prompts";
import { COACH_TOOLS, executeCoachTool } from "@/lib/ai/coach/tools";
import { extractDurableMemories, persistMemories, touchMemories } from "@/lib/ai/coach/memoryEngine";
import { streamTurn, isAiMocked } from "@/lib/ai";
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

      if (isAiMocked()) {
        // Local / Demo mode fallback with incremental text emission
        const fallbackText =
          `[Demo Mode] I can see your schedule for today: you have ${context.schedule.total_free_minutes} minutes ` +
          `of open discretionary time and ${context.execution.today_tasks.length} tasks scheduled.\n\n` +
          `To activate real conversational intelligence and tool execution, configure AI_PROVIDER (gemini or anthropic) and add your API key to .env.local.`;

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

      const COACH_REQUEST_TIMEOUT_MS = 25_000;
      const requestDeadline = Date.now() + COACH_REQUEST_TIMEOUT_MS;
      const MAX_TOOL_TURNS = 5;
      const requestId = `coach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      function getToolProgressMessage(toolName: string): string {
        switch (toolName) {
          case "plan_day":
          case "replan_remaining_day":
            return "Planning your day schedule…";
          case "create_task":
          case "update_task":
          case "complete_task":
          case "break_down_task":
          case "create_subtasks":
            return "Checking your tasks…";
          case "create_native_time_block":
          case "apply_day_plan":
          case "apply_remaining_day_plan":
            return "Checking your schedule…";
          case "review_recent_period":
            return "Reviewing recent progress…";
          case "start_task":
            return "Preparing task execution…";
          case "apply_adaptation":
            return "Updating your planning preferences…";
          default:
            return "Checking your productivity context…";
        }
      }

      const TIMEOUT_FALLBACK_TEXT =
        "I couldn't finish the full analysis in time. Your Next Move is still available above.";

      try {
        let accumulatedAssistantText = "";
        let currentMessages: any[] = [...modelMessages];
        let turnCount = 0;
        let finished = false;

        while (turnCount < MAX_TOOL_TURNS && !finished) {
          const remainingBeforeTurn = requestDeadline - Date.now();
          if (remainingBeforeTurn <= 2000) {
            console.warn(
              `[Coach AI Deadline] req=${requestId} remaining=${remainingBeforeTurn}ms below threshold before turn ${turnCount + 1}`
            );
            break;
          }

          turnCount++;
          // Turn timeout is the smaller of remaining budget or 20s
          const turnTimeoutMs = Math.min(remainingBeforeTurn, 20_000);

          console.log(
            `[Coach AI Turn] req=${requestId} turn=${turnCount}/${MAX_TOOL_TURNS} msgs=${currentMessages.length} timeoutMs=${turnTimeoutMs}`
          );

          let turnResult: any;
          try {
            turnResult = await streamTurn({
              system: systemPrompt,
              messages: currentMessages,
              tools: COACH_TOOLS,
              maxTokens: 1500,
              timeoutMs: turnTimeoutMs,
              onTextDelta(delta) {
                accumulatedAssistantText += delta;
                sendEvent("text", { text: delta });
              },
            });
          } catch (turnErr: any) {
            // If turn failed due to timeout and total request budget is exhausted, handle gracefully
            if (
              (turnErr?.status === 504 || turnErr?.code === "ETIMEDOUT") &&
              requestDeadline - Date.now() <= 3000
            ) {
              console.warn(
                `[Coach AI Turn Timeout] req=${requestId} turn=${turnCount} hit deadline limit`
              );
              break;
            }
            throw turnErr;
          }

          const hasTools = Boolean(turnResult.toolCalls && turnResult.toolCalls.length > 0);
          const toolNames = hasTools ? turnResult.toolCalls.map((tc: any) => tc.name).join(",") : "none";
          const hasThoughtSignature = hasTools
            ? turnResult.toolCalls.some((tc: any) => Boolean(tc.thoughtSignature))
            : false;

          console.log(
            `[Coach AI Turn Result] req=${requestId} turn=${turnCount} tools=${toolNames} thoughtSignaturePresent=${hasThoughtSignature} textLen=${turnResult.text.length}`
          );

          if (!hasTools) {
            finished = true;
            break;
          }

          // Check budget before executing tools
          const remainingBeforeTools = requestDeadline - Date.now();
          if (remainingBeforeTools <= 2000) {
            console.warn(
              `[Coach AI Deadline] req=${requestId} remaining=${remainingBeforeTools}ms insufficient for tool execution`
            );
            break;
          }

          // Emit minimal truthful progress event for the tools being executed
          const primaryTool = turnResult.toolCalls[0]?.name;
          if (primaryTool) {
            sendEvent("progress", { message: getToolProgressMessage(primaryTool) });
          }

          // Execute each tool call exactly once
          const toolResultsForNextTurn: any[] = [];
          for (const call of turnResult.toolCalls) {
            const exec = await executeCoachTool(call.name, call.input, currentUserId, supabase);
            if (exec.receipt) {
              sendEvent("action", exec.receipt);
            }
            toolResultsForNextTurn.push({
              type: "tool_result",
              tool_use_id: call.id,
              name: call.name,
              content: JSON.stringify(exec.success ? exec.data : { error: exec.error }),
            });
          }

          // Check budget after tool execution before committing to another Gemini turn
          const remainingAfterTools = requestDeadline - Date.now();
          if (remainingAfterTools <= 2500) {
            console.warn(
              `[Coach AI Deadline] req=${requestId} remaining=${remainingAfterTools}ms insufficient for next model turn`
            );
            break;
          }

          // Append assistant turn (preserving thoughtSignature) and user tool-results turn
          currentMessages = [
            ...currentMessages,
            {
              role: "assistant",
              content: [
                ...(turnResult.text ? [{ type: "text", text: turnResult.text }] : []),
                ...turnResult.toolCalls.map((tc: any) => ({
                  type: "tool_use",
                  id: tc.id,
                  name: tc.name,
                  input: tc.input,
                  ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
                })),
              ],
            },
            {
              role: "user",
              content: toolResultsForNextTurn,
            },
          ];
        }

        if (!finished && !accumulatedAssistantText.trim()) {
          const remainingAtEnd = requestDeadline - Date.now();
          if (remainingAtEnd <= 3000) {
            // Request budget was exhausted before text completion
            accumulatedAssistantText = TIMEOUT_FALLBACK_TEXT;
            sendEvent("text", { text: TIMEOUT_FALLBACK_TEXT });
          } else if (turnCount >= MAX_TOOL_TURNS) {
            console.warn(
              `[Coach AI Turn Limit] req=${requestId} reached MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) without natural text completion`
            );
            const limitNotice = "I have completed processing your request with your current schedule and tasks.";
            accumulatedAssistantText = limitNotice;
            sendEvent("text", { text: limitNotice });
          }
        }

        const finalSavedText = accumulatedAssistantText.trim() || TIMEOUT_FALLBACK_TEXT;

        // Persist complete assistant message to Supabase
        await supabase.from("coach_messages").insert({
          conversation_id: activeConvId,
          user_id: currentUserId,
          role: "assistant",
          content: finalSavedText,
        });

        console.log(`[Coach AI Complete] req=${requestId} turns=${turnCount} savedTextLen=${finalSavedText.length}`);

        sendEvent("done", { conversationId: activeConvId });
        controller.close();
      } catch (err: any) {
        console.error(
          `[Coach AI Error] req=${requestId} status=${err?.status || err?.code || "unknown"} msg=${err?.message}`
        );
        const isTimeout =
          err?.status === 504 ||
          err?.code === "ETIMEDOUT" ||
          requestDeadline - Date.now() <= 1000;

        let message: string;
        if (isTimeout) {
          message = TIMEOUT_FALLBACK_TEXT;
        } else {
          const isUnavailable =
            err?.status === 400 ||
            err?.status === 401 ||
            err?.status === 403 ||
            err?.status === 404 ||
            err?.status === 429 ||
            (err?.status && err.status >= 500) ||
            err?.code === "ENOTFOUND" ||
            Boolean(err?.message?.includes("API_KEY"));
          message = isUnavailable
            ? "Coach AI is temporarily unavailable. Your tasks and schedule are still available."
            : (err?.message || "Coach AI is temporarily unavailable. Your tasks and schedule are still available.");
        }
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
