"use client";

import type { CalendarEvent } from "@/types";
import { groupEventsByDay, toDateKey, startOfMonth, endOfMonth, addDays } from "@/lib/services/eventService";

interface Props {
  monthAnchor: Date;
  events: CalendarEvent[]; // real events + synthetic task-deadline markers
  onDayClick: (dateKey: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  todayKey: string;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

export function CalendarMonthView({ monthAnchor, events, onDayClick, onEventClick, todayKey }: Props) {
  const grouped = groupEventsByDay(events);

  const first = startOfMonth(monthAnchor);
  const last = endOfMonth(monthAnchor);
  const gridStart = addDays(first, -first.getDay());
  const totalCells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;

  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) days.push(addDays(gridStart, i));

  return (
    <div>
      <div className="month-weekdays" style={{ marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="muted small" style={{ textAlign: "center", padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {days.map((d) => {
          const key = toDateKey(d);
          const inMonth = d.getMonth() === monthAnchor.getMonth();
          const dayEvents = grouped.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className="day month-day"
              style={{
                borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                padding: 8, opacity: inMonth ? 1 : 0.4, cursor: "pointer",
                background: isToday ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : undefined,
              }}
              onClick={() => onDayClick(key)}
            >
              <div className="small" style={{ fontWeight: isToday ? 800 : 600, marginBottom: 6 }}>{d.getDate()}</div>
              <div className="stack" style={{ gap: 3 }}>
                {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((e) => (
                  <button
                    key={e.id}
                    className="small"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      if (e.kind !== "task") onEventClick(e);
                    }}
                    style={{
                      textAlign: "left", background: e.kind === "task" ? "transparent" : "var(--surface2)",
                      border: e.kind === "task" ? "1px dashed var(--border)" : "none",
                      borderRadius: 6, padding: "2px 5px", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", cursor: e.kind === "task" ? "default" : "pointer",
                    }}
                    title={e.kind === "task" ? `Task due: ${e.title}` : e.title}
                  >
                    {e.kind === "task" ? "◇ " : ""}{e.title}
                  </button>
                ))}
                {dayEvents.length > MAX_VISIBLE_PER_DAY && (
                  <span className="small muted">+{dayEvents.length - MAX_VISIBLE_PER_DAY} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
