"use client";

import { useState } from "react";
import type { Goal } from "@/types";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { GoalFormModal } from "./GoalFormModal";
import { goalProgress, projectsForGoal, directTasksForGoal, HORIZON_LABEL } from "@/lib/services/goalService";
import { projectProgress } from "@/lib/services/projectService";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";

interface Props {
  goal: Goal | null;
  onClose: () => void;
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  on_track: "On track", at_risk: "At risk", behind: "Behind", done: "Done", archived: "Archived",
};

export function GoalDetailModal({ goal, onClose }: Props) {
  const { tasks } = useTasks();
  const { projects, editProject } = useProjects();
  const [editingGoal, setEditingGoal] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [linkingProject, setLinkingProject] = useState("");

  useEscapeToClose(!!goal, onClose);

  if (!goal) return null;

  const progress = goalProgress(projects, tasks, goal.id);
  const linkedProjects = projectsForGoal(projects, goal.id);
  const directTasks = directTasksForGoal(tasks, goal.id);
  const unlinkedProjects = projects.filter((p) => p.goal_id !== goal.id && p.status !== "archived");

  async function handleLinkProject() {
    if (!linkingProject) return;
    await editProject(linkingProject, { goal_id: goal!.id });
    setLinkingProject("");
  }

  return (
    <>
      <div className="modal-back" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
          <div className="modal-head">
            <div className="row" style={{ gap: 8 }}>
              <span className="tag">{HORIZON_LABEL[goal.horizon]}</span>
              <h3 style={{ margin: 0 }}>{goal.title}</h3>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {goal.why && <p className="small muted" style={{ marginTop: -8 }}>{goal.why}</p>}

          <div className="row between small" style={{ marginBottom: 6 }}>
            <span className="muted">{progress.done}/{progress.total} tasks complete across {progress.projectCount} project{progress.projectCount === 1 ? "" : "s"}</span>
            <span className="muted">{progress.percent}%</span>
          </div>
          <div className="progress" style={{ marginBottom: 14 }}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="row" style={{ gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {goal.deadline && <span className="tag">Due {goal.deadline}</span>}
            {goal.success_metric && <span className="tag">{goal.success_metric}</span>}
            {progress.overdue > 0 && <span className="tag due-overdue">{progress.overdue} overdue</span>}
            <button className="ghost small" style={{ marginLeft: "auto" }} onClick={() => setEditingGoal(true)}>Edit goal</button>
          </div>

          {goal.obstacles && (
            <div className="field">
              <label>Obstacles</label>
              <p className="small" style={{ margin: 0 }}>{goal.obstacles}</p>
            </div>
          )}

          <div className="row between" style={{ margin: "18px 0 8px" }}>
            <h4 style={{ margin: 0 }}>Projects</h4>
            {unlinkedProjects.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <select value={linkingProject} onChange={(e) => setLinkingProject(e.target.value)} style={{ width: 180 }}>
                  <option value="">Link a project…</option>
                  {unlinkedProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button className="ghost small" onClick={handleLinkProject} disabled={!linkingProject}>Link</button>
              </div>
            )}
          </div>
          {linkedProjects.length === 0 ? (
            <p className="muted small">No projects linked yet. Link one above, or set this goal from a project's edit form.</p>
          ) : (
            <div className="stack" style={{ gap: 10, marginBottom: 8 }}>
              {linkedProjects.map((p) => {
                const pp = projectProgress(tasks, p.id);
                return (
                  <div key={p.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color ?? "var(--accent)" }} />
                      {p.name}
                      <span className="tag">{PROJECT_STATUS_LABEL[p.status]}</span>
                    </span>
                    <span className="row" style={{ gap: 10 }}>
                      <span className="muted">{pp.done}/{pp.total} · {pp.percent}%</span>
                      <button className="icon-btn small" onClick={() => editProject(p.id, { goal_id: null })} aria-label="Unlink project">✕</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="row between" style={{ margin: "18px 0 8px" }}>
            <h4 style={{ margin: 0 }}>Direct tasks <span className="muted small">(not under a project)</span></h4>
            <button className="ghost small" onClick={() => setAddingTask(true)}>+ Add task</button>
          </div>
          <TaskList
            tasks={directTasks}
            showProject={false}
            emptyTitle="No direct tasks"
            emptyBody="Tasks that ladder straight up to this goal without a project go here."
          />

          <div className="modal-foot">
            <button className="ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      <GoalFormModal
        open={editingGoal}
        goal={goal}
        onClose={() => {
          setEditingGoal(false);
          onClose();
        }}
      />
      <TaskFormModal open={addingTask} onClose={() => setAddingTask(false)} defaultGoalId={goal.id} />
    </>
  );
}
