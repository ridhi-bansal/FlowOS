"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cloudMode = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace(params.get("redirectTo") || "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="brand" style={{ padding: "0 0 20px" }}>
        <span className="logo">F</span> FlowOS
      </div>
      <h2 style={{ margin: "0 0 4px" }}>Welcome back</h2>
      <p className="muted small" style={{ margin: "0 0 20px" }}>
        {cloudMode
          ? "Signed in with your FlowOS account."
          : "This account exists only in this browser — see Settings for details on FlowOS's local-only mode."}
      </p>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="error-text">{error}</p>}
        {cloudMode && (
          <p className="small" style={{ margin: 0, textAlign: "right" }}>
            <Link href="/reset-password" style={{ color: "var(--accent)" }}>Forgot password?</Link>
          </p>
        )}
        <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center", marginTop: 8 }}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 18, textAlign: "center" }}>
        No account yet? <Link href="/signup" style={{ color: "var(--accent)", fontWeight: 650 }}>Create one</Link>
      </p>
    </div>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-card">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
