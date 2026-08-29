import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * ONLY use this for trusted server-side operations that must cross user
 * boundaries by design (e.g. an internal cron job, a Stripe webhook). It
 * must never be imported into any file that a Client Component can reach,
 * and it must never receive user-supplied filters without an explicit
 * user_id check — RLS won't save you here.
 *
 * Guarded by the `server-only` package: importing this from client code
 * fails the build instead of failing silently in production.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
