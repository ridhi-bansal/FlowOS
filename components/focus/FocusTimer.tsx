"use client";

import { useEffect, useState } from "react";
import { useFocus } from "./FocusProvider";
import type { FocusSession } from "@/types";

function fmt(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FocusTimer({ session }: { session: FocusSession }) {
  const { complete, cancel } = useFocus();
  const [now, setNow] = useState(Date.now());
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [rating, setRating] = useState(0);
  const [reflection, setReflection] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startedAt = new Date(session.started_at).getTime();
  const plannedSeconds = session.planned_minutes * 60;
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  const remaining = plannedSeconds - elapsedSeconds;
  const overtime = remaining < 0;
  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

  async function handleComplete() {
    await complete(session.id, elapsedMinutes, rating || null, reflection || null);
    setShowWrapUp(false);
  }

  return (
    <div className="card coach" style={{ textAlign: "center" }}>
      <p className="small muted" style={{ margin: "0 0 6px" }}>Focusing on</p>
      <h2 style={{ margin: "0 0 18px" }}>{session.session_goal || "Untitled session"}</h2>
      <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: overtime ? "var(--red)" : "var(--text)" }}>
        {overtime ? `+${fmt(-remaining)}` : fmt(remaining)}
      </div>
      <p className="small muted" style={{ margin: "6px 0 20px" }}>
        {overtime ? "Over your planned time — wrap up whenever you're ready." : `of ${session.planned_minutes} min planned`}
      </p>

      {!showWrapUp ? (
        <div className="row" style={{ justifyContent: "center", gap: 10 }}>
          <button className="primary" onClick={() => setShowWrapUp(true)}>Complete session</button>
          <button className="ghost" onClick={() => cancel(session.id)}>Cancel</button>
        </div>
      ) : (
        <div className="stack" style={{ maxWidth: 380, margin: "0 auto", textAlign: "left" }}>
          <div className="field">
            <label>How did it go?</label>
            <div className="row" style={{ gap: 6, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={`Rate ${n}`}
                  style={{ fontSize: 22, opacity: n <= rating ? 1 : 0.3 }}>★</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="focus-reflection">Quick reflection (optional)</label>
            <textarea id="focus-reflection" rows={2} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="What did you get done?" />
          </div>
          <button className="primary" onClick={handleComplete} style={{ justifyContent: "center" }}>Save & finish</button>
        </div>
      )}
    </div>
  );
}
