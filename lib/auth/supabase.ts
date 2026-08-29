"use client";

import { createClient } from "@/lib/supabase/client";
import { detectTimezone } from "@/lib/utils/date";
import type { AuthProvider, AuthSession, AuthUser } from "./types";

/**
 * Real Supabase Auth. Passwords never touch application code — they go
 * straight to Supabase's auth server over HTTPS, same as any Supabase Auth
 * client. This file only translates between Supabase's session shape and
 * FlowOS's own AuthProvider interface (lib/auth/types.ts), so the rest of
 * the app (components/auth/AuthProvider.tsx, RequireAuth, every page that
 * reads the current user) never has to know Supabase exists.
 */

function toAuthUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
  };
}

export const supabaseAuth: AuthProvider = {
  async getSession() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return { user: toAuthUser(data.session.user) };
  },

  async signUp(email, password, fullName) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);

    // Supabase projects with "Confirm email" enabled (the default) return a
    // user but no session until the person clicks the confirmation link —
    // there is no session to hand back yet. Say so plainly rather than
    // pretending signup logged them in.
    if (!data.session) {
      throw new Error(
        "Account created. Check your email to confirm it, then log in — this Supabase project requires email confirmation before the first login."
      );
    }

    // First-time-only: seed the profile's timezone from the browser, since
    // the schema defaults every new profile to 'UTC'. Only done at signup
    // so a later manual change in Settings is never silently overwritten.
    await supabase.from("profiles").update({ timezone: detectTimezone() }).eq("id", data.session.user.id);

    return { user: toAuthUser(data.session.user) };
  },

  async login(email, password) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("Login succeeded but no session was returned — please try again.");
    return { user: toAuthUser(data.session.user) };
  },

  async logout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async requestPasswordReset(email) {
    const supabase = createClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
  },
};
