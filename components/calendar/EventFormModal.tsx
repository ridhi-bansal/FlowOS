"use client";

import { useEffect, useState } from "react";
import { useEvents } from "./EventsProvider";
import { dateKey, todayKey } from "@/lib/utils/date";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { CalendarEvent } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  /** Preselect a date, e.g. clicking a day cell in month view. */
  defaultDate?: string | null;
}

function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    // Was `d.toISOString().slice(0, 10)` — the UTC date, which could be a
    // different calendar day than the local hours/minutes below whenever
    // the event's time is near midnight. Use the local date instead so
    // the date and time shown always agree.
    date: dateKey(d),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}
function combine(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function EventFormModal({ open, onClose, event, defaultDate }: Props) {
  const { addEvent, editEvent, removeEvent } = useEvents();
  const isEdit = !!event;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<CalendarEvent["kind"]>("event");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      const s = splitDateTime(event.start_at);
      const e = splitDateTime(event.end_at);
      setTitle(event.title);
      setDate(s.date);
      setStartTime(s.time);
      setEndTime(e.time);
      setLocation(event.location ?? "");
      setNotes(event.notes ?? "");
      setKind(event.kind);
    } else {
      setTitle("");
      setDate(defaultDate ?? todayKey());
      setStartTime("09:00");
      setEndTime("10:00");
      setLocation("");
      setNotes("");
      setKind("event");
    }
  }, [open, event, defaultDate]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim() || !date) return;
    const start_at = combine(date, startTime);
    const end_at = combine(date, endTime);
    if (end_at <= start_at) {
      setError("End time needs to be after the start time.");
      return;
    }
    setSaving(true);
    try {
      const payload = { title, start_at, end_at, location: location || null, notes: notes || null, kind };
      if (isEdit && event) {
        await editEvent(event.id, payload);
      } else {
        await addEvent(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    if (!window.confirm(`Delete "${event.title}"? This can't be undone.`)) return;
    await removeEvent(event.id);
    onClose();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? "Edit event" : "New event"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label htmlFor="event-title">Title</label>
          <input id="event-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chemistry lecture" />
        </div>

        <div className="field">
          <label htmlFor="event-date">Date</label>
          <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="event-start">Start time</label>
            <input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="event-end">End time</label>
            <input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="event-kind">Type</label>
          <select id="event-kind" value={kind} onChange={(e) => setKind(e.target.value as CalendarEvent["kind"])}>
            <option value="event">Event</option>
            <option value="time_block">Time block</option>
            <option value="focus_block">Focus block</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="event-location">Location</label>
          <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
        </div>

        <div className="field">
          <label htmlFor="event-notes">Notes</label>
          <textarea id="event-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details…" />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-foot">
          {isEdit && <button className="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>Delete</button>}
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
