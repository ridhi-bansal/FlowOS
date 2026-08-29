/**
 * ============================================================================
 * DATE / TIMEZONE UTILITIES
 * ============================================================================
 * The bug this file exists to fix: `new Date().toISOString().slice(0, 10)`
 * gives the date in UTC, not the user's local date. For anyone west of UTC,
 * that's already "tomorrow" for several hours every evening — which is
 * exactly why a habit like "Morning Run" could appear logged against the
 * wrong day. This pattern was used in 15 files across the app; all of them
 * now import `todayKey()` (or `dateKeyInTimezone()`) from here instead of
 * doing it inline.
 *
 * Two different needs, two different functions:
 *   - todayKey() — "what calendar day is it right now, for a person looking
 *     at their own screen." Uses the browser's ambient local timezone via
 *     plain Date getters (getFullYear/getMonth/getDate), which are always
 *     already in local time — no toISOString() involved at all. This is
 *     correct for the common case (a person uses FlowOS from one place).
 *   - dateKeyInTimezone() / formatInTimezone() — for turning an already-
 *     stored UTC timestamp (e.g. from Supabase, which stores everything as
 *     timestamptz/UTC) into the date/time it represents in a *specific*
 *     IANA timezone (profile.timezone), for when that's not necessarily the
 *     viewer's own current timezone (e.g. rendering server-side, or a
 *     stored session from before a timezone change).
 * ============================================================================
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's date (YYYY-MM-DD) in whatever timezone the current runtime considers local. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The YYYY-MM-DD date-key for an arbitrary local Date object (not UTC-shifted). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The YYYY-MM-DD date a given instant falls on within a specific IANA
 * timezone — use this when converting a stored UTC timestamp for a
 * specific user whose profile.timezone may differ from the current
 * runtime's local zone.
 */
export function dateKeyInTimezone(instant: Date | string, timezone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/** Formats a stored UTC timestamp for display in a specific timezone. */
export function formatInTimezone(
  instant: Date | string,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: timezone }).format(d);
}

/** Adds N days to a YYYY-MM-DD key and returns a new YYYY-MM-DD key, all in local time (no UTC drift). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateKey(dt);
}

/** Best-effort guess at the browser's IANA timezone, for seeding a new profile. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
