import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/integrations/google/crypto";
import { normalizeGoogleEvent, type GoogleCalendarEventItem } from "@/lib/integrations/google/calendar";
import type { ExternalCalendarEvent } from "@/types";

const MAX_PAGES = 5;

export interface FetchGoogleEventsResult {
  events: ExternalCalendarEvent[];
  truncated: boolean;
  error?: string;
  message?: string;
  status?: number;
}

/**
 * Server-only helper to fetch, decrypt, refresh, and normalize Google Calendar
 * events for a user over a bounded time window.
 *
 * Used by both:
 * 1. GET /api/integrations/google/events (HTTP proxy for Calendar UI overlay)
 * 2. Coach Context Engine (server-side schedule geometry & free-time calculation)
 *
 * Strict read-only guarantee:
 * - Queries only primary calendar events via GET
 * - Never modifies or creates Google Calendar events
 * - Returns in-memory normalized ExternalCalendarEvent[]
 */
export async function fetchGoogleCalendarEventsInternal(
  supabase: SupabaseClient,
  timeMinIso: string,
  timeMaxIso: string
): Promise<FetchGoogleEventsResult> {
  // 1. Retrieve Google integration row for authenticated user (RLS enforced)
  const { data: integration, error: dbError } = await supabase
    .from("integrations")
    .select("id, status, access_token_encrypted, refresh_token_encrypted")
    .eq("provider", "google")
    .maybeSingle();

  if (dbError) {
    return {
      events: [],
      truncated: false,
      error: "database_error",
      message: "Failed to read integration state.",
      status: 500,
    };
  }

  if (!integration || integration.status !== "connected") {
    return {
      events: [],
      truncated: false,
      error: "integration_not_connected",
      message: "Google Calendar integration is not connected.",
      status: 404,
    };
  }

  if (!integration.access_token_encrypted || !integration.refresh_token_encrypted) {
    return {
      events: [],
      truncated: false,
      error: "integration_incomplete",
      message: "Google Calendar credentials missing or incomplete. Please reconnect in Settings.",
      status: 404,
    };
  }

  // 2. Decrypt access token
  let accessToken: string;
  try {
    accessToken = decrypt(integration.access_token_encrypted);
  } catch {
    return {
      events: [],
      truncated: false,
      error: "decryption_failed",
      message: "Failed to decrypt access token.",
      status: 500,
    };
  }

  // Helper to refresh expired access token using stored refresh token
  async function refreshAccessToken(): Promise<string | null> {
    let refreshToken: string;
    try {
      refreshToken = decrypt(integration!.refresh_token_encrypted!);
    } catch {
      return null;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return null;
    }

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenRes.ok) {
        return null;
      }

      const tokenData = await tokenRes.json();
      const newAccessToken = tokenData.access_token;
      if (!newAccessToken) {
        return null;
      }

      const updateData: Record<string, string> = {
        access_token_encrypted: encrypt(newAccessToken),
      };

      if (tokenData.refresh_token) {
        updateData.refresh_token_encrypted = encrypt(tokenData.refresh_token);
      }

      await supabase
        .from("integrations")
        .update(updateData)
        .eq("id", integration!.id);

      return newAccessToken;
    } catch {
      return null;
    }
  }

  // Helper to fetch a page of events from Google Calendar API v3
  async function fetchEventsPage(token: string, pageToken?: string): Promise<Response> {
    const endpoint = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    endpoint.searchParams.set("timeMin", timeMinIso);
    endpoint.searchParams.set("timeMax", timeMaxIso);
    endpoint.searchParams.set("singleEvents", "true");
    endpoint.searchParams.set("orderBy", "startTime");
    endpoint.searchParams.set("maxResults", "250");
    if (pageToken) {
      endpoint.searchParams.set("pageToken", pageToken);
    }

    return fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  }

  // 3. Fetch initial page with automatic 401 retry
  let activeToken = accessToken;
  let initialRes: Response;
  try {
    initialRes = await fetchEventsPage(activeToken);
  } catch {
    return {
      events: [],
      truncated: false,
      error: "provider_unavailable",
      message: "Failed to contact Google Calendar service.",
      status: 502,
    };
  }

  if (initialRes.status === 401) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      return {
        events: [],
        truncated: false,
        error: "integration_unauthorized",
        message: "Google Calendar authorization has expired or been revoked. Please reconnect in Settings.",
        status: 401,
      };
    }

    activeToken = refreshedToken;
    try {
      initialRes = await fetchEventsPage(activeToken);
    } catch {
      return {
        events: [],
        truncated: false,
        error: "provider_unavailable",
        message: "Failed to contact Google Calendar service.",
        status: 502,
      };
    }
  }

  if (!initialRes.ok) {
    if (initialRes.status === 401) {
      return {
        events: [],
        truncated: false,
        error: "integration_unauthorized",
        message: "Google Calendar authorization has expired or been revoked. Please reconnect in Settings.",
        status: 401,
      };
    }
    if (initialRes.status === 403) {
      return {
        events: [],
        truncated: false,
        error: "provider_error",
        message: "Google Calendar API request was rejected or rate-limited.",
        status: 502,
      };
    }
    if (initialRes.status === 404) {
      return {
        events: [],
        truncated: false,
        error: "calendar_not_found",
        message: "Primary Google Calendar was not found.",
        status: 502,
      };
    }
    return {
      events: [],
      truncated: false,
      error: "provider_error",
      message: "Failed to retrieve events from Google Calendar.",
      status: 502,
    };
  }

  // 4. Collect paginated items up to MAX_PAGES
  const allRawItems: GoogleCalendarEventItem[] = [];
  let truncated = false;

  try {
    const initialData = await initialRes.json();
    if (Array.isArray(initialData.items)) {
      allRawItems.push(...initialData.items);
    }

    let pageToken = initialData.nextPageToken;
    let pageCount = 1;

    while (pageToken && pageCount < MAX_PAGES) {
      pageCount++;
      const pageRes = await fetchEventsPage(activeToken, pageToken);
      if (!pageRes.ok) {
        truncated = true;
        break;
      }
      const pageData = await pageRes.json();
      if (Array.isArray(pageData.items)) {
        allRawItems.push(...pageData.items);
      }
      pageToken = pageData.nextPageToken;
    }

    if (pageToken) {
      truncated = true;
    }
  } catch {
    return {
      events: [],
      truncated: false,
      error: "provider_parse_error",
      message: "Failed to parse Google Calendar API response.",
      status: 502,
    };
  }

  // 5. Normalize items
  const normalizedEvents: ExternalCalendarEvent[] = [];
  for (const rawItem of allRawItems) {
    const normalized = normalizeGoogleEvent(rawItem);
    if (normalized) {
      normalizedEvents.push(normalized);
    }
  }

  return {
    events: normalizedEvents,
    truncated,
  };
}
