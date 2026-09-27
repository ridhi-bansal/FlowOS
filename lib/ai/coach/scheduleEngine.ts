import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGoogleCalendarEventsInternal } from "@/lib/integrations/google/calendarServer";
import type { BusyBlock, FreeWindow, ScheduleContext } from "./types";
import type { CalendarEvent } from "@/types";

/**
 * Builds deterministic schedule geometry for the AI Coach:
 * - Ingests native FlowOS events from Supabase
 * - Ingests Google Calendar read-only overlay
 * - Merges overlapping busy intervals
 * - Calculates remaining free discretionary windows
 * - Never modifies or writes Google Calendar events
 */
export async function buildScheduleContext(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
  now: Date = new Date()
): Promise<ScheduleContext> {
  // 1. Resolve today's date in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKey = formatter.format(now); // YYYY-MM-DD

  // Define local day bounds
  const dayStart = new Date(`${dateKey}T00:00:00`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999`);

  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  // 2. Parallel fetch native events and Google Calendar events
  const [{ data: nativeEventsData }, googleRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_at, end_at, kind")
      .eq("user_id", userId)
      .gte("start_at", dayStartIso)
      .lte("start_at", dayEndIso),
    fetchGoogleCalendarEventsInternal(supabase, dayStartIso, dayEndIso).catch(() => ({
      events: [],
      truncated: false,
    })),
  ]);

  const nativeEvents: CalendarEvent[] = (nativeEventsData as CalendarEvent[]) || [];
  const googleEvents = googleRes.events || [];

  // 3. Normalize into BusyBlock collection
  const busyBlocks: BusyBlock[] = [];

  for (const e of nativeEvents) {
    busyBlocks.push({
      title: e.title,
      start: e.start_at,
      end: e.end_at || e.start_at,
      source: "native",
      all_day: false,
    });
  }

  for (const ge of googleEvents) {
    busyBlocks.push({
      title: ge.title,
      start: ge.start_at,
      end: ge.end_at,
      source: "google",
      all_day: ge.all_day,
    });
  }

  // Sort by start time
  busyBlocks.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // 4. Calculate non-overlapping busy intervals for timed events
  interface TimeInterval {
    startMs: number;
    endMs: number;
  }

  const timedIntervals: TimeInterval[] = busyBlocks
    .filter((b) => !b.all_day)
    .map((b) => ({
      startMs: Math.max(dayStart.getTime(), new Date(b.start).getTime()),
      endMs: Math.min(dayEnd.getTime(), new Date(b.end).getTime()),
    }))
    .filter((i) => i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const mergedBusy: TimeInterval[] = [];
  for (const interval of timedIntervals) {
    if (mergedBusy.length === 0) {
      mergedBusy.push({ ...interval });
    } else {
      const prev = mergedBusy[mergedBusy.length - 1];
      if (interval.startMs <= prev.endMs) {
        prev.endMs = Math.max(prev.endMs, interval.endMs);
      } else {
        mergedBusy.push({ ...interval });
      }
    }
  }

  const totalBusyMinutes = mergedBusy.reduce(
    (acc, curr) => acc + Math.round((curr.endMs - curr.startMs) / 60000),
    0
  );

  // 5. Compute free windows during waking / active hours (08:00 to 22:00)
  const wakingStart = new Date(`${dateKey}T08:00:00`).getTime();
  const wakingEnd = new Date(`${dateKey}T22:00:00`).getTime();
  const activeStartMs = Math.max(wakingStart, now.getTime());

  const freeWindows: FreeWindow[] = [];
  let cursorMs = activeStartMs;

  for (const busy of mergedBusy) {
    if (busy.endMs <= cursorMs) continue;

    if (busy.startMs > cursorMs) {
      const gapEnd = Math.min(busy.startMs, wakingEnd);
      if (gapEnd > cursorMs) {
        const durationMinutes = Math.round((gapEnd - cursorMs) / 60000);
        if (durationMinutes >= 15) {
          freeWindows.push({
            start: new Date(cursorMs).toISOString(),
            end: new Date(gapEnd).toISOString(),
            duration_minutes: durationMinutes,
          });
        }
      }
    }
    cursorMs = Math.max(cursorMs, busy.endMs);
    if (cursorMs >= wakingEnd) break;
  }

  if (cursorMs < wakingEnd) {
    const durationMinutes = Math.round((wakingEnd - cursorMs) / 60000);
    if (durationMinutes >= 15) {
      freeWindows.push({
        start: new Date(cursorMs).toISOString(),
        end: new Date(wakingEnd).toISOString(),
        duration_minutes: durationMinutes,
      });
    }
  }

  const totalFreeMinutes = freeWindows.reduce((acc, curr) => acc + curr.duration_minutes, 0);

  return {
    date: dateKey,
    timezone,
    busy_blocks: busyBlocks,
    free_windows: freeWindows,
    total_free_minutes: totalFreeMinutes,
    total_busy_minutes: totalBusyMinutes,
  };
}
