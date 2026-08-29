"use client";

import { useEffect, useState } from "react";
import { useGoals } from "./GoalsProvider";
import { HORIZON_LABEL } from "@/lib/services/goalService";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { Goal, GoalHorizon, GoalStatus } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  goal?: Goal | null;
}

const HORIZONS: GoalHorizon[] = ["vision", "long_term", "yearly", "quarterly", "monthly"];
const STATUSES: { value: GoalStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At risk" },
  { value: "behind", label: "Behind" },
  { value: "done", label: "Done" },
];

export function GoalFormModal({ open, onClose, goal }: Props) {
  const { addGoal, editGoal, archiveGoal, removeGoal } = useGoals();
  const isEdit = !!goal;

  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [horizon, setHorizon] = useState<GoalHorizon>("quarterly");
  const [deadline, setDeadline] = useState("");
  const [successMetric, setSuccessMetric] = useState("");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [obstacles, setObstacles] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? "");
    setWhy(goal?.why ?? "");
    setHorizon(goal?.horizon ?? "quarterly");
    setDeadline(goal?.deadline ?? "");
    setSuccessMetric(goal?.success_metric ?? "");
    setStatus(goal?.status && goal.status !== "archived" ? goal.status : "active");
    setObstacles(goal?.obstacles ?? "");
  }, [open, goal]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title, why: why || null, horizon, deadline: deadline || null,
        success_metric: successMetric || null, status, obstacles: obstacles || null,
      };
      if (isEdit && goal) {
        await editGoal(goal.id, payload);
      } else {
        await addGoal(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!goal) return;
    await archiveGoal(goal.id);
    onClose();
  }

  async function handleDelete() {
    if (!goal) return;
    if (!window.confirm(`Delete "${goal.title}"? Linked projects and tasks will be kept but unlinked from the goal. This can't be undone.`)) return;
    await removeGoal(goal.id);
    onClose();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? "Edit goal" : "New goal"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label htmlFor="goal-title">Title</label>
          <input id="goal-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish sophomore year with a 3.7+ GPA" />
        </div>

        <div className="field">
          <label htmlFor="goal-why">Why this matters</label>
          <textarea id="goal-why" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What makes this worth doing?" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="goal-horizon">Horizon</label>
            <select id="goal-horizon" value={horizon} onChange={(e) => setHorizon(e.target.value as GoalHorizon)}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>{HORIZON_LABEL[h]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="goal-status">Status</label>
            <select id="goal-status" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="goal-deadline">Deadline</label>
            <input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="goal-metric">Success metric</label>
            <input id="goal-metric" value={successMetric} onChange={(e) => setSuccessMetric(e.target.value)} placeholder="e.g. GPA ≥ 3.7" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="goal-obstacles">Obstacles</label>
          <textarea id="goal-obstacles" rows={2} value={obstacles} onChange={(e) => setObstacles(e.target.value)} placeholder="What's getting in the way?" />
        </div>

        <p className="small muted" style={{ marginTop: -4 }}>
          Progress isn't set manually — it's calculated from the projects and tasks you link to this goal.
        </p>

        <div className="modal-foot">
          {isEdit && (
            <>
              <button className="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>Delete</button>
              {goal?.status !== "archived" && <button className="ghost" onClick={handleArchive}>Archive</button>}
            </>
          )}
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
          </button>
        </div>
      </div>
    </div>
  );
}
