"use client";

import { CoachChat } from "@/components/coach/CoachChat";

export default function CoachPage() {
  return (
    <>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="eyebrow">Intelligence</div>
          <h1 className="page-title">Productivity Coach</h1>
          <p className="sub">
            Your personal intelligence layer — grounded in your real tasks, commitments, and calendar schedule.
          </p>
        </div>
      </div>

      {/* Unified Coach Operating Experience: NOW -> TODAY -> COACH -> REFLECT -> REVIEW */}
      <CoachChat />
    </>
  );
}
