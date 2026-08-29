"use client";

import { useState } from "react";
import type { Project } from "@/types";
import { useTasks } from "@/components/tasks/TasksProvider";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { ProjectFormModal } from "./ProjectFormModal";
import { tasksForProject, projectProgress } from "@/lib/services/projectService";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";

interface Props {
  project: Project | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track", at_risk: "At risk", behind: "Behind", done: "Done", archived: "Archived",
};

export function ProjectDetailModal({ project, onClose }: Props) {
  const { tasks } = useTasks();
  const [editingProject, setEditingProject] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  useEscapeToClose(!!project, onClose);

  if (!project) return null;

  const projectTasks = tasksForProject(tasks, project.id);
  const open = projectTasks.filter((t) => !t.done);
  const completed = projectTasks.filter((t) => t.done);
  const progress = projectProgress(tasks, project.id);

  return (
    <>
      <div className="modal-back" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
          <div className="modal-head">
            <div className="row" style={{ gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: project.color ?? "var(--accent)" }} />
              <h3 style={{ margin: 0 }}>{project.name}</h3>
              <span className="tag">{STATUS_LABEL[project.status]}</span>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {project.objective && <p className="small muted" style={{ marginTop: -8 }}>{project.objective}</p>}

          <div className="row between small" style={{ marginBottom: 6 }}>
            <span className="muted">{progress.done}/{progress.total} tasks complete</span>
            <span className="muted">{progress.percent}%</span>
          </div>
          <div className="progress" style={{ marginBottom: 14 }}>
            <span style={{ width: `${progress.percent}%`, background: project.color ?? undefined }} />
          </div>

          <div className="row" style={{ gap: 6, marginBottom: 16 }}>
            {project.deadline && <span className="tag">Due {project.deadline}</span>}
            {progress.overdue > 0 && <span className="tag due-overdue">{progress.overdue} overdue</span>}
            {progress.upcoming > 0 && <span className="tag">{progress.upcoming} upcoming</span>}
            <button className="ghost small" style={{ marginLeft: "auto" }} onClick={() => setEditingProject(true)}>Edit project</button>
          </div>

          {project.notes && (
            <div className="field">
              <label>Notes</label>
              <p className="small" style={{ margin: 0 }}>{project.notes}</p>
            </div>
          )}

          <div className="row between" style={{ margin: "18px 0 8px" }}>
            <h4 style={{ margin: 0 }}>Tasks</h4>
            <button className="ghost small" onClick={() => setAddingTask(true)}>+ Add task</button>
          </div>
          <TaskList
            tasks={open}
            showProject={false}
            defaultProjectId={project.id}
            emptyTitle="No open tasks"
            emptyBody="Add a task to start tracking work on this project."
          />

          {completed.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Completed ({completed.length})</h4>
              <TaskList tasks={completed} showProject={false} defaultProjectId={project.id} />
            </>
          )}

          <div className="modal-foot">
            <button className="ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      <ProjectFormModal
        open={editingProject}
        project={project}
        onClose={() => {
          setEditingProject(false);
          onClose(); // the underlying project object may have changed (or been deleted) — force a fresh open next time
        }}
      />
      <TaskFormModal open={addingTask} onClose={() => setAddingTask(false)} defaultProjectId={project.id} />
    </>
  );
}
