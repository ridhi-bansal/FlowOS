"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

/**
 * Gates the authenticated app. Session lives in localStorage (see
 * lib/auth/local.ts), which only the browser can read — so unlike the
 * Supabase version of this app, route protection can't happen in
 * middleware.ts (which runs on the server/edge before any client JS has
 * run). Wrap app/(app)/layout.tsx's children in this instead.
 *
 * This is a UX convenience, same caveat as before: it stops the app from
 * *rendering* protected pages without a session, it is not a security
 * boundary — there's no server-side data to protect yet since everything
 * lives in this browser's IndexedDB.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return <div className="auth-gate-loading">Loading FlowOS…</div>;
  }
  if (!user) {
    return null;
  }
  return <>{children}</>;
}
