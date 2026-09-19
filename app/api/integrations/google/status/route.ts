import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/integrations/google/status
 *
 * Lightweight, safe endpoint returning the user's Google Calendar connection state.
 *
 * Security:
 * - Authenticates the FlowOS user via the existing Supabase server client.
 * - Queries only non-sensitive columns (`status`, `external_account_email`).
 * - Never returns access tokens, refresh tokens, or encryption details.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({
      connected: false,
      email: null,
    });
  }

  const { data: integration, error: dbError } = await supabase
    .from("integrations")
    .select("status, external_account_email")
    .eq("provider", "google")
    .maybeSingle();

  if (dbError || !integration) {
    return NextResponse.json({
      connected: false,
      email: null,
    });
  }

  return NextResponse.json({
    connected: integration.status === "connected",
    email: integration.external_account_email ?? null,
  });
}
