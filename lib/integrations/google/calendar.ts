import type { ExternalCalendarEvent } from "@/types";
import { addDaysToKey } from "@/lib/utils/date";

/**
 * Raw Google Calendar API Event Item shape from v3 endpoint.
 */
export interface GoogleCalendarEventItem {
  id: string;
  status?: string; // "confirmed" | "tentative" | "cancelled"
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  recurringEventId?: string;
}

/**
 * Normalizes a raw Google Calendar API event into FlowOS's safe ExternalCalendarEvent representation.
 *
 * Normalization details:
 * - Filters out cancelled events (returns null).
 * - Maps missing summary to "Untitled event".
 * - Timed events: Preserves Google's RFC 3339 / ISO 8601 strings with timezone information intact.
 * - All-day events: Google provides inclusive `start.date` and exclusive `end.date` (YYYY-MM-DD).
 *   Converts exclusive `end.date` to inclusive local day bounds (YYYY-MM-DDT23:59:59) without UTC midnight drift.
 * - Preserves event ID from Google (stable across expanded recurring occurrences when singleEvents=true).
 * - Leaves color as null (no color mapping in V1).
 * - Sets source to "google", kind to "event", and read_only to true.
 */
export function normalizeGoogleEvent(item: GoogleCalendarEventItem): ExternalCalendarEvent | null {
  // 1. Filter out cancelled events
  if (item.status === "cancelled") {
    return null;
  }

  // 2. Validate essential event ID
  if (!item.id) {
    return null;
  }

  // 3. Fallback title
  const title = item.summary?.trim() ? item.summary.trim() : "Untitled event";

  // 4. Timing normalization
  let start_at: string;
  let end_at: string;
  let all_day: boolean;

  if (item.start?.dateTime) {
    // Normal timed event (RFC 3339 timestamp with timezone offset)
    all_day = false;
    start_at = item.start.dateTime;
    end_at = item.end?.dateTime || item.start.dateTime;
  } else if (item.start?.date) {
    // All-day event (YYYY-MM-DD)
    all_day = true;
    const startDate = item.start.date;
    const rawEndDate = item.end?.date;

    // Google's all-day end.date is exclusive (e.g. 1-day event on 2026-09-19 has end.date = 2026-09-20).
    // Convert to the inclusive last date of the event.
    let inclusiveEndDate = startDate;
    if (rawEndDate && rawEndDate > startDate) {
      inclusiveEndDate = addDaysToKey(rawEndDate, -1);
    }

    // Preserve local calendar day semantics without midnight UTC conversion drift
    start_at = `${startDate}T00:00:00`;
    end_at = `${inclusiveEndDate}T23:59:59`;
  } else {
    // Malformed event with neither dateTime nor date
    return null;
  }

  return {
    id: item.id,
    source: "google",
    title,
    description: item.description ?? null,
    start_at,
    end_at,
    all_day,
    location: item.location ?? null,
    kind: "event",
    color: null,
    html_link: item.htmlLink ?? undefined,
    read_only: true,
  };
}
