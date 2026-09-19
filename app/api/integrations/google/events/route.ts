import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/integrations/google/crypto";
import { normalizeGoogleEvent, type GoogleCalendarEventItem } from "@/lib/integrations/google/calendar";
import type { ExternalCalendarEvent } from "@/types";

// Defensive limit: Maximum allowed date range query window (100 days)
const MAX_RANGE_MS = 100 * 24 * 60 * 60 * 1000;

// Defensive limit: Maximum pages to retrieve per request (up to 1,250 events)
const MAX_PAGES = 5;

/**
 * GET /api/integrations/google/events
 *
 * Secure server-side proxy route for retrieving Google Calendar events.
 *
 * Query parameters:
 * - timeMin: ISO 8601 string (start of calendar window)
 * - timeMax: ISO 8601 string (end of calendar window)
 *
 * Security:
 * - Authenticates the FlowOS user via the existing Supabase server client.
 * - Reads and decrypts stored tokens using AES-256-GCM.
 * - Automatically refreshes expired access tokens using the stored refresh token.
 * - Updates newly refreshed tokens encrypted in Supabase.
 * - Queries the user's primary Google Calendar with defensive bounds and pagination caps.
 * - Normalizes raw Google items into safe `ExternalCalendarEvent` objects.
 * - Never leaks OAuth tokens, client secrets, or refresh tokens to client responses or logs.
 */
export async function GET(request: NextRequest) {
  // 1. Validate query parameters
  const searchParams = request.nextUrl.searchParams;
  const timeMinParam = searchParams.get("timeMin");
  const timeMaxParam = searchParams.get("timeMax");

  if (!timeMinParam || !timeMaxParam) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Missing required query parameters: both timeMin and timeMax must be specified.",
      },
      { status: 400 }
    );
  }

  const minDate = new Date(timeMinParam);
  const maxDate = new Date(timeMaxParam);

  if (isNaN(minDate.getTime()) || isNaN(maxDate.getTime())) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Invalid date format: timeMin and timeMax must be valid ISO 8601 date strings.",
      },
      { status: 400 }
    );
  }

  if (minDate.getTime() >= maxDate.getTime()) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Invalid date range: timeMin must be strictly earlier than timeMax.",
      },
      { status: 400 }
    );
  }

  if (maxDate.getTime() - minDate.getTime() > MAX_RANGE_MS) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Requested date range exceeds the maximum defensive limit of 100 days.",
      },
      { status: 400 }
    );
  }

  const timeMin = minDate.toISOString();
  const timeMax = maxDate.toISOString();

  // 2. Authenticate the FlowOS user
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "unauthorized", message: "User is not authenticated." },
      { status: 401 }
    );
  }

  // 3. Retrieve Google integration row for the authenticated user (RLS enforced)
  const { data: integration, error: dbError } = await supabase
    .from("integrations")
    .select("id, status, access_token_encrypted, refresh_token_encrypted")
    .eq("provider", "google")
    .maybeSingle();

  if (dbError) {
    return NextResponse.json(
      { error: "database_error", message: "Failed to read integration state." },
      { status: 500 }
    );
  }

  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      { error: "integration_not_connected", message: "Google Calendar integration is not connected." },
      { status: 404 }
    );
  }

  if (!integration.access_token_encrypted || !integration.refresh_token_encrypted) {
    return NextResponse.json(
      {
        error: "integration_incomplete",
        message: "Google Calendar credentials missing or incomplete. Please reconnect in Settings.",
      },
      { status: 404 }
    );
  }

  // 4. Decrypt access token
  let accessToken: string;
  try {
    accessToken = decrypt(integration.access_token_encrypted);
  } catch {
    return NextResponse.json(
      { error: "decryption_failed", message: "Failed to decrypt access token." },
      { status: 500 }
    );
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
        // Refresh token was revoked, expired, or invalid
        return null;
      }

      const tokenData = await tokenRes.json();
      const newAccessToken = tokenData.access_token;
      if (!newAccessToken) {
        return null;
      }

      // Encrypt new tokens and update row in Supabase
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
    endpoint.searchParams.set("timeMin", timeMin);
    endpoint.searchParams.set("timeMax", timeMax);
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

  // 5. Fetch events from Google Calendar with automatic 401 refresh handling
  let activeToken = accessToken;
  let initialRes: Response;
  try {
    initialRes = await fetchEventsPage(activeToken);
  } catch {
    return NextResponse.json(
      { error: "provider_unavailable", message: "Failed to contact Google Calendar service." },
      { status: 502 }
    );
  }

  // If initial request was unauthorized, attempt token refresh once
  if (initialRes.status === 401) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      return NextResponse.json(
        {
          error: "integration_unauthorized",
          message: "Google Calendar authorization has expired or been revoked. Please reconnect in Settings.",
        },
        { status: 401 }
      );
    }

    activeToken = refreshedToken;
    try {
      initialRes = await fetchEventsPage(activeToken);
    } catch {
      return NextResponse.json(
        { error: "provider_unavailable", message: "Failed to contact Google Calendar service." },
        { status: 502 }
      );
    }
  }

  // Handle Google API errors
  if (!initialRes.ok) {
    if (initialRes.status === 401) {
      return NextResponse.json(
        {
          error: "integration_unauthorized",
          message: "Google Calendar authorization has expired or been revoked. Please reconnect in Settings.",
        },
        { status: 401 }
      );
    }
    if (initialRes.status === 403) {
      return NextResponse.json(
        { error: "provider_error", message: "Google Calendar API request was rejected or rate-limited." },
        { status: 502 }
      );
    }
    if (initialRes.status === 404) {
      return NextResponse.json(
        { error: "calendar_not_found", message: "Primary Google Calendar was not found." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "provider_error", message: "Failed to retrieve events from Google Calendar." },
      { status: 502 }
    );
  }

  // 6. Collect items across paginated results (defensively bounded by MAX_PAGES)
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
        break; // Stop pagination safely if subsequent page fails
      }
      const pageData = await pageRes.json();
      if (Array.isArray(pageData.items)) {
        allRawItems.push(...pageData.items);
      }
      pageToken = pageData.nextPageToken;
    }

    // If more pages remain after reaching MAX_PAGES, signal truncation to client
    if (pageToken) {
      truncated = true;
    }
  } catch {
    return NextResponse.json(
      { error: "provider_parse_error", message: "Failed to parse Google Calendar API response." },
      { status: 502 }
    );
  }

  // 7. Normalize raw Google items into FlowOS ExternalCalendarEvent objects
  const normalizedEvents: ExternalCalendarEvent[] = [];
  for (const rawItem of allRawItems) {
    const normalized = normalizeGoogleEvent(rawItem);
    if (normalized) {
      normalizedEvents.push(normalized);
    }
  }

  // 8. Return safe JSON response
  return NextResponse.json({
    events: normalizedEvents,
    truncated,
  });
}
