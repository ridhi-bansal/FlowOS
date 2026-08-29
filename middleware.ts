import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase auth session cookie on every request, required by
 * @supabase/ssr for server components to see an up-to-date session — but
 * ONLY when Supabase is actually configured. In local mode (no env vars
 * set), this is a complete no-op and every request passes straight
 * through, so local-only dev/demo behavior is unchanged from before
 * Supabase was wired up.
 *
 * This does not gate routes (unlike the old pre-local-auth version of this
 * file) — route protection for both modes lives client-side in
 * components/auth/RequireAuth.tsx, since local-mode sessions live in
 * localStorage, which middleware can't read. Supabase mode could add
 * server-side route gating here later, but keeping one gating mechanism
 * for both modes avoids two different auth-redirect code paths to keep in
 * sync.
 */
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
