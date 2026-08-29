"use client";

import { useMemo, useState } from "react";
import { useFocus } from "@/components/focus/FocusProvider";
import { useTasks } from "@/components/tasks/TasksProvider";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { todaysSessions } from "@/lib/services/focusService";
import { filterByView } from "@/lib/services/taskService";

const PRESETS = [15, 25, 45, 60];

export default function FocusPage() {
  const { sessions, activeSession, start, loading } = useFocus();
  const { tasks } = useTasks();
  const [taskId, setTaskId] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [minutes, setMinutes] = useState(25);

  const candidateTasks = useMemo(() => filterByView(tasks, "today").concat(filterByView(tasks, "upcoming")), [tasks]);
  const today = useMemo(() => todaysSessions(sessions).filter((s) => s.ended_at), [sessions]);
  const totalToday = today.reduce((sum, s) => sum + (s.actual_minutes ?? 0), 0);

  async function handleStart() {
    const task = tasks.find((t) => t.id === taskId);
    const goal = task ? task.name : customGoal.trim();
    if (!goal) return;
    await start({ taskId: taskId || null, sessionGoal: goal, plannedMinutes: minutes });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Track</div>
          <h1 className="page-title">Focus</h1>
          <p className="sub">{totalToday} min focused today across {today.length} session{today.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {loading ? (
        <p className="muted small">Loading…</p>
      ) : activeSession ? (
        <FocusTimer session={activeSession} />
      ) : (
        <div className="card">
          <h3>Start a focus session</h3>
          <div className="field">
            <label htmlFor="focus-task">What are you working on?</label>
            <select id="focus-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Something else…</option>
              {candidateTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {!taskId && (
            <div className="field">
              <label htmlFor="focus-custom">Session goal</label>
              <input id="focus-custom" value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} placeholder="e.g. Read chapter 5" />
            </div>
          )}
          <div className="field">
            <label>Duration</label>
            <div className="chips">
              {PRESETS.map((m) => (
                <button key={m} className={`chip-btn${minutes === m ? " active" : ""}`} onClick={() => setMinutes(m)}>{m} min</button>
              ))}
            </div>
          </div>
          <button className="primary" onClick={handleStart} disabled={!taskId && !customGoal.trim()} style={{ marginTop: 10 }}>
            Start focus session
          </button>
        </div>
      )}

      {today.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Today's sessions</h3>
          <div className="stack" style={{ gap: 10 }}>
            {today.map((s) => (
              <div key={s.id} className="row between small">
                <span>{s.session_goal}</span>
                <span className="muted">
                  {s.actual_minutes} min{s.rating ? ` · ${"★".repeat(s.rating)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
