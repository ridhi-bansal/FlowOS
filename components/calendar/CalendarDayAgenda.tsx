"use client";

import type { CalendarEvent } from "@/types";

interface Props {
  dateKey: string;
  events: CalendarEvent[]; // already filtered to this day, real events + task markers
  onEventClick: (event: CalendarEvent) => void;
  onAddEvent: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  event: "Event",
  time_block: "Time block",
  focus_block: "Focus block",
  task: "Task due",
};

export function CalendarDayAgenda({ dateKey, events, onEventClick, onAddEvent }: Props) {
  const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="card">
      <div className="card-head">
        <h3>{dateLabel}</h3>
        <button className="ghost small" onClick={onAddEvent}>+ Add event</button>
      </div>
      {sorted.length === 0 ? (
        <div className="empty">
          <h4>Nothing scheduled</h4>
          <p className="small">No events or task deadlines on this day.</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {sorted.map((e) => (
            <div
              key={e.id}
              className="row"
              style={{
                gap: 12, padding: "10px 12px", borderRadius: 10,
                background: e.kind === "task" ? "transparent" : "var(--surface2)",
                border: e.kind === "task" ? "1px dashed var(--border)" : "none",
                cursor: e.kind === "task" ? "default" : "pointer",
              }}
              onClick={() => e.kind !== "task" && onEventClick(e)}
            >
              <div className="muted small" style={{ width: 70, flex: "none" }}>
                {e.kind === "task" ? "Due" : formatTime(e.start_at)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                <div className="task-meta">
                  <span className="tag">{KIND_LABEL[e.kind]}</span>
                  {e.location && <span className="tag">{e.location}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
