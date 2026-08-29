"use client";

import { useEvents } from "@/components/calendar/EventsProvider";
import { useHabits } from "@/components/habits/HabitsProvider";
import { useFocus } from "@/components/focus/FocusProvider";
import { isLoggedToday } from "@/lib/services/habitService";
import { todaysSessions } from "@/lib/services/focusService";
import { mostImportantToday } from "@/lib/services/coachService";
import { useTasks } from "@/components/tasks/TasksProvider";
import { todayKey } from "@/lib/utils/date";

/** Today's schedule, sourced from the same EventsProvider the Calendar page uses. */
export function ScheduleCard() {
  const { events, loading } = useEvents();
  const today = todayKey();
  const todaysEvents = events
    .filter((e) => e.start_at.slice(0, 10) === today)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <div className="card">
      <div className="card-head">
        <h3>Today's schedule</h3>
        <a href="/calendar" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>Open calendar →</a>
      </div>
      {loading ? (
        <p className="muted small">Loading…</p>
      ) : todaysEvents.length === 0 ? (
        <p className="muted small">No events on your calendar today.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {todaysEvents.map((e) => (
            <div key={e.id} className="row between small">
              <span>{e.title}</span>
              <span className="muted">
                {new Date(e.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Focus + habit snapshot for today, combined into one card to keep the dashboard from sprawling. */
export function TodayRhythmCard() {
  const { habits, logs, loading: habitsLoading } = useHabits();
  const { sessions, loading: focusLoading } = useFocus();
  const activeHabits = habits.filter((h) => !h.archived);
  const focusedToday = todaysSessions(sessions).filter((s) => s.ended_at);
  const totalMinutes = focusedToday.reduce((sum, s) => sum + (s.actual_minutes ?? 0), 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Today's rhythm</h3>
        <a href="/focus" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>Focus →</a>
      </div>
      {focusLoading || habitsLoading ? (
        <p className="muted small">Loading…</p>
      ) : (
        <>
          <div className="kpi" style={{ marginBottom: activeHabits.length > 0 ? 14 : 0 }}>
            <div>
              <div className="stat">{totalMinutes}</div>
              <div className="muted small">focus minutes today</div>
            </div>
            <div className="muted small">{focusedToday.length} session{focusedToday.length === 1 ? "" : "s"}</div>
          </div>
          {activeHabits.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {activeHabits.slice(0, 4).map((h) => {
                const doneToday = isLoggedToday(logs, h.id);
                return (
                  <div key={h.id} className="row between small">
                    <span>{h.name}</span>
                    <span className={doneToday ? "" : "muted"}>{doneToday ? "✓" : "—"}</span>
                  </div>
                );
              })}
              {activeHabits.length > 4 && <a href="/habits" className="small muted">+{activeHabits.length - 4} more →</a>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Single most relevant coach observation, linking to the full Coach page. Real local logic, no external AI. */
export function CoachCard() {
  const { tasks } = useTasks();
  const important = mostImportantToday(tasks);

  return (
    <div className="card coach">
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="avatar">🧭</span>
        <div>
          <h3 style={{ margin: 0 }}>Productivity Coach</h3>
          <span className="small muted">Local rule-based — no external AI</span>
        </div>
      </div>
      <p className="small" style={{ margin: "0 0 10px" }}>
        {important
          ? `Most important right now: "${important.name}."`
          : "Nothing due or overdue today — a good time to plan ahead."}
      </p>
      <a href="/coach" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>Open Coach →</a>
    </div>
  );
}
