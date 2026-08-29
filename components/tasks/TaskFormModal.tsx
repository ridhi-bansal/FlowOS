"use client";

import { useEffect, useState } from "react";
import { useTasks } from "./TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { Task, Priority } from "@/types";
import type { NewTaskInput } from "@/lib/services/taskService";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pass an existing task to edit it; omit to create a new one. */
  task?: Task | null;
  /** Preselect a due date, e.g. when creating from "Add Task" on Today. */
  defaultDueDate?: string | null;
  /** Preselect a project, e.g. when creating from inside a Project's detail view. */
  defaultProjectId?: string | null;
  /** Preselect a goal directly (no project), e.g. when creating from inside a Goal's detail view. */
  defaultGoalId?: string | null;
}

const PRIORITIES: Priority[] = ["low", "medium", "high"];

export function TaskFormModal({ open, onClose, task, defaultDueDate, defaultProjectId, defaultGoalId }: Props) {
  const { addTask, editTask, removeTask, toggleComplete, tasks } = useTasks();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const isEdit = !!task;

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [status, setStatus] = useState<Task["status"]>("inbox");
  const [projectId, setProjectId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setNotes(task?.notes ?? "");
    setPriority(task?.priority ?? "medium");
    setDueDate(task?.due_date ?? defaultDueDate ?? "");
    setDueTime(task?.due_time ?? "");
    setEstimatedMinutes(task?.estimated_minutes != null ? String(task.estimated_minutes) : "");
    setStatus(task?.status ?? (defaultDueDate ? "scheduled" : "inbox"));
    setProjectId(task?.project_id ?? defaultProjectId ?? "");
    setGoalId(task?.goal_id ?? (defaultProjectId ? "" : defaultGoalId ?? ""));
    setNewSubtask("");
  }, [open, task, defaultDueDate, defaultProjectId, defaultGoalId]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  const subtasks = task ? tasks.filter((t) => t.parent_task_id === task.id) : [];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input: NewTaskInput = {
        name,
        notes: notes || null,
        priority,
        due_date: dueDate || null,
        due_time: dueTime || null,
        estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        status,
        project_id: projectId || null,
        // A task's goal comes transitively through its project once one is set,
        // so we don't persist a direct goal_id alongside a project_id — avoids
        // an orphaned-looking link and keeps goalService's rollup unambiguous.
        goal_id: projectId ? null : goalId || null,
      };
      if (isEdit && task) {
        await editTask(task.id, input as Partial<Task>);
      } else {
        await addTask(input);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm(`Delete "${task.name}"? This can't be undone.`)) return;
    await removeTask(task.id);
    onClose();
  }

  async function handleAddSubtask() {
    if (!task || !newSubtask.trim()) return;
    await addTask({ name: newSubtask, parent_task_id: task.id, priority: "medium", project_id: task.project_id });
    setNewSubtask("");
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? "Edit task" : "New task"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label htmlFor="task-name">Name</label>
          <input id="task-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What needs to get done?" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as Task["status"])}>
              <option value="inbox">Inbox</option>
              <option value="next">Next</option>
              <option value="scheduled">Scheduled</option>
              <option value="waiting">Waiting</option>
              <option value="someday">Someday</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="task-due-date">Due date</label>
            <input id="task-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="task-due-time">Due time</label>
            <input id="task-due-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="task-estimate">Estimated duration (minutes)</label>
            <input id="task-estimate" type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} placeholder="e.g. 45" />
          </div>
          <div className="field">
            <label htmlFor="task-project">Project</label>
            <select id="task-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.filter((p) => p.status !== "archived").map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-goal">Goal {projectId && <span className="muted" style={{ fontWeight: 400 }}>(inherited from project)</span>}</label>
          <select id="task-goal" value={projectId ? "" : goalId} onChange={(e) => setGoalId(e.target.value)} disabled={!!projectId}>
            <option value="">No goal</option>
            {goals.filter((g) => g.status !== "archived").map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="task-notes">Notes</label>
          <textarea id="task-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details…" />
        </div>

        {isEdit && (
          <div className="field">
            <label>Subtasks</label>
            <div className="stack" style={{ gap: 2, marginBottom: 8 }}>
              {subtasks.map((s) => (
                <div key={s.id} className="row" style={{ padding: "4px 0" }}>
                  <button
                    className={`check${s.done ? " done" : ""}`}
                    style={{ width: 16, height: 16 }}
                    onClick={() => toggleComplete(s.id)}
                    aria-label={s.done ? "Mark subtask incomplete" : "Mark subtask complete"}
                  >
                    {s.done ? "✓" : ""}
                  </button>
                  <span className={`small ${s.done ? "muted" : ""}`} style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
                  <button
                    className="icon-btn small"
                    style={{ marginLeft: "auto" }}
                    onClick={() => removeTask(s.id)}
                    aria-label="Delete subtask"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {subtasks.length === 0 && <span className="muted small">No subtasks yet.</span>}
            </div>
            <div className="row">
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add a subtask and press Enter"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubtask())}
              />
              <button className="secondary" type="button" onClick={handleAddSubtask}>Add</button>
            </div>
          </div>
        )}

        <div className="modal-foot">
          {isEdit && <button className="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>Delete</button>}
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
