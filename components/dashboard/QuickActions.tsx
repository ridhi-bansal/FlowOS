"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { GoalFormModal } from "@/components/goals/GoalFormModal";

const PLACEHOLDER_ACTIONS = [
  { label: "Journal", note: "Journal isn't built yet — coming in a later pass." },
];

export function QuickActions() {
  const [addingTask, setAddingTask] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  function showPlaceholder(note: string) {
    setToast(note);
    window.setTimeout(() => setToast(null), 2400);
  }

  return (
    <div className="card">
      <h3>Quick actions</h3>
      <div className="chips">
        <button className="chip-btn" onClick={() => setAddingTask(true)}>+ Add Task</button>
        <button className="chip-btn" onClick={() => setAddingEvent(true)}>+ Add Event</button>
        <button className="chip-btn" onClick={() => setAddingGoal(true)}>+ Add Goal</button>
        {PLACEHOLDER_ACTIONS.map((a) => (
          <button key={a.label} className="chip-btn" onClick={() => showPlaceholder(a.note)}>{a.label}</button>
        ))}
        <button className="chip-btn" onClick={() => router.push("/tasks")}>View all tasks →</button>
        <button className="chip-btn" onClick={() => router.push("/calendar")}>Open calendar →</button>
        <button className="chip-btn" onClick={() => router.push("/projects")}>Open projects →</button>
        <button className="chip-btn" onClick={() => router.push("/goals")}>Open goals →</button>
      </div>
      <TaskFormModal open={addingTask} onClose={() => setAddingTask(false)} />
      <EventFormModal open={addingEvent} onClose={() => setAddingEvent(false)} />
      <GoalFormModal open={addingGoal} onClose={() => setAddingGoal(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
