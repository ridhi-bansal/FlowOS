"use client";

import { useMemo, useState } from "react";
import { useEvents } from "@/components/calendar/EventsProvider";
import { useTasks } from "@/components/tasks/TasksProvider";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarDayAgenda } from "@/components/calendar/CalendarDayAgenda";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { taskDeadlineMarkers, dateKey as toKey } from "@/lib/services/eventService";
import { todayKey, addDaysToKey } from "@/lib/utils/date";
import type { CalendarEvent } from "@/types";

type ViewMode = "month" | "day";

export default function CalendarPage() {
  const { events, loading } = useEvents();
  const { tasks } = useTasks();
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const allWithTasks = useMemo(() => [...events, ...taskDeadlineMarkers(tasks)], [events, tasks]);
  const dayEvents = useMemo(() => allWithTasks.filter((e) => toKey(e.start_at) === selectedDay), [allWithTasks, selectedDay]);

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function shiftMonth(delta: number) {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }
  function goToday() {
    const t = new Date();
    setAnchor(t);
    setSelectedDay(todayKey());
  }
  function handleDayClick(key: string) {
    setSelectedDay(key);
    setMode("day");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Calendar</h1>
          <p className="sub">Events live only in this browser — nothing is synced to Google Calendar or any other service.</p>
        </div>
        <button className="primary" onClick={() => setCreatingFor(mode === "day" ? selectedDay : todayKey())}>+ Add event</button>
      </div>

      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0, border: "none" }}>
          <button className={`tab${mode === "month" ? " active" : ""}`} onClick={() => setMode("month")}>Month</button>
          <button className={`tab${mode === "day" ? " active" : ""}`} onClick={() => setMode("day")}>Day</button>
        </div>
        {mode === "month" ? (
          <div className="row">
            <button className="ghost small" onClick={() => shiftMonth(-1)}>←</button>
            <span style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>{monthLabel}</span>
            <button className="ghost small" onClick={() => shiftMonth(1)}>→</button>
            <button className="ghost small" onClick={goToday}>Today</button>
          </div>
        ) : (
          <div className="row">
            <button className="ghost small" onClick={() => setSelectedDay((d) => addDaysToKey(d, -1))}>← Prev day</button>
            <button className="ghost small" onClick={goToday}>Today</button>
            <button className="ghost small" onClick={() => setSelectedDay((d) => addDaysToKey(d, 1))}>Next day →</button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted small">Loading calendar…</p>
      ) : mode === "month" ? (
        <div className="card">
          <CalendarMonthView
            monthAnchor={anchor}
            events={allWithTasks}
            onDayClick={handleDayClick}
            onEventClick={setEditing}
            todayKey={todayKey()}
          />
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            ◇ dashed items are task deadlines, not real events — edit them from the Tasks page.
          </p>
        </div>
      ) : (
        <CalendarDayAgenda
          dateKey={selectedDay}
          events={dayEvents}
          onEventClick={setEditing}
          onAddEvent={() => setCreatingFor(selectedDay)}
        />
      )}

      <EventFormModal open={!!editing} event={editing} onClose={() => setEditing(null)} />
      <EventFormModal open={!!creatingFor} defaultDate={creatingFor} onClose={() => setCreatingFor(null)} />
    </>
  );
}
