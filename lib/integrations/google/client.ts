import type { ExternalCalendarEvent } from "@/types";

export interface GoogleIntegrationStatus {
  connected: boolean;
  email: string | null;
}

export interface GoogleEventsResult {
  events: ExternalCalendarEvent[];
  truncated: boolean;
  error?: string | null;
}

/**
 * Retrieves the current Google Calendar connection status for the authenticated user.
 */
export async function getGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  try {
    const res = await fetch("/api/integrations/google/status");
    if (!res.ok) {
      return { connected: false, email: null };
    }
    const data = await res.json();
    return {
      connected: Boolean(data.connected),
      email: data.email ?? null,
    };
  } catch {
    return { connected: false, email: null };
  }
}

/**
 * Requests disconnection of the Google Calendar integration on the server.
 */
export async function disconnectGoogleIntegration(): Promise<boolean> {
  try {
    const res = await fetch("/api/integrations/google/disconnect", {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches read-only normalized Google Calendar events for a specific visible date range.
 *
 * @param timeMin ISO 8601 string representing the start of the visible window
 * @param timeMax ISO 8601 string representing the end of the visible window
 */
export async function fetchGoogleCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<GoogleEventsResult> {
  try {
    const url = new URL("/api/integrations/google/events", window.location.origin);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);

    const res = await fetch(url.toString());
    if (!res.ok) {
      let errCode = `HTTP_${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) errCode = String(body.error);
      } catch {
        // Ignore json parse error on non-json error responses
      }
      return {
        events: [],
        truncated: false,
        error: errCode,
      };
    }

    const data = await res.json();
    return {
      events: Array.isArray(data.events) ? data.events : [],
      truncated: Boolean(data.truncated),
      error: null,
    };
  } catch {
    return {
      events: [],
      truncated: false,
      error: "network_error",
    };
  }
}
