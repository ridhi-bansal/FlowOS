"use client";

import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { ExternalCalendarEvent } from "@/types";

interface Props {
  event: ExternalCalendarEvent | null;
  onClose: () => void;
}

function formatEventTiming(event: ExternalCalendarEvent): string {
  if (event.all_day) {
    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);

    const startLabel = startDate.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Check if single day or multi-day
    if (event.start_at.slice(0, 10) === event.end_at.slice(0, 10)) {
      return `All day • ${startLabel}`;
    }

    const endLabel = endDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return `All day • ${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${endLabel}`;
  }

  const start = new Date(event.start_at);
  const end = new Date(event.end_at);

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return `${dateLabel} • ${startTime} – ${endTime}`;
}

export function GoogleEventModal({ event, onClose }: Props) {
  useEscapeToClose(Boolean(event), onClose);

  if (!event) return null;

  return (
    <div className="modal-back" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-event-title"
      >
        <div className="modal-head">
          <div style={{ minWidth: 0, paddingRight: 8 }}>
            <div style={{ marginBottom: 6 }}>
              <span className="tag" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
                Google Calendar • Read-only
              </span>
            </div>
            <h3 id="google-event-title" style={{ wordBreak: "break-word" }}>
              {event.title}
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="small muted" style={{ margin: "0 0 16px" }}>
          {formatEventTiming(event)}
        </p>

        {event.location && (
          <div className="field">
            <label>Location</label>
            <p className="small" style={{ margin: "4px 0 0" }}>{event.location}</p>
          </div>
        )}

        {event.description && (
          <div className="field">
            <label>Description</label>
            <div
              className="small muted"
              style={{
                margin: "4px 0 0",
                maxHeight: 200,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {event.description}
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>Close</button>
          {event.html_link && (
            <a
              href={event.html_link}
              target="_blank"
              rel="noopener noreferrer"
              className="secondary"
              style={{ textDecoration: "none" }}
            >
              Open in Google Calendar ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
