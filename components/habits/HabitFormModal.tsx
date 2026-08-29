"use client";

import { useEffect, useState } from "react";
import { useHabits } from "./HabitsProvider";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { Habit } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  habit?: Habit | null;
}

const COLORS = ["#159570", "#635bff", "#8b5cf6", "#c88a00", "#d84b5b", "#0891b2"];

export function HabitFormModal({ open, onClose, habit }: Props) {
  const { addHabit, editHabit, archiveHabit, removeHabit } = useHabits();
  const isEdit = !!habit;
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<Habit["frequency"]>("daily");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(habit?.name ?? "");
    setFrequency(habit?.frequency ?? "daily");
    setColor(habit?.color ?? COLORS[0]);
  }, [open, habit]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && habit) {
        await editHabit(habit.id, { name, frequency, color });
      } else {
        await addHabit({ name, frequency, color });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!habit) return;
    if (!window.confirm(`Delete "${habit.name}"? This removes its whole history and can't be undone.`)) return;
    await removeHabit(habit.id);
    onClose();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? "Edit habit" : "New habit"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="field">
          <label htmlFor="habit-name">Name</label>
          <input id="habit-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning run" />
        </div>
        <div className="field">
          <label htmlFor="habit-frequency">Frequency</label>
          <select id="habit-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Habit["frequency"])}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Choose color ${c}`}
                style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--text)" : "2px solid transparent", padding: 0, cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <div className="modal-foot">
          {isEdit && (
            <>
              <button className="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>Delete</button>
              {!habit?.archived && <button className="ghost" onClick={async () => { await archiveHabit(habit!.id); onClose(); }}>Archive</button>}
            </>
          )}
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create habit"}
          </button>
        </div>
      </div>
    </div>
  );
}
