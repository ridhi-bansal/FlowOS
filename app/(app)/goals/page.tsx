"use client";

import { useMemo, useState } from "react";
import { useGoals } from "@/components/goals/GoalsProvider";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalFormModal } from "@/components/goals/GoalFormModal";
import { GoalDetailModal } from "@/components/goals/GoalDetailModal";
import { sortGoalsByUrgency } from "@/lib/services/goalService";
import type { Goal } from "@/types";

export default function GoalsPage() {
  const { goals, loading } = useGoals();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sorted = useMemo(() => sortGoalsByUrgency(goals), [goals]);
  const visible = showArchived ? sorted : sorted.filter((g) => g.status !== "archived");
  const openedFresh = opened ? goals.find((g) => g.id === opened.id) ?? null : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Goals</h1>
          <p className="sub">{goals.filter((g) => g.status !== "archived").length} active goal{goals.length === 1 ? "" : "s"}</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ New goal</button>
      </div>

      {goals.some((g) => g.status === "archived") && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="ghost small" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted small">Loading goals…</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h4>No goals yet</h4>
            <p className="small">Set a goal, then link projects (or tasks directly) to it to track real progress toward it.</p>
          </div>
        </div>
      ) : (
        <div className="grid g3">
          {visible.map((g) => (
            <GoalCard key={g.id} goal={g} onOpen={setOpened} />
          ))}
        </div>
      )}

      <GoalFormModal open={creating} onClose={() => setCreating(false)} />
      <GoalDetailModal goal={openedFresh} onClose={() => setOpened(null)} />
    </>
  );
}
