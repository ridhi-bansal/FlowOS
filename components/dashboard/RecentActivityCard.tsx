"use client";

import { useTasks } from "@/components/tasks/TasksProvider";
import { useFocus } from "@/components/focus/FocusProvider";

interface ActivityItem {
  id: string;
  text: string;
  at: string;
}

export function RecentActivityCard() {
  const { tasks } = useTasks();
  const { sessions } = useFocus();

  const items: ActivityItem[] = [
    ...tasks
      .filter((t) => t.done && t.completed_at)
      .map((t) => ({ id: `done-${t.id}`, text: `Completed "${t.name}"`, at: t.completed_at! })),
    ...tasks
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((t) => ({ id: `created-${t.id}`, text: `Created "${t.name}"`, at: t.created_at })),
    ...sessions.map((s) => ({ id: `focus-${s.id}`, text: `Started a focus session on "${s.session_goal ?? "a task"}"`, at: s.started_at })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return (
    <div className="card">
      <h3>Recent activity</h3>
      {items.length === 0 ? (
        <p className="muted small">Nothing yet — create or complete a task to see it here.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} className="row between small" style={{ flexWrap: "wrap", gap: "4px 10px" }}>
              <span style={{ minWidth: 0 }}>{item.text}</span>
              <span className="muted" style={{ flexShrink: 0 }}>{new Date(item.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
