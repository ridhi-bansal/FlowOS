import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGoogleCalendarEventsInternal } from "@/lib/integrations/google/calendarServer";

// Defensive limit: Maximum allowed date range query window (100 days)
const MAX_RANGE_MS = 100 * 24 * 60 * 60 * 1000;

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

  // 3. Delegate to shared server helper
  const result = await fetchGoogleCalendarEventsInternal(supabase, timeMin, timeMax);

  if (result.error) {
    return NextResponse.json(
      { error: result.error, message: result.message || "Failed to retrieve events from Google Calendar." },
      { status: result.status || 500 }
    );
  }

  // 4. Return safe JSON response
  return NextResponse.json({
    events: result.events,
    truncated: result.truncated,
  });
}
