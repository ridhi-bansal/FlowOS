"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getGoogleIntegrationStatus,
  disconnectGoogleIntegration,
  type GoogleIntegrationStatus,
} from "@/lib/integrations/google/client";

export function GoogleCalendarCard() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleIntegrationStatus>({
    connected: false,
    email: null,
  });
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check URL parameters for redirect outcomes from OAuth callback
    const errorParam = searchParams.get("google_error");
    const successParam = searchParams.get("google");

    if (errorParam) {
      if (errorParam === "access_denied") {
        setErrorMessage("Connection was cancelled in Google.");
      } else {
        setErrorMessage("Could not connect to Google Calendar. Please try again.");
      }
    } else if (successParam === "connected") {
      setSuccessMessage("Google Calendar connected successfully.");
    }

    // Fetch live status from server
    getGoogleIntegrationStatus()
      .then((res) => {
        setStatus(res);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchParams]);

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Google Calendar from FlowOS? Your events will no longer appear on the calendar.")) {
      return;
    }
    setDisconnecting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const ok = await disconnectGoogleIntegration();
      if (ok) {
        setStatus({ connected: false, email: null });
        setSuccessMessage("Google Calendar disconnected.");
      } else {
        setErrorMessage("Failed to disconnect Google Calendar. Please try again.");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="card" style={{ gridColumn: "span 2" }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Google Calendar</h3>
        {status.connected && <span className="tag" style={{ color: "var(--accent)" }}>Connected</span>}
      </div>

      {loading ? (
        <p className="small muted" style={{ margin: "0 0 12px" }}>Checking connection…</p>
      ) : status.connected ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Your primary Google Calendar events are displayed as read-only overlays in the FlowOS Calendar.
          </p>
          {status.email && (
            <div className="row small" style={{ gap: 8 }}>
              <span className="muted">Connected account:</span>
              <span style={{ fontWeight: 600 }}>{status.email}</span>
            </div>
          )}
          {successMessage && <p className="small" style={{ color: "var(--green)", margin: 0 }}>{successMessage}</p>}
          {errorMessage && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{errorMessage}</p>}
          <div>
            <button
              className="ghost small"
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{ color: "var(--red)" }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Connect your primary Google Calendar to see your schedule alongside FlowOS tasks and time blocks. Events appear as a read-only overlay and FlowOS will never modify or delete anything on your Google Calendar.
          </p>
          {errorMessage && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{errorMessage}</p>}
          {successMessage && <p className="small" style={{ color: "var(--green)", margin: 0 }}>{successMessage}</p>}
          <div>
            <a
              href="/api/integrations/google/auth"
              className="primary"
              style={{ textDecoration: "none" }}
            >
              Connect Google Calendar
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
