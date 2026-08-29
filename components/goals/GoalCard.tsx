"use client";

import type { Goal } from "@/types";
import { goalProgress, HORIZON_LABEL } from "@/lib/services/goalService";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";

interface Props {
  goal: Goal;
  onOpen: (goal: Goal) => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active", at_risk: "At risk", behind: "Behind", done: "Done", archived: "Archived",
};

export function GoalCard({ goal, onOpen }: Props) {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const progress = goalProgress(projects, tasks, goal.id);

  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={() => onOpen(goal)}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="tag">{HORIZON_LABEL[goal.horizon]}</span>
        <span className="tag">{STATUS_LABEL[goal.status]}</span>
      </div>
      <h3 style={{ margin: "0 0 8px" }}>{goal.title}</h3>
      {goal.why && <p className="small muted" style={{ margin: "0 0 12px" }}>{goal.why}</p>}

      <div className="row between small" style={{ marginBottom: 6 }}>
        <span className="muted">
          {progress.total === 0
            ? "No linked projects or tasks yet"
            : `${progress.done}/${progress.total} tasks · ${progress.projectCount} project${progress.projectCount === 1 ? "" : "s"}`}
        </span>
        <span className="muted">{progress.percent}%</span>
      </div>
      <div className="progress" style={{ marginBottom: 12 }}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {goal.deadline && <span className="tag">Due {goal.deadline}</span>}
        {goal.success_metric && <span className="tag">{goal.success_metric}</span>}
        {progress.overdue > 0 && <span className="tag due-overdue">{progress.overdue} overdue</span>}
      </div>
    </div>
  );
}
