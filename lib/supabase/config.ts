/**
 * FlowOS runs in one of two modes, decided entirely by whether these two
 * env vars are set:
 *
 *   - Not set  -> local mode: lib/auth/local.ts + IndexedDB (lib/data/local)
 *   - Set      -> cloud mode: lib/auth/supabase.ts + Supabase (lib/data/remote)
 *
 * This is the one function both lib/auth/index.ts and lib/data/index.ts
 * check to decide which implementation to hand back. Both env vars are
 * NEXT_PUBLIC_* so they're inlined at build time and available identically
 * in server and client code — no runtime env lookup surprises.
 */
export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
