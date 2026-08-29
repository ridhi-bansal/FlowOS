"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useFocus } from "@/components/focus/FocusProvider";
import { whatShouldIDoNow } from "@/lib/services/whatNowService";
import type { WhatNowRecommendation } from "@/types";

export function WhatNowCard() {
  const { tasks, loading } = useTasks();
  const { start, activeSession } = useFocus();
  const router = useRouter();
  const [rec, setRec] = useState<WhatNowRecommendation | null>(null);
  const [busy, setBusy] = useState(false);

  async function compute() {
    setBusy(true);
    try {
      const result = await whatShouldIDoNow(tasks, undefined);
      setRec(result);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tasks.length]);

  return (
    <div className="card coach">
      <div className="card-head">
        <h3>What should I do now?</h3>
        <button className="ghost small" onClick={compute} disabled={busy}>{busy ? "…" : "Refresh"}</button>
      </div>
      {!rec ? (
        <p className="muted small">Thinking…</p>
      ) : (
        <div className="stack">
          <div className="stat" style={{ fontSize: 20 }}>{rec.taskName}</div>
          <p className="small muted" style={{ margin: 0 }}>{rec.reason}</p>
          <div className="row" style={{ gap: 8 }}>
            {rec.minutes > 0 && <span className="tag">{rec.minutes} min</span>}
            <span className="tag">{rec.confidence} confidence</span>
          </div>
          {rec.taskId && (
            <button
              className="primary"
              style={{ marginTop: 4, justifyContent: "center" }}
              onClick={async () => {
                if (activeSession) {
                  router.push("/focus");
                  return;
                }
                await start({ taskId: rec.taskId, sessionGoal: rec.taskName, plannedMinutes: rec.minutes || 25 });
                router.push("/focus");
              }}
            >
              {activeSession ? "Focus session in progress →" : "Start Focus"}
            </button>
          )}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
        Local rule-based recommendation — not connected to an external AI model.
      </p>
    </div>
  );
}
