import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/integrations/google/disconnect
 *
 * Safely disconnects the Google Calendar integration for the authenticated user.
 *
 * Security:
 * - Authenticates the FlowOS user via the existing Supabase server client.
 * - Enforces RLS: User A can only delete their own integration record.
 * - Deletes the integration row from `integrations`, completely removing the encrypted
 *   access and refresh tokens from Postgres so they cannot be used further by FlowOS.
 * - Does not use the Supabase service-role key.
 * - Never trusts client-supplied user_id or integration_id parameters.
 */
export async function POST() {
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

  const { error: deleteError } = await supabase
    .from("integrations")
    .delete()
    .eq("provider", "google");

  if (deleteError) {
    return NextResponse.json(
      { error: "database_error", message: "Failed to disconnect Google Calendar." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  return POST();
}
