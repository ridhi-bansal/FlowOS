import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

/**
 * Initiates the Google OAuth 2.0 flow for Google Calendar integration.
 *
 * Security:
 * - Requires an active, authenticated FlowOS Supabase session.
 * - Generates a 32-byte cryptographically secure random `state` token for CSRF protection.
 * - Stores `state` in an HttpOnly, Secure, SameSite=Lax cookie with a 10-minute expiration.
 * - Requests the minimum scopes necessary: read-only calendar events and account email.
 */
export async function GET(request: NextRequest) {
  // 1. Authenticate the user against Supabase session
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Validate server configuration
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/settings?google_error=missing_client_id", request.url)
    );
  }

  // 3. Determine redirect URI based on environment
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const redirectUri = configuredSiteUrl
    ? `${configuredSiteUrl}/api/integrations/google/callback`
    : new URL("/api/integrations/google/callback", request.url).toString();

  // 4. Generate cryptographically secure state for CSRF mitigation
  const state = crypto.randomBytes(32).toString("hex");

  // 5. Construct Google OAuth URL with minimal read-only scopes
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", scopes);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");
  googleAuthUrl.searchParams.set("state", state);

  // 6. Set HttpOnly cookie and redirect
  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
