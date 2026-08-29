"use client";

import { useEffect, useState } from "react";
import { useProjects } from "./ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { Project, ProjectStatus } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
}

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "behind", label: "Behind" },
  { value: "done", label: "Done" },
];

const COLORS = ["#635bff", "#8b5cf6", "#159570", "#c88a00", "#d84b5b", "#0891b2"];

export function ProjectFormModal({ open, onClose, project }: Props) {
  const { addProject, editProject, archiveProject, removeProject } = useProjects();
  const { goals } = useGoals();
  const isEdit = !!project;

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("on_track");
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [goalId, setGoalId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setObjective(project?.objective ?? "");
    setNotes(project?.notes ?? "");
    setStatus(project?.status && project.status !== "archived" ? project.status : "on_track");
    setDeadline(project?.deadline ?? "");
    setColor(project?.color ?? COLORS[0]);
    setGoalId(project?.goal_id ?? "");
  }, [open, project]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name, objective: objective || null, notes: notes || null, status, deadline: deadline || null, color, goal_id: goalId || null };
      if (isEdit && project) {
        await editProject(project.id, payload);
      } else {
        await addProject(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!project) return;
    await archiveProject(project.id);
    onClose();
  }

  async function handleDelete() {
    if (!project) return;
    if (!window.confirm(`Delete "${project.name}"? Its tasks will be kept but unlinked from the project. This can't be undone.`)) return;
    await removeProject(project.id);
    onClose();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? "Edit project" : "New project"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label htmlFor="project-name">Name</label>
          <input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Semester Programming" />
        </div>

        <div className="field">
          <label htmlFor="project-objective">Description</label>
          <textarea id="project-objective" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What is this project trying to achieve?" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="project-status">Status</label>
            <select id="project-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="project-deadline">Deadline</label>
            <input id="project-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="project-goal">Goal</label>
          <select id="project-goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">No goal</option>
            {goals.filter((g) => g.status !== "archived").map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Color</label>
          <div className="row" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Choose color ${c}`}
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: c,
                  border: color === c ? "2px solid var(--text)" : "2px solid transparent",
                  padding: 0, cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="project-notes">Notes</label>
          <textarea id="project-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details…" />
        </div>

        <div className="modal-foot">
          {isEdit && (
            <>
              <button className="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>Delete</button>
              {project?.status !== "archived" && <button className="ghost" onClick={handleArchive}>Archive</button>}
            </>
          )}
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
