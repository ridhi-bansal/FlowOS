import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { executeCoachTool } from "@/lib/ai/coach/tools";

// In-memory L1 idempotency cache (keyed by userId:idempotencyKey)
interface CachedActionResult {
  timestamp: number;
  payloadHash: string;
  data: unknown;
  receipt: any;
}
const actionIdempotencyCache = new Map<string, CachedActionResult>();

function cleanOldCacheEntries() {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;
  for (const [key, val] of actionIdempotencyCache.entries()) {
    if (now - val.timestamp > TEN_MINUTES) {
      actionIdempotencyCache.delete(key);
    }
  }
}

function computePayloadHash(toolName: string, payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(`${toolName}:${JSON.stringify(payload ?? {})}`)
    .digest("hex");
}

/**
 * POST /api/coach/action
 * Executes confirmed coach actions with authentication, tenant isolation, and durable idempotency protection.
 */
export async function POST(request: NextRequest) {
  cleanOldCacheEntries();

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Malformed JSON body." },
      { status: 400 }
    );
  }

  const toolName: string = body.tool;
  const payload: Record<string, any> = body.payload;
  const idempotencyKey: string | undefined = body.idempotency_key;

  if (!toolName || typeof toolName !== "string" || !payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "invalid_request", message: "Missing or invalid tool name or payload." },
      { status: 400 }
    );
  }

  // Payload-specific validation
  if (toolName === "create_subtasks") {
    if (!payload.parent_task_id || typeof payload.parent_task_id !== "string") {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid parent_task_id." },
        { status: 400 }
      );
    }

    if (!Array.isArray(payload.subtasks) || payload.subtasks.length === 0) {
      return NextResponse.json(
        { error: "invalid_request", message: "Subtasks must be a non-empty array." },
        { status: 400 }
      );
    }

    if (payload.subtasks.length > 10) {
      return NextResponse.json(
        { error: "invalid_request", message: "Cannot create more than 10 subtasks at once." },
        { status: 400 }
      );
    }

    for (let i = 0; i < payload.subtasks.length; i++) {
      const st = payload.subtasks[i];
      if (!st || typeof st !== "object" || !st.name || typeof st.name !== "string" || !st.name.trim()) {
        return NextResponse.json(
          { error: "invalid_request", message: `Subtask at index ${i} has an invalid or empty name.` },
          { status: 400 }
        );
      }
      if (st.name.trim().length > 150) {
        return NextResponse.json(
          { error: "invalid_request", message: `Subtask at index ${i} exceeds maximum name length of 150 characters.` },
          { status: 400 }
        );
      }
    }
  } else if (toolName === "apply_day_plan") {
    if (!payload.plan || typeof payload.plan !== "object") {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid plan object." },
        { status: 400 }
      );
    }

    if (!Array.isArray(payload.plan.blocks) || payload.plan.blocks.length === 0) {
      return NextResponse.json(
        { error: "invalid_request", message: "Plan blocks must be a non-empty array." },
        { status: 400 }
      );
    }

    for (let i = 0; i < payload.plan.blocks.length; i++) {
      const b = payload.plan.blocks[i];
      if (!b || typeof b !== "object" || !b.task_id || !b.task_name || !b.start_at || !b.end_at) {
        return NextResponse.json(
          { error: "invalid_request", message: `Plan block at index ${i} is missing required fields.` },
          { status: 400 }
        );
      }
    }
  } else if (toolName === "apply_adaptation") {
    if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid adaptation title." },
        { status: 400 }
      );
    }
    if (!payload.content || typeof payload.content !== "string" || !payload.content.trim()) {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid adaptation content." },
        { status: 400 }
      );
    }
  } else if (toolName === "start_task") {
    if (!payload.task_id || typeof payload.task_id !== "string") {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid task_id." },
        { status: 400 }
      );
    }
  } else if (toolName === "apply_remaining_day_plan") {
    if (!payload.plan || typeof payload.plan !== "object") {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing or invalid plan object." },
        { status: 400 }
      );
    }
    if (!Array.isArray(payload.plan.blocks)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Plan blocks must be an array." },
        { status: 400 }
      );
    }
  }

  const currentPayloadHash = computePayloadHash(toolName, payload);
  const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;

  // 1. Check durable database-backed receipts first if idempotency_key is provided
  if (idempotencyKey) {
    try {
      const { data: existingReceipt, error: receiptError } = await supabase
        .from("coach_action_receipts")
        .select("action_name, payload_hash, receipt")
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (!receiptError && existingReceipt) {
        if (existingReceipt.payload_hash !== currentPayloadHash) {
          return NextResponse.json(
            {
              error: "conflict",
              message: "Idempotency key reused with different payload.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({
          success: true,
          data: existingReceipt.receipt,
          receipt: existingReceipt.receipt,
          replayed: true,
        });
      }
    } catch {
      // If table is not deployed yet, proceed to L1 memory cache
    }

    // 2. Check L1 in-memory cache
    if (cacheKey) {
      const cached = actionIdempotencyCache.get(cacheKey);
      if (cached) {
        if (cached.payloadHash !== currentPayloadHash) {
          return NextResponse.json(
            {
              error: "conflict",
              message: "Idempotency key reused with different payload.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({
          success: true,
          data: cached.data,
          receipt: cached.receipt,
          replayed: true,
        });
      }
    }
  }

  // 3. Execute the confirmed action
  const result = await executeCoachTool(toolName, payload, user.id, supabase);

  if (!result.success) {
    return NextResponse.json(
      { error: "action_failed", message: result.error || "Failed to execute action." },
      { status: 400 }
    );
  }

  const actionReceipt = result.receipt || result.data || {};

  // 4. Persist durable receipt in database
  if (idempotencyKey) {
    try {
      const { error: insertErr } = await supabase.from("coach_action_receipts").insert({
        user_id: user.id,
        idempotency_key: idempotencyKey,
        action_name: toolName,
        payload_hash: currentPayloadHash,
        receipt: actionReceipt,
      });

      if (insertErr && insertErr.code === "23505") {
        // Unique violation: a concurrent execution won the race
        const { data: raceWinner } = await supabase
          .from("coach_action_receipts")
          .select("payload_hash, receipt")
          .eq("user_id", user.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (raceWinner) {
          if (raceWinner.payload_hash !== currentPayloadHash) {
            return NextResponse.json(
              {
                error: "conflict",
                message: "Idempotency key reused with different payload.",
              },
              { status: 409 }
            );
          }
          return NextResponse.json({
            success: true,
            data: raceWinner.receipt,
            receipt: raceWinner.receipt,
            replayed: true,
          });
        }
      }
    } catch {
      // Graceful fallback if table is not deployed yet
    }

    // Update L1 cache
    if (cacheKey) {
      actionIdempotencyCache.set(cacheKey, {
        timestamp: Date.now(),
        payloadHash: currentPayloadHash,
        data: result.data,
        receipt: actionReceipt,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    receipt: actionReceipt,
  });
}
