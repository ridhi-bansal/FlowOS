import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachActionReceipt, CompactTask } from "./types";
import { buildScheduleContext } from "./scheduleEngine";
import { buildDayPlan } from "./planningEngine";

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const COACH_TOOLS: AnthropicTool[] = [
  {
    name: "create_task",
    description: "Create a new task in FlowOS.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Title or name of the task" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        due_time: { type: "string", description: "Due time in HH:MM format" },
        estimated_minutes: { type: "integer", description: "Estimated completion time in minutes" },
        goal_id: { type: "string", description: "Optional UUID of related goal" },
        project_id: { type: "string", description: "Optional UUID of related project" },
        notes: { type: "string", description: "Notes or context for the task" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task in FlowOS (reschedule due date, change priority, or modify details).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task to update" },
        name: { type: "string", description: "New name" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
        due_time: { type: "string", description: "New due time (HH:MM)" },
        estimated_minutes: { type: "integer" },
        notes: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task to complete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "create_native_time_block",
    description: "Schedule a dedicated focus or time block in the native FlowOS calendar. Never affects Google Calendar.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the block (e.g. 'Deep Work: Write proposal')" },
        start_at: { type: "string", description: "ISO datetime with timezone offset" },
        end_at: { type: "string", description: "ISO datetime with timezone offset" },
        task_id: { type: "string", description: "Optional UUID of related task" },
        kind: { type: "string", enum: ["focus_block", "time_block"] },
      },
      required: ["title", "start_at", "end_at"],
    },
  },
  {
    name: "break_down_task",
    description: "Propose a structured breakdown of a larger task into 2 to 5 smaller actionable subtasks for user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        parent_task_id: { type: "string", description: "UUID of the task being broken down" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Subtask title" },
              estimated_minutes: { type: "integer", description: "Estimated duration in minutes" },
            },
            required: ["name"],
          },
          description: "List of actionable subtasks",
        },
      },
      required: ["parent_task_id", "subtasks"],
    },
  },
  {
    name: "create_subtasks",
    description: "Create multiple actionable subtasks linked to a parent task in FlowOS.",
    input_schema: {
      type: "object",
      properties: {
        parent_task_id: { type: "string", description: "UUID of the parent task" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Subtask title" },
              estimated_minutes: { type: "integer", description: "Estimated duration in minutes" },
            },
            required: ["name"],
          },
          description: "List of subtasks to insert",
        },
      },
      required: ["parent_task_id", "subtasks"],
    },
  },
  {
    name: "plan_day",
    description:
      "Generate a realistic, deterministic day plan mapping the user's highest-priority tasks into available calendar free windows. The plan is returned to the user for review and confirmation before any calendar blocks are created. Claude must NEVER invent start/end times.",
    input_schema: {
      type: "object",
      properties: {
        constraints: {
          type: "object",
          description: "Optional user-specified scheduling constraints",
          properties: {
            no_work_after: {
              type: "string",
              description: "Work cutoff time in HH:MM format (e.g. '17:00')",
            },
            break_at: {
              type: "string",
              description: "Break start time in HH:MM format (e.g. '13:00')",
            },
            break_duration_minutes: {
              type: "integer",
              description: "Break duration in minutes (e.g. 30)",
            },
            buffer_minutes_between_blocks: {
              type: "integer",
              description: "Buffer in minutes between scheduled blocks (default: 5)",
            },
            min_window_minutes: {
              type: "integer",
              description: "Minimum window length to place a block (default: 15)",
            },
          },
        },
      },
    },
  },
  {
    name: "apply_day_plan",
    description:
      "Apply a confirmed DayPlan by creating native FlowOS time blocks for each planned block in the plan. Checks for stale conditions (e.g. passed start times, completed tasks, newly created calendar conflicts) before creating.",
    input_schema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "The structured DayPlan object to apply",
          properties: {
            date: { type: "string", description: "Target date in YYYY-MM-DD" },
            generated_at: { type: "string", description: "ISO timestamp when plan was built" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  task_id: { type: "string" },
                  task_name: { type: "string" },
                  start_at: { type: "string" },
                  end_at: { type: "string" },
                  duration_minutes: { type: "integer" },
                  reason: { type: "string" },
                },
                required: ["task_id", "task_name", "start_at", "end_at"],
              },
            },
          },
          required: ["date", "blocks"],
        },
      },
      required: ["plan"],
    },
  },
  {
    name: "apply_adaptation",
    description:
      "Apply and persist a user-accepted planning or workflow adaptation into durable coach memory. Adapts future day planning (e.g. accounting for duration underestimation, protecting morning focus blocks) without mutating base task estimates.",
    input_schema: {
      type: "object",
      properties: {
        adaptation_id: { type: "string", description: "Deterministic signature ID of the adaptation candidate" },
        type: {
          type: "string",
          enum: [
            "duration_adjustment",
            "protect_time_window",
            "reduce_planning_load",
            "prefer_shorter_tasks",
            "break_down_repeatedly_postponed_task",
            "use_available_capacity",
          ],
          description: "Type of adaptation being adopted",
        },
        title: { type: "string", description: "Brief title of the adaptation" },
        content: { type: "string", description: "Durable memory content describing the learned rule" },
        category: {
          type: "string",
          enum: ["planning_pattern", "working_style", "preference", "constraint"],
          description: "Memory category for persistence",
        },
        multiplier: { type: "number", description: "Optional duration multiplier (e.g. 1.25)" },
      },
      required: ["type", "title", "content"],
    },
  },
  {
    name: "review_recent_period",
    description:
      "Generate a comprehensive, deterministic rolling review of the user's last 7 days of productivity, priority progress, planning realism, execution consistency, trends, and adaptation impact. Claude must NEVER invent review numbers, productivity scores, or trend directions.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["last_7_days"],
          description: "The time horizon to review (default: last_7_days)",
        },
      },
    },
  },
  {
    name: "start_task",
    description:
      "Begin actively executing a task. Verifies that the task exists, is owned by the user, is not already completed, and fits within the current free window. Does NOT mark the task completed.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The ID of the task to begin working on" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "replan_remaining_day",
    description:
      "Deterministically replan the remaining portion of today from the current time onward. Excludes completed tasks, respects the current native and read-only Google Calendar schedule, and returns a proposed remaining DayPlan requiring user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        constraints: {
          type: "object",
          description: "Optional user constraints for replanning",
          properties: {
            no_work_after: { type: "string" },
            break_at: { type: "string" },
            break_duration_minutes: { type: "integer" },
          },
        },
      },
    },
  },
  {
    name: "apply_remaining_day_plan",
    description:
      "Apply and confirm the replanned DayPlan for the rest of today. Atomically removes remaining future native time blocks for today and schedules the newly confirmed blocks. Never modifies Google Calendar.",
    input_schema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "The DayPlan object to apply for the remainder of today",
          properties: {
            date: { type: "string" },
            blocks: { type: "array" },
          },
          required: ["date", "blocks"],
        },
      },
      required: ["plan"],
    },
  },
];

export async function executeCoachTool(
  name: string,
  input: Record<string, any>,
  userId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; data?: unknown; error?: string; receipt?: CoachActionReceipt }> {
  try {
    switch (name) {
      case "create_task": {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            name: input.name.trim(),
            priority: input.priority || "medium",
            due_date: input.due_date || null,
            due_time: input.due_time || null,
            estimated_minutes: input.estimated_minutes || null,
            goal_id: input.goal_id || null,
            project_id: input.project_id || null,
            notes: input.notes || null,
            status: input.due_date ? "scheduled" : "inbox",
            done: false,
          })
          .select("id, name")
          .single();

        if (error || !data) {
          return { success: false, error: error?.message || "Failed to create task" };
        }

        return {
          success: true,
          data,
          receipt: {
            tool: "create_task",
            description: `Created task "${data.name}"`,
            entityId: data.id,
            status: "executed",
          },
        };
      }

      case "update_task": {
        // First retrieve existing task to verify ownership and detect changes
        const { data: existing } = await supabase
          .from("tasks")
          .select("id, name, due_date, priority")
          .eq("id", input.task_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!existing) {
          return { success: false, error: "Task not found or unauthorized" };
        }

        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (input.name) patch.name = input.name.trim();
        if (input.priority) patch.priority = input.priority;
        if (input.due_date !== undefined) patch.due_date = input.due_date;
        if (input.due_time !== undefined) patch.due_time = input.due_time;
        if (input.estimated_minutes !== undefined) patch.estimated_minutes = input.estimated_minutes;
        if (input.notes !== undefined) patch.notes = input.notes;

        const { data, error } = await supabase
          .from("tasks")
          .update(patch)
          .eq("id", input.task_id)
          .eq("user_id", userId)
          .select("id, name")
          .single();

        if (error || !data) {
          return { success: false, error: error?.message || "Failed to update task" };
        }

        // Log task history event if due date changed
        if (input.due_date !== undefined && input.due_date !== existing.due_date) {
          try {
            const nowIso = new Date().toISOString();
            await supabase.from("task_events").insert({
              user_id: userId,
              task_id: input.task_id,
              event_type: "due_date_changed",
              old_value: existing.due_date,
              new_value: input.due_date,
              created_at: nowIso,
            });

            if (input.due_date && existing.due_date && input.due_date > existing.due_date) {
              await supabase.from("task_events").insert({
                user_id: userId,
                task_id: input.task_id,
                event_type: "postponed",
                old_value: existing.due_date,
                new_value: input.due_date,
                created_at: nowIso,
              });
            }
          } catch {
            // Task event logging is best-effort
          }
        }

        return {
          success: true,
          data,
          receipt: {
            tool: "update_task",
            description: `Updated task "${data.name}"`,
            entityId: data.id,
            status: "executed",
          },
        };
      }

      case "complete_task": {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from("tasks")
          .update({
            done: true,
            completed_at: nowIso,
            status: "completed",
            updated_at: nowIso,
          })
          .eq("id", input.task_id)
          .eq("user_id", userId)
          .select("id, name")
          .single();

        if (error || !data) {
          return { success: false, error: error?.message || "Failed to complete task" };
        }

        return {
          success: true,
          data,
          receipt: {
            tool: "complete_task",
            description: `Completed task "${data.name}"`,
            entityId: data.id,
            status: "executed",
          },
        };
      }

      case "create_native_time_block": {
        const { data, error } = await supabase
          .from("events")
          .insert({
            user_id: userId,
            title: input.title.trim(),
            start_at: input.start_at,
            end_at: input.end_at,
            task_id: input.task_id || null,
            kind: input.kind || "focus_block",
            location: null,
            notes: null,
          })
          .select("id, title")
          .single();

        if (error || !data) {
          return { success: false, error: error?.message || "Failed to schedule time block" };
        }

        return {
          success: true,
          data,
          receipt: {
            tool: "create_native_time_block",
            description: `Scheduled "${data.title}" in FlowOS Calendar`,
            entityId: data.id,
            status: "executed",
          },
        };
      }

      case "break_down_task": {
        // Find parent task name for clearer receipt
        const { data: parentTask } = await supabase
          .from("tasks")
          .select("id, name")
          .eq("id", input.parent_task_id)
          .eq("user_id", userId)
          .maybeSingle();

        const parentName = parentTask?.name || "task";

        return {
          success: true,
          data: {
            parent_task_id: input.parent_task_id,
            parent_name: parentName,
            subtasks: input.subtasks,
          },
          receipt: {
            tool: "break_down_task",
            description: `Proposed breakdown of "${parentName}" into ${input.subtasks.length} steps`,
            status: "requires_confirmation",
            requires_confirmation: true,
            confirmation_details: {
              action: "create_subtasks",
              payload: {
                parent_task_id: input.parent_task_id,
                parent_name: parentName,
                subtasks: input.subtasks,
              },
            },
          },
        };
      }

      case "create_subtasks": {
        // 1. Verify parent task ownership
        const { data: parentTask } = await supabase
          .from("tasks")
          .select("id, name, priority, project_id, goal_id")
          .eq("id", input.parent_task_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!parentTask) {
          return { success: false, error: "Parent task not found or unauthorized" };
        }

        // Validate subtasks payload
        if (!Array.isArray(input.subtasks) || input.subtasks.length === 0) {
          return { success: false, error: "Subtasks array must not be empty" };
        }

        if (input.subtasks.length > 10) {
          return { success: false, error: "Cannot create more than 10 subtasks at once" };
        }

        // 2. Replay protection & Idempotency check
        // Check if subtasks with these names already exist under this parent
        const { data: existingChildren } = await supabase
          .from("tasks")
          .select("id, name")
          .eq("parent_task_id", input.parent_task_id)
          .eq("user_id", userId);

        const existingNames = new Set((existingChildren || []).map((c) => c.name.toLowerCase().trim()));
        const toInsert = input.subtasks.filter(
          (st: { name: string }) => !existingNames.has(st.name.toLowerCase().trim())
        );

        if (toInsert.length === 0 && (existingChildren || []).length > 0) {
          // Replay detected — all proposed subtasks already exist
          return {
            success: true,
            data: existingChildren,
            receipt: {
              tool: "create_subtasks",
              description: `Subtasks already exist for "${parentTask.name}" (${existingChildren?.length} steps)`,
              entityId: parentTask.id,
              status: "executed",
            },
          };
        }

        const subtaskRows = toInsert.map((st: { name: string; estimated_minutes?: number }) => ({
          user_id: userId,
          parent_task_id: input.parent_task_id,
          name: st.name.trim(),
          estimated_minutes: st.estimated_minutes ?? 20,
          priority: parentTask.priority || "medium",
          project_id: parentTask.project_id || null,
          goal_id: parentTask.goal_id || null,
          status: "inbox",
          done: false,
        }));

        const { data, error } = await supabase
          .from("tasks")
          .insert(subtaskRows)
          .select("id, name");

        if (error || !data) {
          return { success: false, error: error?.message || "Failed to create subtasks" };
        }

        return {
          success: true,
          data,
          receipt: {
            tool: "create_subtasks",
            description: `Created ${data.length} subtasks for "${parentTask.name}"`,
            entityId: parentTask.id,
            status: "executed",
          },
        };
      }

      case "plan_day": {
        // Resolve user timezone
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();

        const timezone = profile?.timezone || "UTC";
        const now = new Date();

        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const dateKey = formatter.format(now); // YYYY-MM-DD

        // Parallel fetch tasks, projects, goals, and schedule
        const [
          { data: allTasksData },
          { data: projectsData },
          { data: goalsData },
          schedule,
        ] = await Promise.all([
          supabase.from("tasks").select("*").eq("user_id", userId),
          supabase.from("projects").select("id, name").eq("user_id", userId),
          supabase.from("goals").select("id, title").eq("user_id", userId),
          buildScheduleContext(supabase, userId, timezone, now),
        ]);

        const allTasks = (allTasksData || []) as any[];
        const projectMap = new Map<string, string>();
        for (const p of projectsData || []) projectMap.set(p.id, p.name);
        const goalMap = new Map<string, string>();
        for (const g of goalsData || []) goalMap.set(g.id, g.title);

        function toCompact(t: any): CompactTask {
          const isOverdue = Boolean(t.due_date && t.due_date < dateKey);
          return {
            id: t.id,
            name: t.name,
            priority: t.priority,
            due_date: t.due_date,
            due_time: t.due_time,
            estimated_minutes: t.estimated_minutes ?? 30,
            status: t.status,
            project_name: t.project_id ? projectMap.get(t.project_id) : undefined,
            goal_title: t.goal_id ? goalMap.get(t.goal_id) : undefined,
            is_overdue: isOverdue,
            postpone_count: 0,
          };
        }

        const plan = buildDayPlan({
          tasks: allTasks,
          schedule,
          now,
          todayKey: dateKey,
          toCompact,
          constraints: input.constraints,
        });

        return {
          success: true,
          data: { plan },
          receipt: {
            tool: "plan_day",
            description: `Proposed day plan with ${plan.blocks.length} time block(s)`,
            status: "requires_confirmation",
            requires_confirmation: true,
            confirmation_details: {
              action: "apply_day_plan",
              payload: { plan },
            },
          },
        };
      }

      case "apply_day_plan": {
        const plan = input.plan;
        if (!plan || !Array.isArray(plan.blocks) || plan.blocks.length === 0) {
          return { success: false, error: "No time blocks found in day plan to apply." };
        }

        // 1. Replay protection / Idempotency check:
        // Check if all proposed blocks already exist in FlowOS events table
        const taskIds = Array.from(
          new Set(plan.blocks.map((b: any) => b.task_id).filter(Boolean))
        );

        if (taskIds.length > 0) {
          const { data: existingBlocks } = await supabase
            .from("events")
            .select("id, task_id, start_at")
            .eq("user_id", userId)
            .eq("kind", "time_block")
            .in("task_id", taskIds);

          const existingKeySet = new Set(
            (existingBlocks || []).map(
              (eb: any) => `${eb.task_id}:${new Date(eb.start_at).toISOString()}`
            )
          );

          const allAlreadyExist = plan.blocks.every((b: any) =>
            existingKeySet.has(`${b.task_id}:${new Date(b.start_at).toISOString()}`)
          );

          if (allAlreadyExist && (existingBlocks || []).length >= plan.blocks.length) {
            return {
              success: true,
              data: { created_blocks: existingBlocks },
              receipt: {
                tool: "apply_day_plan",
                description: `Day plan already applied (${existingBlocks?.length} blocks scheduled)`,
                status: "executed",
              },
            };
          }
        }

        // 2. Stale Validation: Task existence, ownership, and completion status
        if (taskIds.length > 0) {
          const { data: dbTasks, error: taskErr } = await supabase
            .from("tasks")
            .select("id, name, done, user_id")
            .in("id", taskIds)
            .eq("user_id", userId);

          if (taskErr) {
            return { success: false, error: "Failed to verify tasks in day plan." };
          }

          const dbTaskMap = new Map((dbTasks || []).map((t: any) => [t.id, t]));
          for (const b of plan.blocks) {
            const t = dbTaskMap.get(b.task_id);
            if (!t) {
              return {
                success: false,
                error: `Task "${b.task_name}" not found or unauthorized. Please regenerate your day plan.`,
              };
            }
            if (t.done) {
              return {
                success: false,
                error: `Task "${t.name}" has already been completed. Please regenerate your day plan.`,
              };
            }
          }
        }

        // 3. Stale Validation: Timing (start time must not be in the past)
        const now = new Date();
        const GRACE_BUFFER_MS = 2 * 60 * 1000; // 2 minutes grace
        for (const b of plan.blocks) {
          const startMs = new Date(b.start_at).getTime();
          if (startMs < now.getTime() - GRACE_BUFFER_MS) {
            return {
              success: false,
              error: `Planned block for "${b.task_name}" starts in the past (${b.start_at}). Please regenerate your day plan.`,
            };
          }
        }

        // 4. Stale Validation: Calendar conflicts (native & Google Calendar read-only overlay)
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();
        const timezone = profile?.timezone || "UTC";

        const schedule = await buildScheduleContext(supabase, userId, timezone, now);
        for (const b of plan.blocks) {
          const blockStartMs = new Date(b.start_at).getTime();
          const blockEndMs = new Date(b.end_at).getTime();

          for (const busy of schedule.busy_blocks) {
            if (busy.all_day) continue;
            const busyStartMs = new Date(busy.start).getTime();
            const busyEndMs = new Date(busy.end).getTime();

            // Conflict condition: intervals overlap
            if (blockStartMs < busyEndMs && blockEndMs > busyStartMs) {
              return {
                success: false,
                error: `Schedule conflict: "${b.task_name}" overlaps with existing "${busy.title}" (${busy.source}). Please regenerate your day plan.`,
              };
            }
          }
        }

        // 5. Atomic batch insert into events table
        const eventRows = plan.blocks.map((b: any) => ({
          user_id: userId,
          title: b.task_name.trim(),
          start_at: b.start_at,
          end_at: b.end_at,
          task_id: b.task_id || null,
          kind: "time_block",
          location: null,
          notes: b.reason || "Scheduled by FlowOS Day Planner",
        }));

        const { data: insertedEvents, error: insertError } = await supabase
          .from("events")
          .insert(eventRows)
          .select("id, title, start_at, end_at");

        if (insertError || !insertedEvents) {
          return {
            success: false,
            error: insertError?.message || "Failed to schedule day plan time blocks.",
          };
        }

        return {
          success: true,
          data: { created_blocks: insertedEvents },
          receipt: {
            tool: "apply_day_plan",
            description: `Scheduled ${insertedEvents.length} time block(s) in FlowOS Calendar`,
            entityId: insertedEvents.map((e: any) => e.id).join(","),
            status: "executed",
          },
        };
      }

      case "apply_adaptation": {
        const title = (input.title || "").trim();
        const content = (input.content || "").trim();
        const category = input.category || "planning_pattern";
        const multiplier = typeof input.multiplier === "number" ? input.multiplier : undefined;

        if (!title || !content) {
          return {
            success: false,
            error: "Missing required adaptation title or content.",
          };
        }

        let durableContent = content;
        if (multiplier && !durableContent.toLowerCase().includes("multiplier")) {
          durableContent = `${durableContent} (multiplier: ${multiplier})`;
        }

        const { persistMemories } = await import("./memoryEngine");
        const saved = await persistMemories(supabase, userId, [
          {
            category,
            content: durableContent,
            confidence: "high",
            source: "reflection",
          },
        ]);

        const savedItem = saved[0];
        return {
          success: true,
          data: { memory: savedItem, adaptation_id: input.adaptation_id },
          receipt: {
            tool: "apply_adaptation",
            description: `Adopted planning adaptation: "${title}"`,
            entityId: savedItem?.id || input.adaptation_id,
            status: "executed",
          },
        };
      }

      case "review_recent_period": {
        const { buildRollingReview } = await import("./reviewEngine");
        const { getRelevantMemories } = await import("./memoryEngine");

        const [
          { data: tasksData },
          { data: taskEventsData },
          { data: focusSessionsData },
          { data: goalsData },
          { data: projectsData },
          { data: profileData },
          memories,
        ] = await Promise.all([
          supabase.from("tasks").select("*").eq("user_id", userId),
          supabase
            .from("task_events")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("focus_sessions")
            .select("*")
            .eq("user_id", userId)
            .order("started_at", { ascending: false })
            .limit(30),
          supabase.from("goals").select("*").eq("user_id", userId),
          supabase.from("projects").select("*").eq("user_id", userId),
          supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
          getRelevantMemories(supabase, userId, undefined, 10),
        ]);

        const timezone = (profileData as any)?.timezone || "UTC";
        const schedule = await buildScheduleContext(supabase, userId, timezone);

        const review = buildRollingReview({
          userId,
          tasks: (tasksData as any[]) || [],
          taskEvents: (taskEventsData as any[]) || [],
          focusSessions: (focusSessionsData as any[]) || [],
          goals: (goalsData as any[]) || [],
          projects: (projectsData as any[]) || [],
          memories: memories || [],
          schedule,
          timezone,
        });

        return {
          success: true,
          data: { review },
          receipt: {
            tool: "review_recent_period",
            description: `Generated rolling 7-day review: ${review.task_summary.completed} tasks completed, ${review.priority_progress.high_priority_completed} high-priority completed`,
            entityId: review.id,
            status: "executed",
          },
        };
      }

      case "start_task": {
        const taskId = input.task_id;
        if (!taskId || typeof taskId !== "string") {
          return { success: false, error: "Missing or invalid task_id." };
        }

        // 1. Fetch task and verify ownership
        const { data: task, error: taskErr } = await supabase
          .from("tasks")
          .select("id, name, done, estimated_minutes, user_id")
          .eq("id", taskId)
          .eq("user_id", userId)
          .maybeSingle();

        if (taskErr || !task) {
          return { success: false, error: "Task not found or unauthorized" };
        }

        if (task.done) {
          return { success: false, error: `Task "${task.name}" has already been completed.` };
        }

        // 2. Resolve timezone and schedule to verify current window
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();
        const timezone = profile?.timezone || "UTC";
        const now = new Date();
        const nowMs = now.getTime();

        const schedule = await buildScheduleContext(supabase, userId, timezone, now);

        // Check if currently inside a busy meeting block
        const currentBusy = schedule.busy_blocks.find((b) => {
          if (b.all_day) return false;
          const s = new Date(b.start).getTime();
          const e = new Date(b.end).getTime();
          return s <= nowMs && e > nowMs;
        });

        // Check if there is an active native planned block for this task
        const { data: nativeBlocks } = await supabase
          .from("events")
          .select("id, start_at, end_at, task_id, kind")
          .eq("user_id", userId)
          .eq("kind", "time_block")
          .eq("task_id", taskId);

        const isCurrentPlannedBlock = (nativeBlocks || []).some((b: any) => {
          const s = new Date(b.start_at).getTime();
          const e = new Date(b.end_at).getTime();
          return (s <= nowMs && e > nowMs) || (s > nowMs && s - nowMs <= 10 * 60000);
        });

        let availableMinutes = 0;
        const nextCommitment = schedule.busy_blocks
          .filter((b) => !b.all_day && new Date(b.start).getTime() > nowMs)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];

        if (currentBusy && !isCurrentPlannedBlock) {
          return {
            success: false,
            error: `Currently busy with "${currentBusy.title}" until ${new Date(currentBusy.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Cannot start task now.`,
          };
        }

        if (nextCommitment) {
          availableMinutes = Math.max(0, Math.round((new Date(nextCommitment.start).getTime() - nowMs) / 60000));
        } else {
          const activeWindow = schedule.free_windows.find((w) => new Date(w.end).getTime() > nowMs);
          availableMinutes = activeWindow ? activeWindow.duration_minutes : schedule.total_free_minutes;
        }

        const taskDuration = task.estimated_minutes ?? 30;
        if (!isCurrentPlannedBlock && availableMinutes > 0 && taskDuration > availableMinutes) {
          return {
            success: false,
            error: `Task "${task.name}" requires ${taskDuration}m, but only ${availableMinutes}m available before "${nextCommitment?.title || "next commitment"}".`,
          };
        }

        // 3. Log task_events with event_type: "started"
        try {
          await supabase.from("task_events").insert({
            user_id: userId,
            task_id: task.id,
            event_type: "started",
            created_at: now.toISOString(),
          });
        } catch {
          // Best effort
        }

        return {
          success: true,
          data: {
            active_task: {
              taskId: task.id,
              title: task.name,
              estimatedMinutes: taskDuration,
              source: isCurrentPlannedBlock ? "planned_block" : "user_selected",
              startedAt: now.toISOString(),
            },
          },
          receipt: {
            tool: "start_task",
            description: `Started working on "${task.name}"`,
            entityId: task.id,
            status: "executed",
          },
        };
      }

      case "replan_remaining_day": {
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();

        const timezone = profile?.timezone || "UTC";
        const now = new Date();

        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const dateKey = formatter.format(now);

        const { getRelevantMemories } = await import("./memoryEngine");

        const [
          { data: allTasksData },
          { data: projectsData },
          { data: goalsData },
          schedule,
          relevantMemories,
        ] = await Promise.all([
          supabase.from("tasks").select("*").eq("user_id", userId),
          supabase.from("projects").select("id, name").eq("user_id", userId),
          supabase.from("goals").select("id, title").eq("user_id", userId),
          buildScheduleContext(supabase, userId, timezone, now),
          getRelevantMemories(supabase, userId, undefined, 6),
        ]);

        const allTasks = (allTasksData || []) as any[];
        const projectMap = new Map<string, string>();
        for (const p of projectsData || []) projectMap.set(p.id, p.name);
        const goalMap = new Map<string, string>();
        for (const g of goalsData || []) goalMap.set(g.id, g.title);

        function toCompact(t: any): CompactTask {
          const isOverdue = Boolean(t.due_date && t.due_date < dateKey);
          return {
            id: t.id,
            name: t.name,
            priority: t.priority,
            due_date: t.due_date,
            due_time: t.due_time,
            estimated_minutes: t.estimated_minutes ?? 30,
            status: t.status,
            project_name: t.project_id ? projectMap.get(t.project_id) : undefined,
            goal_title: t.goal_id ? goalMap.get(t.goal_id) : undefined,
            is_overdue: isOverdue,
            postpone_count: 0,
          };
        }

        const plan = buildDayPlan({
          tasks: allTasks,
          schedule,
          now,
          todayKey: dateKey,
          toCompact,
          constraints: input.constraints,
          acceptedMemories: relevantMemories,
        });

        return {
          success: true,
          data: { plan },
          receipt: {
            tool: "replan_remaining_day",
            description: `Proposed remaining day plan with ${plan.blocks.length} time block(s)`,
            status: "requires_confirmation",
            requires_confirmation: true,
            confirmation_details: {
              action: "apply_remaining_day_plan",
              payload: { plan },
            },
          },
        };
      }

      case "apply_remaining_day_plan": {
        const plan = input.plan;
        if (!plan || !Array.isArray(plan.blocks)) {
          return { success: false, error: "Invalid day plan." };
        }

        const taskIds = Array.from(
          new Set(plan.blocks.map((b: any) => b.task_id).filter(Boolean))
        );

        // 1. Validate task existence, ownership, and completion
        if (taskIds.length > 0) {
          const { data: dbTasks, error: taskErr } = await supabase
            .from("tasks")
            .select("id, name, done, user_id")
            .in("id", taskIds)
            .eq("user_id", userId);

          if (taskErr) {
            return { success: false, error: "Failed to verify tasks in day plan." };
          }

          const dbTaskMap = new Map((dbTasks || []).map((t: any) => [t.id, t]));
          for (const b of plan.blocks) {
            const t = dbTaskMap.get(b.task_id);
            if (!t) {
              return { success: false, error: `Task "${b.task_name}" not found or unauthorized.` };
            }
            if (t.done) {
              return { success: false, error: `Task "${t.name}" has already been completed.` };
            }
          }
        }

        // 2. Validate timing (must not be in past beyond grace)
        const now = new Date();
        const GRACE_BUFFER_MS = 2 * 60 * 1000;
        for (const b of plan.blocks) {
          const startMs = new Date(b.start_at).getTime();
          if (startMs < now.getTime() - GRACE_BUFFER_MS) {
            return {
              success: false,
              error: `Planned block for "${b.task_name}" starts in the past (${b.start_at}).`,
            };
          }
        }

        // 3. Validate calendar conflicts (ignoring existing time blocks that are about to be replaced)
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();
        const timezone = profile?.timezone || "UTC";
        const schedule = await buildScheduleContext(supabase, userId, timezone, now);

        for (const b of plan.blocks) {
          const bStart = new Date(b.start_at).getTime();
          const bEnd = new Date(b.end_at).getTime();

          for (const busy of schedule.busy_blocks) {
            if (busy.all_day) continue;
            if (busy.source === "google") {
              const s = new Date(busy.start).getTime();
              const e = new Date(busy.end).getTime();
              if (bStart < e && bEnd > s) {
                return {
                  success: false,
                  error: `Conflict with Google Calendar event "${busy.title}". Please replan.`,
                };
              }
            }
          }
        }

        // 4. Safely replace future native time blocks for today
        const nowIso = now.toISOString();
        await supabase
          .from("events")
          .delete()
          .eq("user_id", userId)
          .eq("kind", "time_block")
          .gte("start_at", nowIso)
          .lte("start_at", `${plan.date}T23:59:59.999Z`);

        // 5. Insert new blocks
        if (plan.blocks.length > 0) {
          const eventRows = plan.blocks.map((b: any) => ({
            user_id: userId,
            title: b.task_name.trim(),
            start_at: b.start_at,
            end_at: b.end_at,
            kind: "time_block",
            task_id: b.task_id,
            source: "flowos",
          }));

          const { data: created, error: insertErr } = await supabase
            .from("events")
            .insert(eventRows)
            .select("id, title, start_at, end_at, task_id");

          if (insertErr) {
            return { success: false, error: insertErr.message || "Failed to schedule time blocks" };
          }

          return {
            success: true,
            data: { created_blocks: created },
            receipt: {
              tool: "apply_remaining_day_plan",
              description: `Replanned remaining day: scheduled ${created?.length || 0} time block(s)`,
              status: "executed",
            },
          };
        }

        return {
          success: true,
          data: { created_blocks: [] },
          receipt: {
            tool: "apply_remaining_day_plan",
            description: "No remaining tasks scheduled for today.",
            status: "executed",
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Tool execution failed" };
  }
}
