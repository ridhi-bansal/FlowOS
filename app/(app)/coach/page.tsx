"use client";

import { useEffect, useState } from "react";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { useFocus } from "@/components/focus/FocusProvider";
import { whatShouldIDoNow } from "@/lib/services/whatNowService";
import { buildCoachSections, weeklyFocusSuggestions } from "@/lib/services/coachService";
import type { WhatNowRecommendation } from "@/types";

export default function CoachPage() {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { sessions } = useFocus();
  const [rec, setRec] = useState<WhatNowRecommendation | null>(null);

  useEffect(() => {
    whatShouldIDoNow(tasks, undefined).then(setRec);
  }, [tasks]);

  const sections = buildCoachSections({ tasks, projects, goals, sessions });
  const weekly = weeklyFocusSuggestions(tasks, projects, goals);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Learn</div>
          <h1 className="page-title">Productivity Coach</h1>
          <p className="sub">Local rule-based recommendations from your real task, project, goal, and focus data — no external AI is connected.</p>
        </div>
      </div>

      <div className="card coach" style={{ marginBottom: 16 }}>
        <h3>Right now</h3>
        {!rec ? (
          <p className="muted small">Thinking…</p>
        ) : (
          <>
            <div className="stat" style={{ fontSize: 20 }}>{rec.taskName}</div>
            <p className="small muted" style={{ margin: "4px 0 0" }}>{rec.reason}</p>
          </>
        )}
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        {sections.map((s) => (
          <div className="card" key={s.title}>
            <h3>{s.title}</h3>
            <div className="stack" style={{ gap: 6 }}>
              {s.lines.map((line, i) => (
                <p key={i} className="small" style={{ margin: 0 }}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>This week</h3>
        {weekly.topTasks.length === 0 && weekly.behindProjects.length === 0 && weekly.behindGoals.length === 0 ? (
          <p className="muted small">Nothing pressing on the horizon — a good week to plan ahead.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {weekly.topTasks.map((t) => (
              <p key={t.id} className="small" style={{ margin: 0 }}>• {t.name} — due {t.due_date}</p>
            ))}
            {weekly.behindProjects.map((p) => (
              <p key={p.id} className="small" style={{ margin: 0 }}>⚠ Project "{p.name}" is {p.status.replace("_", " ")}.</p>
            ))}
            {weekly.behindGoals.map((g) => (
              <p key={g.id} className="small" style={{ margin: 0 }}>⚠ Goal "{g.title}" is {g.status.replace("_", " ")}.</p>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>End of day</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Take two minutes to reflect on today — what mattered, what you avoided, what to do differently tomorrow.
        </p>
        <a href="/journal" className="ghost" style={{ display: "inline-flex" }}>Open Journal →</a>
      </div>
    </>
  );
}
