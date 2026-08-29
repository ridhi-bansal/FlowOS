"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CalendarEvent } from "@/types";
import * as eventService from "@/lib/services/eventService";
import type { NewEventInput } from "@/lib/services/eventService";

interface EventsContextValue {
  events: CalendarEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  addEvent: (input: NewEventInput) => Promise<CalendarEvent>;
  editEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

/**
 * Same pattern as components/tasks/TasksProvider.tsx: one shared in-memory
 * copy of events, backed by lib/services/eventService (which sits on
 * lib/data's IndexedDB repository). Dashboard's schedule preview and the
 * Calendar page both read from this so they never drift apart.
 */
export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await eventService.listAllEvents();
    setEvents(all);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addEvent = useCallback(
    async (input: NewEventInput) => {
      const created = await eventService.createEvent(input);
      await refresh();
      return created;
    },
    [refresh]
  );

  const editEvent = useCallback(
    async (id: string, patch: Partial<CalendarEvent>) => {
      await eventService.updateEvent(id, patch);
      await refresh();
    },
    [refresh]
  );

  const removeEvent = useCallback(
    async (id: string) => {
      await eventService.deleteEvent(id);
      await refresh();
    },
    [refresh]
  );

  return (
    <EventsContext.Provider value={{ events, loading, refresh, addEvent, editEvent, removeEvent }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents(): EventsContextValue {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents must be used inside <EventsProvider>");
  return ctx;
}
