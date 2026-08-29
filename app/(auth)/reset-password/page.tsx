"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const router = useRouter();
  const [isRecoveryLink, setIsRecoveryLink] = useState(false);

  useEffect(() => {
    // Supabase's password-reset email links land here with `type=recovery`
    // in the URL fragment; the Supabase client auto-detects that fragment
    // on load and establishes a session from it. We just need to know
    // which form to show.
    setIsRecoveryLink(window.location.hash.includes("type=recovery"));
  }, []);

  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <h2 style={{ marginTop: 0 }}>Password reset isn't available</h2>
        <p className="small muted">
          This app is running in local-only mode (no Supabase configured), where accounts aren't real
          credentials that can be reset by email. See Settings for details.
        </p>
        <Link href="/login" style={{ color: "var(--accent)", fontWeight: 650 }}>← Back to login</Link>
      </div>
    );
  }

  return isRecoveryLink ? <SetNewPasswordForm onDone={() => router.replace("/dashboard")} /> : <RequestResetForm onRequest={requestPasswordReset} />;
}

function RequestResetForm({ onRequest }: { onRequest: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onRequest(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h2 style={{ marginTop: 0 }}>Reset your password</h2>
      {sent ? (
        <p className="small">Check <strong>{email}</strong> for a password reset link.</p>
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <div className="field">
            <label htmlFor="reset-email">Email</label>
            <input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="small muted" style={{ marginTop: 18, textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--accent)", fontWeight: 650 }}>← Back to login</Link>
      </p>
    </div>
  );
}

function SetNewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // This one direct Supabase call is unavoidable: "update the password
      // for whatever session the recovery link just established" has no
      // equivalent in local mode's AuthProvider interface, since local
      // mode has no concept of a recovery session at all.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h2 style={{ marginTop: 0 }}>Set a new password</h2>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
