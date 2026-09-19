import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/integrations/google/crypto";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Handles the OAuth 2.0 callback from Google.
 *
 * Security:
 * - Authenticates the current FlowOS user with the server Supabase client.
 * - Enforces CSRF mitigation by verifying the returned `state` against the HttpOnly cookie.
 * - Expires the state cookie immediately after verification.
 * - Exchanges the authorization code on the server — tokens never touch the client.
 * - Encrypts access and refresh tokens at rest with AES-256-GCM before writing to Supabase.
 * - Upserts the integration record under the authenticated user's ID via RLS.
 */
export async function GET(request: NextRequest) {
  // Helper to create redirect response and clear OAuth state cookie
  function redirectWithError(reason: string) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("google_error", reason);
    const response = NextResponse.redirect(url);
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // 1. Authenticate the FlowOS user
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Read parameters and check for provider errors
  const searchParams = request.nextUrl.searchParams;
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return redirectWithError(oauthError);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return redirectWithError("missing_code");
  }

  // 3. Verify CSRF state token
  const stateCookie = request.cookies.get("google_oauth_state")?.value;
  if (!state || !stateCookie || state !== stateCookie) {
    return redirectWithError("invalid_state");
  }

  // 4. Validate server environment configuration
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError("server_configuration_error");
  }

  // 5. Reconstruct the exact redirect URI used during auth initiation
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const redirectUri = configuredSiteUrl
    ? `${configuredSiteUrl}/api/integrations/google/callback`
    : new URL("/api/integrations/google/callback", request.url).toString();

  // 6. Exchange authorization code for tokens directly with Google
  let tokenData: GoogleTokenResponse;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      return redirectWithError("token_exchange_failed");
    }

    tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  } catch {
    return redirectWithError("token_exchange_network_error");
  }

  if (!tokenData.access_token) {
    return redirectWithError("missing_access_token");
  }

  // 7. Resolve the connected Google account email
  let email: string | null = null;
  if (tokenData.id_token) {
    try {
      const parts = tokenData.id_token.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        if (typeof payload.email === "string") {
          email = payload.email;
        }
      }
    } catch {
      // Best effort id_token decoding
    }
  }

  // Fallback to userinfo endpoint if id_token did not contain email
  if (!email && tokenData.access_token) {
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        if (typeof userinfo.email === "string") {
          email = userinfo.email;
        }
      }
    } catch {
      // Best effort userinfo lookup
    }
  }

  // 8. Handle refresh token resolution and encryption
  let encryptedRefreshToken: string | null = null;
  if (tokenData.refresh_token) {
    encryptedRefreshToken = encrypt(tokenData.refresh_token);
  } else {
    // If re-authorizing without a new refresh token, preserve existing encrypted refresh token
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("refresh_token_encrypted")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    encryptedRefreshToken = existingIntegration?.refresh_token_encrypted ?? null;
  }

  if (!encryptedRefreshToken) {
    return redirectWithError("missing_refresh_token");
  }

  // 9. Encrypt access token
  let encryptedAccessToken: string;
  try {
    encryptedAccessToken = encrypt(tokenData.access_token);
  } catch {
    return redirectWithError("encryption_failed");
  }

  // 10. Upsert into existing integrations table via authenticated Supabase client (RLS enforced)
  const { error: dbError } = await supabase
    .from("integrations")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
        status: "connected",
        external_account_email: email,
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (dbError) {
    return redirectWithError("database_error");
  }

  // 11. Return success redirect and clear state cookie
  const successUrl = new URL("/settings", request.url);
  successUrl.searchParams.set("google", "connected");
  const response = NextResponse.redirect(successUrl);
  response.cookies.delete("google_oauth_state");
  return response;
}
