"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { auth, type AuthUser } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    auth.getSession().then((session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    // Demo data (see lib/data/seed.ts) is local and separate from any
    // account — seeding it doesn't depend on being logged in.
    seedIfEmpty();
    return () => {
      mounted = false;
    };
  }, []);

  // Local mode's session only ever changes through the signUp/login/logout
  // calls below, so an event listener isn't needed there. Supabase mode is
  // different: a session can appear or change outside those calls — e.g.
  // clicking an email confirmation link, a password-reset magic link
  // landing on /reset-password, or a background token refresh — so it
  // needs its own listener to stay in sync. Dynamically imported so the
  // Supabase browser client is never even loaded in local mode.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    import("@/lib/supabase/client").then(({ createClient }) => {
      if (!mounted) return;
      const supabase = createClient();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(
          session?.user
            ? { id: session.user.id, email: session.user.email ?? "", full_name: (session.user.user_metadata?.full_name as string) ?? null }
            : null
        );
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const session = await auth.signUp(email, password, fullName);
    setUser(session.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await auth.login(email, password);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await auth.requestPasswordReset(email);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signUp, login, logout, requestPasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
