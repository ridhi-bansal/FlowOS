"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getStoredTheme, applyTheme, type Theme } from "@/lib/services/themeService";
import { resetAllLocalData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { preflightMigration, migrateLocalDataToSupabase, type MigrationPreflight, type MigrationResult } from "@/lib/services/migrationService";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const cloudMode = isSupabaseConfigured();

  function handleTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
  }

  async function handleReset() {
    const message = cloudMode
      ? "Clear FlowOS data cached in this browser's local storage? This does NOT touch your cloud account — only leftover local/pre-import data on this device. This can't be undone."
      : "Reset all local FlowOS data on this device? This deletes every task, project, goal, event, habit, focus session, and journal entry you've created. This can't be undone.";
    if (!window.confirm(message)) return;
    setResetting(true);
    try {
      await resetAllLocalData();
      setResetDone(true);
      window.setTimeout(() => window.location.reload(), 1200);
    } finally {
      setResetting(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">System</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Appearance</h3>
          <div className="chips">
            <button className={`chip-btn${theme === "light" ? " active" : ""}`} onClick={() => handleTheme("light")}>Light</button>
            <button className={`chip-btn${theme === "dark" ? " active" : ""}`} onClick={() => handleTheme("dark")}>Dark</button>
          </div>
        </div>

        <div className="card">
          <h3>Account</h3>
          <p className="small" style={{ margin: "0 0 4px" }}>{user?.full_name || "—"}</p>
          <p className="small muted" style={{ margin: "0 0 14px" }}>{user?.email}</p>
          {cloudMode && (
            <p className="small muted" style={{ margin: "0 0 14px" }}>
              Password resets go through email — see <a href="/reset-password" style={{ color: "var(--accent)" }}>Reset password</a>.
            </p>
          )}
          <button className="ghost small" onClick={handleLogout}>Log out</button>
        </div>

        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>About {cloudMode ? "your data" : "local mode"}</h3>
          {cloudMode ? (
            <>
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                FlowOS is connected to Supabase. Your account, tasks, projects, goals, calendar, habits, focus
                sessions, and journal entries are stored in a Postgres database and protected by Row Level
                Security — only you can read or write your own data, enforced by the database itself, not just
                this app.
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                The Productivity Coach and "What should I do now?" use local rule-based logic over your real
                data — no external AI service is connected in this build.
              </p>
            </>
          ) : (
            <>
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                FlowOS currently runs entirely in this browser. Your account, tasks, projects, goals, calendar,
                habits, focus sessions, and journal entries are stored in this browser's local storage and IndexedDB —
                nothing is sent to a server or synced anywhere. Clearing your browser's site data, or opening FlowOS
                in a different browser or device, starts fresh.
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                The Productivity Coach and "What should I do now?" use local rule-based logic over your real data —
                no external AI service is connected in this build.
              </p>
            </>
          )}
        </div>

        {cloudMode && <ImportLocalDataCard />}

        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>{cloudMode ? "Reset local data" : "Reset demo data"}</h3>
          <p className="small muted" style={{ margin: "0 0 12px" }}>
            {cloudMode
              ? "Clears anything cached in this browser's local storage. Your cloud account and data are never touched by this."
              : "Permanently deletes everything stored in this browser and reseeds the original demo account on next load."}
          </p>
          <button className="danger" onClick={handleReset} disabled={resetting || resetDone}>
            {resetDone ? "Reset — reloading…" : resetting ? "Resetting…" : cloudMode ? "Reset local data" : "Reset all local data"}
          </button>
        </div>
      </div>
    </>
  );
}

type ImportStep = "idle" | "checking" | "checked" | "importing" | "done";

function ImportLocalDataCard() {
  const [step, setStep] = useState<ImportStep>("idle");
  const [preflight, setPreflight] = useState<MigrationPreflight | null>(null);
  const [confirmDespiteExisting, setConfirmDespiteExisting] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setStep("checking");
    setError(null);
    try {
      const pf = await preflightMigration();
      setPreflight(pf);
      setStep("checked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check for local data.");
      setStep("idle");
    }
  }

  async function handleImport() {
    setStep("importing");
    setError(null);
    try {
      const res = await migrateLocalDataToSupabase();
      setResult(res);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStep("checked");
    }
  }

  const blockedByExistingData = preflight?.cloudAlreadyHasData && !confirmDespiteExisting;

  return (
    <div className="card" style={{ gridColumn: "span 2" }}>
      <h3>Import local data</h3>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        If this browser has FlowOS data from before you connected Supabase (or from local/demo mode), you can
        import it into your account. This never deletes the local copy — safe to check any time.
      </p>

      {step === "idle" && (
        <button className="secondary" onClick={handleCheck}>Check for local data</button>
      )}

      {step === "checking" && <p className="small muted">Checking…</p>}

      {(step === "checked" || step === "importing") && preflight && (
        <div className="stack">
          {!preflight.hasLocalData ? (
            <p className="small muted">No local data found in this browser — nothing to import.</p>
          ) : (
            <>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {Object.entries(preflight.localCounts)
                  .filter(([, n]) => n > 0)
                  .map(([key, n]) => (
                    <span key={key} className="tag">{n} {key}</span>
                  ))}
              </div>
              {preflight.cloudAlreadyHasData && (
                <div className="field" style={{ marginTop: 8 }}>
                  <p className="small" style={{ color: "var(--red)", margin: "0 0 8px" }}>
                    Your account already has data in the cloud ({Object.entries(preflight.cloudCounts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ")}).
                    Importing will add the local items alongside what's already there — it won't overwrite or
                    remove anything, but you may end up with duplicates if you've already imported before.
                  </p>
                  <label className="row small" style={{ cursor: "pointer" }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={confirmDespiteExisting} onChange={(e) => setConfirmDespiteExisting(e.target.checked)} />
                    Import anyway
                  </label>
                </div>
              )}
              <button className="primary" onClick={handleImport} disabled={blockedByExistingData || step === "importing"} style={{ marginTop: 8 }}>
                {step === "importing" ? "Importing…" : "Import to my account"}
              </button>
            </>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>Import complete.</p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {Object.entries(result.imported).filter(([, n]) => n > 0).map(([key, n]) => (
              <span key={key} className="tag">{n} {key} imported</span>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div>
              <p className="small" style={{ color: "var(--red)", margin: "8px 0 4px" }}>Some tables had errors:</p>
              {result.errors.map((e, i) => <p key={i} className="small muted" style={{ margin: 0 }}>{e}</p>)}
            </div>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
