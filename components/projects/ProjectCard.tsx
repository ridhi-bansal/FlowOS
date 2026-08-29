"use client";

import type { Project } from "@/types";
import { projectProgress } from "@/lib/services/projectService";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useGoals } from "@/components/goals/GoalsProvider";

interface Props {
  project: Project;
  onOpen: (project: Project) => void;
}

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track", at_risk: "At risk", behind: "Behind", done: "Done", archived: "Archived",
};

export function ProjectCard({ project, onOpen }: Props) {
  const { tasks } = useTasks();
  const { goals } = useGoals();
  const progress = projectProgress(tasks, project.id);
  const goal = project.goal_id ? goals.find((g) => g.id === project.goal_id) : null;

  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={() => onOpen(project)}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: project.color ?? "var(--accent)", flex: "none" }} />
          <h3 style={{ margin: 0 }}>{project.name}</h3>
        </div>
        <span className="tag">{STATUS_LABEL[project.status]}</span>
      </div>

      {project.objective && <p className="small muted" style={{ margin: "0 0 12px" }}>{project.objective}</p>}
      {goal && <p className="small muted" style={{ margin: "0 0 12px" }}>🎯 {goal.title}</p>}

      <div className="row between small" style={{ marginBottom: 6 }}>
        <span className="muted">{progress.done}/{progress.total} tasks</span>
        <span className="muted">{progress.percent}%</span>
      </div>
      <div className="progress" style={{ marginBottom: 12 }}>
        <span style={{ width: `${progress.percent}%`, background: project.color ?? undefined }} />
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {project.deadline && <span className="tag">Due {project.deadline}</span>}
        {progress.overdue > 0 && <span className="tag due-overdue">{progress.overdue} overdue</span>}
        {progress.upcoming > 0 && <span className="tag">{progress.upcoming} upcoming</span>}
      </div>
    </div>
  );
}
