"use client";

import { useState } from "react";
import { useHabits } from "@/components/habits/HabitsProvider";
import { HabitRow } from "@/components/habits/HabitRow";
import { HabitFormModal } from "@/components/habits/HabitFormModal";

export default function HabitsPage() {
  const { habits, loading } = useHabits();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const visible = habits.filter((h) => showArchived || !h.archived);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Track</div>
          <h1 className="page-title">Habits</h1>
          <p className="sub">{habits.filter((h) => !h.archived).length} active habit{habits.length === 1 ? "" : "s"}</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ New habit</button>
      </div>

      {habits.some((h) => h.archived) && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="ghost small" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="muted small">Loading habits…</p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <h4>No habits yet</h4>
            <p className="small">Add something you want to do consistently — daily or weekly.</p>
          </div>
        ) : (
          visible.map((h) => <HabitRow key={h.id} habit={h} />)
        )}
      </div>

      <HabitFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
