"use client";

import { useMemo } from "react";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { useTasks } from "@/components/tasks/TasksProvider";
import { projectProgress, sortProjectsByUrgency } from "@/lib/services/projectService";
import { goalProgress, sortGoalsByUrgency } from "@/lib/services/goalService";

/** Replaces the old separate ActiveProjectsCard/ActiveGoalsCard with one compact card, per "avoid excessive cards." */
export function ProgressCard() {
  const { projects, loading: pLoading } = useProjects();
  const { goals, loading: gLoading } = useGoals();
  const { tasks } = useTasks();

  const topProjects = useMemo(
    () => sortProjectsByUrgency(projects.filter((p) => p.status !== "archived" && p.status !== "done")).slice(0, 2),
    [projects]
  );
  const topGoals = useMemo(
    () => sortGoalsByUrgency(goals.filter((g) => g.status !== "archived" && g.status !== "done")).slice(0, 2),
    [goals]
  );

  if (pLoading || gLoading) {
    return <div className="card"><p className="muted small">Loading…</p></div>;
  }
  if (topProjects.length === 0 && topGoals.length === 0) {
    return (
      <div className="card">
        <div className="card-head"><h3>Progress</h3></div>
        <p className="muted small">No active projects or goals yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Progress</h3>
        <a href="/goals" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>View all →</a>
      </div>
      <div className="stack">
        {topGoals.map((g) => {
          const p = goalProgress(projects, tasks, g.id);
          return (
            <div key={g.id}>
              <div className="row between small" style={{ marginBottom: 6 }}>
                <span>🎯 {g.title}</span>
                <span className="muted">{p.percent}%</span>
              </div>
              <div className="progress"><span style={{ width: `${p.percent}%` }} /></div>
            </div>
          );
        })}
        {topProjects.map((proj) => {
          const p = projectProgress(tasks, proj.id);
          return (
            <div key={proj.id}>
              <div className="row between small" style={{ marginBottom: 6 }}>
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: proj.color ?? "var(--accent)" }} />
                  {proj.name}
                </span>
                <span className="muted">{p.percent}%</span>
              </div>
              <div className="progress"><span style={{ width: `${p.percent}%`, background: proj.color ?? undefined }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
