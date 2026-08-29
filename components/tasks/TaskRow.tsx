"use client";

import type { Task } from "@/types";
import { useTasks } from "./TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { isOverdue, isDueToday, subtaskProgress } from "@/lib/services/taskService";

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  /** Full unfiltered task list, used only to compute subtask progress (e.g. "1/3"). */
  allTasks?: Task[];
  /** Set false when already inside that project's own view, where the tag would be redundant. */
  showProject?: boolean;
}

function formatDue(task: Task): { label: string; cls: string } | null {
  if (!task.due_date) return null;
  if (isOverdue(task)) return { label: `Overdue · ${task.due_date}`, cls: "due-overdue" };
  if (isDueToday(task)) return { label: task.due_time ? `Today · ${task.due_time}` : "Today", cls: "due-today" };
  return { label: task.due_date, cls: "" };
}

export function TaskRow({ task, onEdit, allTasks, showProject = true }: Props) {
  const { toggleComplete } = useTasks();
  const { projects } = useProjects();
  const due = formatDue(task);
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : null;
  const subtasks = allTasks ? subtaskProgress(allTasks, task.id) : null;

  return (
    <div className="task">
      <button
        className={`check${task.done ? " done" : ""}`}
        onClick={() => toggleComplete(task.id)}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
      >
        {task.done ? "✓" : ""}
      </button>
      <div className="task-main" onClick={() => onEdit(task)} style={{ cursor: "pointer" }}>
        <div className={`task-name${task.done ? " done" : ""}`}>{task.name}</div>
        <div className="task-meta">
          <span className={`tag priority-${task.priority}`}>{task.priority}</span>
          {due && <span className={`tag ${due.cls}`}>{due.label}</span>}
          {task.estimated_minutes && <span className="tag">{task.estimated_minutes} min</span>}
          {task.status && task.status !== "completed" && <span className="tag">{task.status}</span>}
          {showProject && project && (
            <span className="tag" style={{ borderColor: project.color ?? undefined }}>
              {project.color && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: project.color, marginRight: 5 }} />}
              {project.name}
            </span>
          )}
          {subtasks && subtasks.total > 0 && (
            <span className="tag">{subtasks.done}/{subtasks.total} subtasks</span>
          )}
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-btn small" onClick={() => onEdit(task)} aria-label="Edit task">✎</button>
      </div>
    </div>
  );
}
