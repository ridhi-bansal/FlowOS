"use client";

import { useEffect, useRef, useState } from "react";
import type { CoachMode } from "@/types";
import type {
  CoachActionReceipt,
  CoachTrigger,
  DailyReflectionSummary,
  AdaptationCandidate,
  CoachReview,
  ExecutionState,
  ActiveExecutionTask,
  DailyState,
  DayPlan,
} from "@/lib/ai/coach/types";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  receipts?: CoachActionReceipt[];
}

const MODES: { id: CoachMode; label: string; icon: string }[] = [
  { id: "coach", label: "Coach", icon: "🧭" },
  { id: "executor", label: "Executor", icon: "⚡" },
  { id: "strategist", label: "Strategist", icon: "🎯" },
  { id: "analyst", label: "Analyst", icon: "📊" },
  { id: "minimalist", label: "Minimalist", icon: "🌿" },
  { id: "study_coach", label: "Study Coach", icon: "📚" },
];

export function CoachChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<CoachMode>("coach");
  const [initialLoading, setInitialLoading] = useState(true);
  const [executingActionKey, setExecutingActionKey] = useState<string | null>(null);
  const [activeTriggers, setActiveTriggers] = useState<CoachTrigger[]>([]);
  const [activeReflection, setActiveReflection] = useState<DailyReflectionSummary | null>(null);
  const [activeReview, setActiveReview] = useState<CoachReview | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [dailyState, setDailyState] = useState<DailyState | null>(null);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [showTodayTray, setShowTodayTray] = useState(false);
  const [showSecondaryTriggers, setShowSecondaryTriggers] = useState(false);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [activeFocusTask, setActiveFocusTask] = useState<ActiveExecutionTask | null>(null);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [applyingAdaptationId, setApplyingAdaptationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function filterDismissed(triggers: CoachTrigger[]): CoachTrigger[] {
    try {
      const raw = localStorage.getItem("flowos_dismissed_triggers");
      const dismissed = new Set(raw ? JSON.parse(raw) : []);
      return triggers.filter((t) => !dismissed.has(t.id));
    } catch {
      return triggers;
    }
  }

  function filterDismissedReflection(reflection: DailyReflectionSummary | null | undefined): DailyReflectionSummary | null {
    if (!reflection) return null;
    try {
      const raw = localStorage.getItem("flowos_dismissed_reflections");
      const dismissed = new Set(raw ? JSON.parse(raw) : []);
      return dismissed.has(reflection.id) ? null : reflection;
    } catch {
      return reflection;
    }
  }

  function filterDismissedReview(review: CoachReview | null | undefined): CoachReview | null {
    if (!review) return null;
    try {
      const raw = localStorage.getItem("flowos_dismissed_reviews");
      const dismissed = new Set(raw ? JSON.parse(raw) : []);
      const sig = review.signature || review.id;
      return dismissed.has(sig) ? null : review;
    } catch {
      return review;
    }
  }

  // Load existing conversation, proactive triggers, and reflection on mount
  useEffect(() => {
    fetch("/api/coach/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages && data.messages.length > 0) {
          setMessages(
            data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))
          );
          setConversationId(data.conversation?.id);
          if (data.conversation?.mode) {
            setMode(data.conversation.mode);
          }
        }
        if (Array.isArray(data?.triggers)) {
          setActiveTriggers(filterDismissed(data.triggers));
        }
        if (data?.reflection) {
          setActiveReflection(filterDismissedReflection(data.reflection));
        }
        if (data?.review) {
          setActiveReview(filterDismissedReview(data.review));
        }
        if (data?.execution_state) {
          setExecutionState(data.execution_state);
          if (data.execution_state.activeTask) {
            setActiveFocusTask(data.execution_state.activeTask);
          }
        }
        if (data?.daily_state) {
          setDailyState(data.daily_state);
        }
        if (data?.day_plan) {
          setDayPlan(data.day_plan);
        }
      })
      .finally(() => setInitialLoading(false));
  }, []);

  // Listen for data update events and periodic tick to refresh proactive triggers, reflection, review, and execution state
  useEffect(() => {
    function refreshTriggersAndReflection() {
      fetch("/api/coach/chat")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.triggers)) {
            setActiveTriggers(filterDismissed(data.triggers));
          }
          if (data?.reflection) {
            setActiveReflection(filterDismissedReflection(data.reflection));
          }
          if (data?.review) {
            setActiveReview(filterDismissedReview(data.review));
          }
          if (data?.execution_state) {
            setExecutionState(data.execution_state);
            if (data.execution_state.activeTask) {
              setActiveFocusTask(data.execution_state.activeTask);
            }
          }
          if (data?.daily_state) {
            setDailyState(data.daily_state);
          }
          if (data?.day_plan) {
            setDayPlan(data.day_plan);
          }
        });
    }

    window.addEventListener("flowos:data-updated", refreshTriggersAndReflection);
    const interval = setInterval(refreshTriggersAndReflection, 60000);
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshTriggersAndReflection();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("flowos:data-updated", refreshTriggersAndReflection);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  function handleDismissTrigger(triggerId: string) {
    try {
      const raw = localStorage.getItem("flowos_dismissed_triggers");
      const existing: string[] = raw ? JSON.parse(raw) : [];
      if (!existing.includes(triggerId)) {
        existing.push(triggerId);
        localStorage.setItem("flowos_dismissed_triggers", JSON.stringify(existing.slice(-50)));
      }
    } catch {}
    setActiveTriggers((prev) => prev.filter((t) => t.id !== triggerId));
  }

  function handleTriggerAction(trigger: CoachTrigger) {
    handleDismissTrigger(trigger.id);
    setInput(trigger.suggested_action.prompt);
  }

  function handleDismissReflection(reflectionId: string) {
    try {
      const raw = localStorage.getItem("flowos_dismissed_reflections");
      const existing: string[] = raw ? JSON.parse(raw) : [];
      if (!existing.includes(reflectionId)) {
        existing.push(reflectionId);
        localStorage.setItem("flowos_dismissed_reflections", JSON.stringify(existing.slice(-50)));
      }
    } catch {}
    setActiveReflection(null);
  }

  function handleDismissReview(signature: string) {
    try {
      const raw = localStorage.getItem("flowos_dismissed_reviews");
      const existing: string[] = raw ? JSON.parse(raw) : [];
      if (!existing.includes(signature)) {
        existing.push(signature);
        localStorage.setItem("flowos_dismissed_reviews", JSON.stringify(existing.slice(-50)));
      }
    } catch {}
    setActiveReview(null);
  }

  async function handleStartTask(taskId: string) {
    setStartingTaskId(taskId);
    try {
      const res = await fetch("/api/coach/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "start_task",
          payload: { task_id: taskId },
          idempotency_key: `start_${taskId}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.active_task) {
        setActiveFocusTask(data.data.active_task);
        setStaleNotice(null);
        window.dispatchEvent(new CustomEvent("flowos:data-updated"));
      } else if (data.error) {
        const errorText = String(data.error || data.message || "");
        if (errorText.toLowerCase().includes("completed") || errorText.toLowerCase().includes("not found")) {
          setStaleNotice("That task changed while you were deciding. I've refreshed your current plan.");
          setActiveFocusTask(null);
          window.dispatchEvent(new CustomEvent("flowos:data-updated"));
        } else {
          setStaleNotice(errorText);
        }
      }
    } catch {}
    finally {
      setStartingTaskId(null);
    }
  }

  async function handleCompleteActiveTask(taskId: string) {
    setCompletingTaskId(taskId);
    try {
      const res = await fetch("/api/coach/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "complete_task",
          payload: { task_id: taskId },
          idempotency_key: `complete_${taskId}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveFocusTask(null);
        setStaleNotice(null);
        window.dispatchEvent(new CustomEvent("flowos:data-updated"));
        fetch("/api/coach/chat")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.execution_state) setExecutionState(d.execution_state);
          });
      } else if (data.error) {
        setStaleNotice("That task changed or was already completed. I've refreshed your current plan.");
        setActiveFocusTask(null);
        window.dispatchEvent(new CustomEvent("flowos:data-updated"));
      }
    } catch {}
    finally {
      setCompletingTaskId(null);
    }
  }

  function handleCantDoThisNow(taskId?: string) {
    setActiveFocusTask(null);
    setInput(taskId ? "I can't do this task right now. What are my options?" : "I can't do this now. What should I do instead?");
  }

  async function handleApplyAdaptation(adaptation: AdaptationCandidate) {
    setApplyingAdaptationId(adaptation.id);
    try {
      const res = await fetch("/api/coach/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "apply_adaptation",
          idempotency_key: `adaptation-${adaptation.id}`,
          payload: {
            adaptation_id: adaptation.id,
            type: adaptation.type,
            title: adaptation.title,
            content: adaptation.explanation,
            category: "planning_pattern",
            multiplier: adaptation.target_value?.multiplier,
          },
        }),
      });

      if (res.ok) {
        if (activeReflection) {
          handleDismissReflection(activeReflection.id);
        }
        window.dispatchEvent(new CustomEvent("flowos:data-updated"));
      }
    } catch (e) {
      console.error("Failed to apply adaptation:", e);
    } finally {
      setApplyingAdaptationId(null);
    }
  }

  // Scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleConfirmAction(
    msgIdx: number,
    rcptIdx: number,
    rcpt: CoachActionReceipt
  ) {
    if (!rcpt.confirmation_details) return;
    const actionKey = `${msgIdx}-${rcptIdx}`;
    setExecutingActionKey(actionKey);

    const confirmAction = rcpt.confirmation_details.action;
    const payload = rcpt.confirmation_details.payload as any;
    const idempotencyKey =
      confirmAction === "apply_day_plan"
        ? `plan-apply-${payload?.plan?.date || "today"}-${payload?.plan?.generated_at || Date.now()}`
        : `subtask-create-${payload?.parent_task_id || Date.now()}`;

    try {
      const res = await fetch("/api/coach/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: confirmAction,
          payload: rcpt.confirmation_details.payload,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessages((prev) => {
          const updated = [...prev];
          const targetMsg = { ...updated[msgIdx] };
          if (targetMsg.receipts) {
            const receipts = [...targetMsg.receipts];
            receipts[rcptIdx] = data.receipt || {
              tool: confirmAction,
              description:
                confirmAction === "apply_day_plan"
                  ? "Scheduled time blocks in FlowOS Calendar"
                  : "Created subtasks successfully",
              status: "executed",
            };
            targetMsg.receipts = receipts;
            updated[msgIdx] = targetMsg;
          }
          return updated;
        });

        // Trigger immediate state refresh across FlowOS providers
        setStaleNotice(null);
        window.dispatchEvent(new CustomEvent("flowos:data-updated"));
      } else {
        const errorMsg = data.error || data.message || "Failed to execute action.";
        const errLower = String(errorMsg).toLowerCase();
        if (errLower.includes("completed") || errLower.includes("past") || errLower.includes("conflict")) {
          setStaleNotice("Schedule or tasks changed while you were reviewing. I've refreshed your plan.");
          window.dispatchEvent(new CustomEvent("flowos:data-updated"));
        } else {
          setStaleNotice(errorMsg);
        }
      }
    } catch {
      alert("Network error: Could not complete action.");
    } finally {
      setExecutingActionKey(null);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: Message = { role: "user", content: text };
    // Add user message and empty assistant placeholder for progressive streaming
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", receipts: [] }]);
    setLoading(true);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          mode,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: err.message || "Failed to get a response from the Coach.",
          };
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          const lines = evt.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "text" && data.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + data.text,
                  };
                }
                return updated;
              });
            } else if (eventType === "action") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  const existingReceipts = last.receipts || [];
                  updated[updated.length - 1] = {
                    ...last,
                    receipts: [...existingReceipts, data],
                  };
                }
                return updated;
              });

              // Trigger immediate state refresh across FlowOS providers if executed
              if (data.status === "executed") {
                window.dispatchEvent(new CustomEvent("flowos:data-updated"));
              }
            } else if (eventType === "done") {
              if (data.conversationId) {
                setConversationId(data.conversationId);
              }
            } else if (eventType === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content ? `${last.content}\n\n[Error: ${data.message}]` : data.message,
                  };
                }
                return updated;
              });
            }
          } catch {
            // ignore JSON parse errors in malformed chunks
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Network error: Could not reach the Coach service.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: 560 }}>
      {/* Header with Mode Selection */}
      <div className="card-head" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 18 }}>🧭</span>
          <h3 style={{ margin: 0 }}>Conversation</h3>
        </div>
        <div className="chips" style={{ gap: 4, flexWrap: "wrap" }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`chip-btn${mode === m.id ? " active" : ""}`}
              onClick={() => setMode(m.id)}
              style={{ fontSize: 12, padding: "3px 8px" }}
              title={m.label}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stale / Conflict Notice */}
      {staleNotice && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "color-mix(in srgb, #f59e0b 12%, var(--surface))",
            border: "1px solid color-mix(in srgb, #f59e0b 45%, var(--border))",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <span>⚠️ {staleNotice}</span>
          <button
            className="ghost small"
            onClick={() => setStaleNotice(null)}
            style={{ padding: "0 6px", border: "none", cursor: "pointer", background: "transparent" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. NOW EXECUTION SURFACE / FOCUS MODE */}
      {activeFocusTask ? (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
            border: "1.5px solid var(--accent)",
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div className="row between small" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Focus Mode (Active)
              </span>
              <span className="small muted" style={{ fontSize: 11 }}>
                • {activeFocusTask.estimatedMinutes}m estimated
                {executionState?.nextCommitment ? ` • Next: "${executionState.nextCommitment.title}"` : ""}
              </span>
            </div>
            <button
              className="ghost small"
              onClick={() => setActiveFocusTask(null)}
              style={{ fontSize: 11, padding: "2px 6px" }}
              title="Pause focus"
            >
              Pause
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h3 style={{ margin: "2px 0 4px", fontSize: 16, fontWeight: 700 }}>
              {activeFocusTask.title}
            </h3>
            {executionState?.currentWindow && (
              <p className="small muted" style={{ margin: 0 }}>
                {executionState.currentWindow.availableMinutes}m available in current window
              </p>
            )}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button
              className="primary small"
              disabled={completingTaskId === activeFocusTask.taskId}
              onClick={() => handleCompleteActiveTask(activeFocusTask.taskId)}
              style={{ fontSize: 12, padding: "4px 12px", fontWeight: 600 }}
            >
              {completingTaskId === activeFocusTask.taskId ? "Completing…" : "✓ Complete Task"}
            </button>
            <button
              className="ghost small"
              onClick={() => handleCantDoThisNow(activeFocusTask.taskId)}
              style={{ fontSize: 11, padding: "4px 8px", color: "var(--danger)" }}
            >
              I can't do this now
            </button>
          </div>
        </div>
      ) : executionState?.recommendedTask && executionState.canStartRecommendedTask ? (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            background: "color-mix(in srgb, #10b981 10%, var(--surface))",
            border: "1.5px solid color-mix(in srgb, #10b981 35%, var(--border))",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div className="row between small" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <span style={{ fontWeight: 700, color: "#059669", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                What To Do Right Now
              </span>
              <span className="small muted" style={{ fontSize: 11 }}>
                • {executionState.currentWindow?.availableMinutes}m available
                {executionState.nextCommitment ? ` • Next: "${executionState.nextCommitment.title}"` : ""}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {executionState.recommendedTask.title}
            </div>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.4 }}>
              {executionState.recommendedTask.reason}
            </p>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="primary small"
              disabled={startingTaskId === executionState.recommendedTask.taskId}
              onClick={() => handleStartTask(executionState.recommendedTask!.taskId)}
              style={{ fontSize: 12, padding: "4px 12px", fontWeight: 600, background: "#059669", borderColor: "#059669" }}
            >
              {startingTaskId === executionState.recommendedTask.taskId ? "Starting…" : "▶ Start Task"}
            </button>
            <button
              className="ghost small"
              onClick={() => handleCantDoThisNow(executionState.recommendedTask!.taskId)}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              I can't do this now
            </button>
            {executionState.recoveryOptions.find((o) => o.type === "choose_smaller_task") && (
              <button
                className="ghost small"
                onClick={() => setInput(executionState.recoveryOptions.find((o) => o.type === "choose_smaller_task")!.prompt)}
                style={{ fontSize: 11, padding: "4px 8px", textDecoration: "underline" }}
              >
                {executionState.recoveryOptions.find((o) => o.type === "choose_smaller_task")!.label}
              </button>
            )}
          </div>
        </div>
      ) : executionState && !executionState.canStartRecommendedTask && executionState.blockers.length > 0 ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            background: "color-mix(in srgb, #f59e0b 10%, var(--surface))",
            border: "1.5px solid color-mix(in srgb, #f59e0b 35%, var(--border))",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span style={{ fontWeight: 700, color: "#d97706", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Execution Window Notice
            </span>
          </div>
          <p className="small" style={{ margin: "2px 0", lineHeight: 1.4 }}>
            {executionState.blockers[0]}
          </p>
          <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {executionState.recoveryOptions.map((opt, i) => (
              <button
                key={i}
                className="ghost small"
                onClick={() => setInput(opt.prompt)}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 2. TODAY SURFACE (Day Tray) */}
      {dayPlan && dayPlan.blocks.length > 0 && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "color-mix(in srgb, var(--surface2) 40%, var(--surface))",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <div
            className="row between small"
            style={{ alignItems: "center", cursor: "pointer" }}
            onClick={() => setShowTodayTray((prev) => !prev)}
          >
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>📅</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>
                Today's Plan ({dayPlan.blocks.length} focus block{dayPlan.blocks.length > 1 ? "s" : ""})
              </span>
              {dailyState?.capacity && (
                <span className="small muted" style={{ fontSize: 11 }}>
                  • {dailyState.capacity.planned_minutes_today}m planned / {dailyState.capacity.free_minutes_today}m free
                  {dailyState.capacity.status === "overloaded" ? " (overloaded)" : ""}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {showTodayTray ? "Hide ▲" : "Show ▼"}
            </span>
          </div>
          {showTodayTray && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                borderTop: "1px solid var(--border)",
                paddingTop: 6,
              }}
            >
              {dayPlan.blocks.map((b, i) => (
                <div key={i} className="row between small" style={{ fontSize: 12, padding: "2px 0" }}>
                  <span>• {b.task_name}</span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {b.start_at.slice(11, 16)} – {b.end_at.slice(11, 16)} ({b.duration_minutes}m)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. PROACTIVE INTELLIGENCE ALERT (Prioritized) */}
      {activeTriggers.length > 0 && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div className="row between small" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: 12 }}>
                Coach Notice
              </span>
              <span className="small muted" style={{ fontSize: 11 }}>
                • {activeTriggers[0].title}
              </span>
            </div>
            <button
              className="ghost small"
              onClick={() => handleDismissTrigger(activeTriggers[0].id)}
              style={{
                padding: "0 4px",
                fontSize: 11,
                opacity: 0.7,
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
              title="Dismiss notice"
            >
              ✕
            </button>
          </div>
          <p className="small" style={{ margin: "2px 0", lineHeight: 1.4, color: "var(--text)" }}>
            {activeTriggers[0].message}
          </p>
          <div className="row between small" style={{ marginTop: 4, alignItems: "center" }}>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="primary small"
                onClick={() => handleTriggerAction(activeTriggers[0])}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                {activeTriggers[0].suggested_action.label}
              </button>
              <button
                className="ghost small"
                onClick={() => handleDismissTrigger(activeTriggers[0].id)}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                Dismiss
              </button>
            </div>
            {activeTriggers.length > 1 && (
              <button
                className="ghost small"
                onClick={() => setShowSecondaryTriggers((prev) => !prev)}
                style={{ fontSize: 11, padding: "2px 6px" }}
              >
                {showSecondaryTriggers ? "Hide extra alerts ▲" : `+${activeTriggers.length - 1} more alert${activeTriggers.length > 2 ? "s" : ""} ▼`}
              </button>
            )}
          </div>
          {showSecondaryTriggers && activeTriggers.slice(1).map((secTrigger) => (
            <div
              key={secTrigger.id}
              style={{
                marginTop: 6,
                padding: "6px 8px",
                background: "var(--surface)",
                borderRadius: 6,
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div className="row between small" style={{ fontWeight: 600 }}>
                <span>• {secTrigger.title}</span>
                <button
                  className="ghost small"
                  onClick={() => handleDismissTrigger(secTrigger.id)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: "0 4px" }}
                >
                  ✕
                </button>
              </div>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.3 }}>
                {secTrigger.message}
              </p>
              <button
                className="primary small"
                onClick={() => handleTriggerAction(secTrigger)}
                style={{ fontSize: 10, padding: "2px 6px", alignSelf: "flex-start", marginTop: 2 }}
              >
                {secTrigger.suggested_action.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Daily Reflection & Adaptation Card */}
      {activeReflection && !filterDismissedReflection(activeReflection) && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            background: "color-mix(in srgb, #6366f1 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, #6366f1 28%, var(--border))",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div className="row between small" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>🌱</span>
              <span style={{ fontWeight: 600, color: "#6366f1", fontSize: 12 }}>
                {activeReflection.adaptation_candidates.length > 0 ? "Learned Planning Pattern" : "Daily Reflection"}
              </span>
              <span className="small muted" style={{ fontSize: 11 }}>
                • {activeReflection.tasks_completed_count}/{activeReflection.tasks_planned_count} tasks completed
                {activeReflection.tasks_postponed_count > 0 ? `, ${activeReflection.tasks_postponed_count} postponed` : ""}
              </span>
            </div>
            <button
              className="ghost small"
              onClick={() => handleDismissReflection(activeReflection.id)}
              style={{
                padding: "0 4px",
                fontSize: 11,
                opacity: 0.7,
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
              title="Dismiss reflection"
            >
              ✕
            </button>
          </div>

          {activeReflection.adaptation_candidates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {activeReflection.adaptation_candidates[0].title}
              </div>
              <p className="small" style={{ margin: "2px 0", lineHeight: 1.4, color: "var(--text)" }}>
                {activeReflection.adaptation_candidates[0].explanation}
              </p>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button
                  className="primary small"
                  disabled={applyingAdaptationId === activeReflection.adaptation_candidates[0].id}
                  onClick={() => handleApplyAdaptation(activeReflection.adaptation_candidates[0])}
                  style={{ fontSize: 11, padding: "3px 10px" }}
                >
                  {applyingAdaptationId === activeReflection.adaptation_candidates[0].id
                    ? "Applying…"
                    : activeReflection.adaptation_candidates[0].suggested_action?.label || "Use This in Future Plans"}
                </button>
                <button
                  className="ghost small"
                  onClick={() => handleDismissReflection(activeReflection.id)}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                >
                  Not now
                </button>
              </div>
            </div>
          ) : activeReflection.reflection_prompt ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p className="small" style={{ margin: "2px 0", lineHeight: 1.4, color: "var(--text)" }}>
                {activeReflection.reflection_prompt.message}
              </p>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                {activeReflection.reflection_prompt.suggested_action && (
                  <button
                    className="primary small"
                    onClick={() => {
                      const prompt = activeReflection.reflection_prompt!.suggested_action!.prompt;
                      handleDismissReflection(activeReflection.id);
                      setInput(prompt);
                    }}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                  >
                    {activeReflection.reflection_prompt.suggested_action.label}
                  </button>
                )}
                <button
                  className="ghost small"
                  onClick={() => handleDismissReflection(activeReflection.id)}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Weekly Review Summary Card */}
      {activeReview && !filterDismissedReview(activeReview) && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            background: "color-mix(in srgb, #0ea5e9 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, #0ea5e9 28%, var(--border))",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div className="row between small" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>📊</span>
              <span style={{ fontWeight: 600, color: "#0284c7", fontSize: 12 }}>
                Weekly Review ({activeReview.period.label})
              </span>
              <span className="small muted" style={{ fontSize: 11 }}>
                • {activeReview.priority_progress.high_priority_completed}/{activeReview.priority_progress.high_priority_completed + activeReview.priority_progress.high_priority_open} high-priority done
                {activeReview.execution_consistency.completion_rate_percent !== null ? ` • ${activeReview.execution_consistency.completion_rate_percent}% completion` : ""}
              </span>
            </div>
            <button
              className="ghost small"
              onClick={() => handleDismissReview(activeReview.signature || activeReview.id)}
              style={{
                padding: "0 4px",
                fontSize: 11,
                opacity: 0.7,
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
              title="Dismiss weekly review"
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activeReview.insights.length > 0 && (
              <p className="small" style={{ margin: "2px 0", lineHeight: 1.4, color: "var(--text)" }}>
                {activeReview.insights[0].message}
              </p>
            )}
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <button
                className="primary small"
                onClick={() => {
                  handleDismissReview(activeReview.signature || activeReview.id);
                  setInput("Review my past week and give me practical coaching insights.");
                }}
                style={{ fontSize: 11, padding: "3px 10px" }}
              >
                Review Full Week
              </button>
              <button
                className="ghost small"
                onClick={() => handleDismissReview(activeReview.signature || activeReview.id)}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingRight: 4,
        }}
      >
        {initialLoading ? (
          <p className="small muted" style={{ textAlign: "center", marginTop: 40 }}>
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 420, padding: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧭</div>
            <h4 style={{ margin: "0 0 6px" }}>How can I help you today?</h4>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
              I have access to your tasks, priorities, and real calendar schedule. Ask me to plan your day,
              schedule a focus block, or resolve an overloaded schedule.
            </p>
            <div className="row center" style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
              <button
                className="ghost small"
                onClick={() => setInput("What should I do now?")}
              >
                "What should I do now?"
              </button>
              <button
                className="ghost small"
                onClick={() => setInput("Start my next task")}
              >
                "Start my next task"
              </button>
              <button
                className="ghost small"
                onClick={() => setInput("I can't do this now")}
              >
                "I can't do this now"
              </button>
              <button
                className="ghost small"
                onClick={() => setInput("Plan my day")}
              >
                "Plan my day"
              </button>
              <button
                className="ghost small"
                onClick={() => setInput("Replan the rest of my day")}
              >
                "Replan rest of day"
              </button>
              <button
                className="ghost small"
                onClick={() => setInput("Review my past week and give me practical coaching insights.")}
              >
                "Review my week"
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.content && (
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    background: m.role === "user" ? "var(--accent)" : "var(--surface2)",
                    color: m.role === "user" ? "#ffffff" : "var(--text)",
                    borderBottomRightRadius: m.role === "user" ? 2 : 12,
                    borderBottomLeftRadius: m.role === "assistant" ? 2 : 12,
                  }}
                >
                  {m.content}
                </div>
              )}

              {/* Action Receipts & Interactive Confirmations */}
              {m.receipts && m.receipts.length > 0 && (
                <div style={{ marginTop: 6, width: "85%" }}>
                  {m.receipts.map((rcpt, rIdx) => {
                    const actionKey = `${idx}-${rIdx}`;
                    const isExecuting = executingActionKey === actionKey;

                    if (rcpt.requires_confirmation || rcpt.status === "requires_confirmation") {
                      const payload = rcpt.confirmation_details?.payload as any;

                      // Specialized Day Plan confirmation card
                      if (rcpt.tool === "plan_day" || rcpt.confirmation_details?.action === "apply_day_plan") {
                        const plan = payload?.plan;
                        const blocks = plan?.blocks || [];
                        const unscheduled = plan?.unscheduled_tasks || [];
                        const warnings = plan?.warnings || [];

                        return (
                          <div
                            key={rIdx}
                            style={{
                              padding: "12px 14px",
                              background: "color-mix(in srgb, var(--accent) 7%, var(--surface))",
                              border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
                              borderRadius: 12,
                              marginBottom: 8,
                            }}
                          >
                            <div className="row between small" style={{ marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 16 }}>📅</span>
                                <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>
                                  Proposed Day Plan
                                </span>
                                <span className="small muted">({plan?.date})</span>
                              </div>
                              <div className="row" style={{ gap: 6 }}>
                                <span className="tag" style={{ fontSize: 11 }}>
                                  {plan?.capacity_used_minutes || 0}m / {plan?.capacity_available_minutes || 0}m free
                                </span>
                                {plan?.over_capacity_by_minutes > 0 && (
                                  <span
                                    className="tag"
                                    style={{ fontSize: 11, background: "rgba(239, 68, 68, 0.15)", color: "var(--red)" }}
                                  >
                                    +{plan.over_capacity_by_minutes}m overload
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Warnings if any */}
                            {warnings.length > 0 && (
                              <div
                                style={{
                                  padding: "6px 10px",
                                  background: "rgba(245, 158, 11, 0.12)",
                                  border: "1px solid rgba(245, 158, 11, 0.3)",
                                  borderRadius: 8,
                                  marginBottom: 8,
                                  fontSize: 12,
                                  color: "var(--text)",
                                }}
                              >
                                {warnings.map((w: string, wIdx: number) => (
                                  <div key={wIdx}>⚠️ {w}</div>
                                ))}
                              </div>
                            )}

                            {/* Planned Blocks List */}
                            {blocks.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
                                {blocks.map((b: any, bIdx: number) => {
                                  const startStr = new Date(b.start_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  });
                                  const endStr = new Date(b.end_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  });

                                  return (
                                    <div
                                      key={bIdx}
                                      style={{
                                        padding: "8px 10px",
                                        background: "var(--surface)",
                                        borderRadius: 8,
                                        border: "1px solid var(--border)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 2,
                                      }}
                                    >
                                      <div className="row between small" style={{ alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, color: "var(--text)" }}>
                                          {startStr} – {endStr}
                                        </span>
                                        <div className="row" style={{ gap: 4 }}>
                                          <span className="tag" style={{ fontSize: 11 }}>
                                            {b.duration_minutes}m
                                          </span>
                                          {b.is_adaptive_duration && (
                                            <span
                                              className="tag"
                                              style={{
                                                fontSize: 10,
                                                background: "rgba(139, 92, 246, 0.15)",
                                                color: "#8b5cf6",
                                              }}
                                              title={`Original estimate was ${b.original_estimated_minutes}m`}
                                            >
                                              ⚡ Adaptive
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="small" style={{ fontWeight: 500 }}>
                                        {b.task_name}
                                      </div>
                                      {b.reason && (
                                        <div className="small muted" style={{ fontSize: 11, opacity: 0.8 }}>
                                          {b.reason}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="small muted" style={{ margin: "8px 0" }}>
                                No tasks could be scheduled into available free calendar windows.
                              </p>
                            )}

                            {/* Unscheduled Tasks Section */}
                            {unscheduled.length > 0 && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "8px 10px",
                                  background: "var(--surface2)",
                                  borderRadius: 8,
                                }}
                              >
                                <div className="small muted" style={{ fontWeight: 600, marginBottom: 4 }}>
                                  Unscheduled Tasks ({unscheduled.length}):
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  {unscheduled.map((ut: any, uIdx: number) => (
                                    <div key={uIdx} className="small muted" style={{ fontSize: 11 }}>
                                      • {ut.name} ({ut.estimated_minutes}m){ut.is_overdue ? " — Overdue" : ""}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="row between" style={{ marginTop: 10, alignItems: "center" }}>
                              <button
                                className="primary small"
                                disabled={isExecuting || blocks.length === 0}
                                onClick={() => handleConfirmAction(idx, rIdx, rcpt)}
                              >
                                {isExecuting ? "Scheduling Blocks…" : "Confirm & Schedule Plan"}
                              </button>
                              <span className="small muted" style={{ fontSize: 11 }}>
                                Or reply to adjust constraints
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // Subtasks decomposition card
                      const subtasks = payload?.subtasks || [];
                      return (
                        <div
                          key={rIdx}
                          style={{
                            padding: "10px 12px",
                            background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
                            border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
                            borderRadius: 10,
                            marginBottom: 6,
                          }}
                        >
                          <div className="row between small" style={{ marginBottom: 6 }}>
                            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                              📋 {rcpt.description}
                            </span>
                            <span className="tag" style={{ fontSize: 11 }}>
                              Confirmation Required
                            </span>
                          </div>
                          {subtasks.length > 0 && (
                            <div
                              style={{
                                margin: "8px 0",
                                paddingLeft: 8,
                                borderLeft: "2px solid var(--accent)",
                              }}
                            >
                              {subtasks.map((st: any, sIdx: number) => (
                                <div key={sIdx} className="small muted" style={{ marginBottom: 3 }}>
                                  • {st.name}{" "}
                                  <span style={{ opacity: 0.7 }}>({st.estimated_minutes || 20}m)</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="row" style={{ gap: 8, marginTop: 8 }}>
                            <button
                              className="primary small"
                              disabled={isExecuting}
                              onClick={() => handleConfirmAction(idx, rIdx, rcpt)}
                            >
                              {isExecuting ? "Creating…" : "Create Subtasks"}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={rIdx}
                        className="row between small"
                        style={{
                          padding: "6px 10px",
                          background: "color-mix(in srgb, var(--green) 10%, var(--surface))",
                          border: "1px solid color-mix(in srgb, var(--green) 30%, var(--border))",
                          borderRadius: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: "var(--green)", fontWeight: 600 }}>
                          ✓ {rcpt.description}
                        </span>
                        {rcpt.status === "executed" && (
                          <span className="tag" style={{ fontSize: 11 }}>
                            Executed
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}

        {loading && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div
              className="small muted"
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                background: "var(--surface2)",
              }}
            >
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          placeholder="Ask the Coach or request an action…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button
          className="primary"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ padding: "0 18px" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
