import { localAuth } from "./local";
import { supabaseAuth } from "./supabase";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AuthProvider } from "./types";

/**
 * The rest of the app imports `auth` from here, never from ./local or
 * ./supabase directly — same pattern as lib/data/index.ts.
 *
 * Which implementation is live is decided once, by whether Supabase env
 * vars are set (see lib/supabase/config.ts):
 *   - Not configured -> lib/auth/local.ts     (localStorage, dev/demo mode)
 *   - Configured      -> lib/auth/supabase.ts (real Supabase Auth)
 *
 * Both implement the same AuthProvider interface (lib/auth/types.ts), so
 * nothing that calls `auth.*` needs to know or care which one is active.
 */
export const auth: AuthProvider = isSupabaseConfigured() ? supabaseAuth : localAuth;

export type { AuthUser, AuthSession, AuthProvider } from "./types";
