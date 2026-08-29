"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cloudMode = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signUp(email, password, fullName);
      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't create your account.";
      // Supabase mode: signUp() throws with an instructional (not error)
      // message when email confirmation is required — that's the expected
      // outcome of a successful signup, not a failure, so show it neutrally.
      if (cloudMode && message.toLowerCase().includes("check your email")) {
        setInfo(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="brand" style={{ padding: "0 0 20px" }}>
        <span className="logo">F</span> FlowOS
      </div>
      <h2 style={{ margin: "0 0 4px" }}>Create your account</h2>
      <p className="muted small" style={{ margin: "0 0 20px" }}>
        {cloudMode
          ? "Real account, backed by Supabase — your data syncs and persists in the cloud."
          : "Stored only in this browser's local storage — not a real account system yet."}
      </p>
      {info ? (
        <p className="small">{info}</p>
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field" style={{ marginBottom: 4 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password" type="password" required minLength={cloudMode ? 6 : 4}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={cloudMode ? "At least 6 characters" : "At least 4 characters"}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center", marginTop: 8 }}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
      <p className="small muted" style={{ marginTop: 18, textAlign: "center" }}>
        Already have an account? <Link href="/login" style={{ color: "var(--accent)", fontWeight: 650 }}>Log in</Link>
      </p>
    </div>
  );
}
