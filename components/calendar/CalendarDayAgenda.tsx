"use client";

import type { CalendarDisplayEvent, CalendarEvent } from "@/types";

interface Props {
  dateKey: string;
  events: CalendarDisplayEvent[]; // already filtered to this day, real events + task markers + Google overlays
  onEventClick: (event: CalendarDisplayEvent) => void;
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
          {sorted.map((e) => {
            const isGoogle = "source" in e && e.source === "google";
            const isAllDay = "all_day" in e && Boolean(e.all_day);
            const timeLabel = e.kind === "task" ? "Due" : isAllDay ? "All day" : formatTime(e.start_at);

            return (
              <div
                key={e.id}
                className="row"
                style={{
                  gap: 12, padding: "10px 12px", borderRadius: 10,
                  background: e.kind === "task" ? "transparent" : "var(--surface2)",
                  border: e.kind === "task" ? "1px dashed var(--border)" : isGoogle ? "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))" : "none",
                  borderLeft: isGoogle ? "3px solid var(--accent)" : undefined,
                  cursor: e.kind === "task" ? "default" : "pointer",
                }}
                role={e.kind !== "task" ? "button" : undefined}
                tabIndex={e.kind !== "task" ? 0 : undefined}
                onKeyDown={
                  e.kind !== "task"
                    ? (evt) => {
                        if (evt.key === "Enter" || evt.key === " ") {
                          evt.preventDefault();
                          onEventClick(e);
                        }
                      }
                    : undefined
                }
                aria-label={
                  isGoogle
                    ? `Google Calendar event: ${e.title}, ${timeLabel}`
                    : e.kind === "task"
                    ? `Task due: ${e.title}`
                    : `Event: ${e.title}, ${timeLabel}`
                }
                onClick={() => e.kind !== "task" && onEventClick(e)}
              >
                <div className="muted small" style={{ width: 70, flex: "none" }}>
                  {timeLabel}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                  <div className="task-meta">
                    <span className="tag">{KIND_LABEL[e.kind]}</span>
                    {isGoogle && (
                      <span className="tag" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
                        Google
                      </span>
                    )}
                    {e.location && <span className="tag">{e.location}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
