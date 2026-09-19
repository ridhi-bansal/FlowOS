"use client";

import { useEffect, useMemo, useState } from "react";
import { useEvents } from "@/components/calendar/EventsProvider";
import { useTasks } from "@/components/tasks/TasksProvider";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarDayAgenda } from "@/components/calendar/CalendarDayAgenda";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { GoogleEventModal } from "@/components/calendar/GoogleEventModal";
import { taskDeadlineMarkers, dateKey as toKey } from "@/lib/services/eventService";
import { todayKey, addDaysToKey } from "@/lib/utils/date";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getGoogleIntegrationStatus, fetchGoogleCalendarEvents } from "@/lib/integrations/google/client";
import type { CalendarDisplayEvent, CalendarEvent, ExternalCalendarEvent } from "@/types";

type ViewMode = "month" | "day";

export default function CalendarPage() {
  const { events, loading } = useEvents();
  const { tasks } = useTasks();
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const cloudMode = isSupabaseConfigured();

  // Google Calendar overlay state (read-only in-memory)
  const [googleEvents, setGoogleEvents] = useState<ExternalCalendarEvent[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleTruncated, setGoogleTruncated] = useState(false);
  const [googleError, setGoogleError] = useState<"unauthorized" | "error" | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<ExternalCalendarEvent | null>(null);

  // 1. Check Google integration status (cloud mode only)
  useEffect(() => {
    if (!cloudMode) return;
    getGoogleIntegrationStatus().then((res) => {
      setGoogleConnected(res.connected);
    });
  }, [cloudMode]);

  // 2. Fetch Google events for visible month bounds when anchor or connection changes
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();

  useEffect(() => {
    if (!googleConnected) {
      setGoogleEvents([]);
      setGoogleTruncated(false);
      setGoogleError(null);
      return;
    }

    let cancelled = false;
    setGoogleError(null);

    // 42-day visible grid bounds starting from Sunday before month start
    const firstOfMonth = new Date(anchorYear, anchorMonth, 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    gridStart.setHours(0, 0, 0, 0);

    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 42);
    gridEnd.setHours(23, 59, 59, 999);

    fetchGoogleCalendarEvents(gridStart.toISOString(), gridEnd.toISOString())
      .then((res) => {
        if (cancelled) return;
        setGoogleEvents(res.events);
        setGoogleTruncated(res.truncated);
        if (res.error) {
          if (res.error === "integration_unauthorized" || res.error === "HTTP_401") {
            setGoogleError("unauthorized");
          } else if (res.error !== "integration_not_connected" && res.error !== "HTTP_404") {
            setGoogleError("error");
          }
        }
      })
      .catch(() => {
        // Safe isolation: do not disrupt native FlowOS events on failure
        if (!cancelled) {
          setGoogleEvents([]);
          setGoogleError("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [googleConnected, anchorYear, anchorMonth]);

  // 3. Compose in-memory display collection: FlowOS events + Google overlays + task deadlines
  const allWithTasks = useMemo(() => {
    const list: CalendarDisplayEvent[] = [...events];

    if (googleEvents.length > 0) {
      const seenIds = new Set<string>();
      for (const ge of googleEvents) {
        if (!seenIds.has(ge.id)) {
          seenIds.add(ge.id);
          list.push(ge);
        }
      }
    }

    list.push(...taskDeadlineMarkers(tasks));
    return list;
  }, [events, googleEvents, tasks]);

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

  function handleEventClick(e: CalendarDisplayEvent) {
    if ("source" in e && e.source === "google") {
      setSelectedGoogleEvent(e);
    } else {
      setEditing(e as CalendarEvent);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Calendar</h1>
          <p className="sub">
            {!cloudMode
              ? "Events live only in this browser — nothing is synced to Google Calendar or any other service."
              : googleConnected
              ? "Showing your FlowOS schedule with Google Calendar overlay (read-only)."
              : "Events live in your FlowOS account. Connect Google Calendar in Settings for read-only overlays."}
          </p>
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

      {googleError === "unauthorized" ? (
        <div className="small muted" style={{ marginBottom: 12 }}>
          Google Calendar authorization expired.{" "}
          <a href="/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Reconnect in Settings
          </a>{" "}
          to restore external events.
        </div>
      ) : googleError === "error" ? (
        <div className="small muted" style={{ marginBottom: 12 }}>
          Could not load Google Calendar events. FlowOS events remain available.
        </div>
      ) : null}

      {googleTruncated && (
        <div className="small muted" style={{ marginBottom: 12 }}>
          Showing first 1,250 Google events for this range. Some events may not be shown.
        </div>
      )}

      {loading ? (
        <p className="muted small">Loading calendar…</p>
      ) : mode === "month" ? (
        <div className="card">
          <CalendarMonthView
            monthAnchor={anchor}
            events={allWithTasks}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
            todayKey={todayKey()}
          />
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            ◇ dashed items are task deadlines{googleConnected ? " • G items are read-only Google Calendar events." : ", not real events — edit them from the Tasks page."}
          </p>
        </div>
      ) : (
        <CalendarDayAgenda
          dateKey={selectedDay}
          events={dayEvents}
          onEventClick={handleEventClick}
          onAddEvent={() => setCreatingFor(selectedDay)}
        />
      )}

      <EventFormModal open={!!editing} event={editing} onClose={() => setEditing(null)} />
      <EventFormModal open={!!creatingFor} defaultDate={creatingFor} onClose={() => setCreatingFor(null)} />
      <GoogleEventModal event={selectedGoogleEvent} onClose={() => setSelectedGoogleEvent(null)} />
    </>
  );
}
