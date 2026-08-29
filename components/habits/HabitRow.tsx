"use client";

import { useState } from "react";
import type { Habit } from "@/types";
import { useHabits } from "./HabitsProvider";
import { isLoggedToday, currentStreak, completionRate } from "@/lib/services/habitService";
import { HabitFormModal } from "./HabitFormModal";
import { dateKey } from "@/lib/utils/date";

export function HabitRow({ habit }: { habit: Habit }) {
  const { logs, toggleToday } = useHabits();
  const [editing, setEditing] = useState(false);
  const doneToday = isLoggedToday(logs, habit.id);
  const streak = currentStreak(logs, habit.id);
  const rate = completionRate(logs, habit.id, 7);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dateKey(d);
    return logs.some((l) => l.habit_id === habit.id && l.logged_date === key);
  });

  return (
    <div className="task">
      <button
        className={`check${doneToday ? " done" : ""}`}
        style={{ borderColor: habit.color ?? undefined, background: doneToday ? habit.color ?? undefined : "transparent" }}
        onClick={() => toggleToday(habit.id)}
        aria-label={doneToday ? "Mark not done today" : "Mark done today"}
      >
        {doneToday ? "✓" : ""}
      </button>
      <div className="task-main" onClick={() => setEditing(true)} style={{ cursor: "pointer" }}>
        <div className="task-name">{habit.name}</div>
        <div className="task-meta">
          <span className="tag">{streak} day streak</span>
          <span className="tag">{rate}% this week</span>
          <span className="row" style={{ gap: 3 }}>
            {last7.map((hit, i) => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: hit ? (habit.color ?? "var(--accent)") : "var(--surface2)", border: "1px solid var(--border)" }} />
            ))}
          </span>
        </div>
      </div>
      <HabitFormModal open={editing} habit={habit} onClose={() => setEditing(false)} />
    </div>
  );
}
