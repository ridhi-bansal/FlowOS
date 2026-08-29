"use client";

import { useMemo, useState } from "react";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { ProjectDetailModal } from "@/components/projects/ProjectDetailModal";
import { sortProjectsByUrgency } from "@/lib/services/projectService";
import type { Project } from "@/types";

export default function ProjectsPage() {
  const { projects, loading } = useProjects();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sorted = useMemo(() => sortProjectsByUrgency(projects), [projects]);
  const visible = showArchived ? sorted : sorted.filter((p) => p.status !== "archived");

  // Keep the open detail modal's data fresh (e.g. after editing it elsewhere).
  const openedFresh = opened ? projects.find((p) => p.id === opened.id) ?? null : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Projects</h1>
          <p className="sub">{projects.filter((p) => p.status !== "archived").length} active project{projects.length === 1 ? "" : "s"}</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ New project</button>
      </div>

      {projects.some((p) => p.status === "archived") && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="ghost small" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted small">Loading projects…</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h4>No projects yet</h4>
            <p className="small">Group related tasks under a project to track progress toward something bigger.</p>
          </div>
        </div>
      ) : (
        <div className="grid g3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={setOpened} />
          ))}
        </div>
      )}

      <ProjectFormModal open={creating} onClose={() => setCreating(false)} />
      <ProjectDetailModal project={openedFresh} onClose={() => setOpened(null)} />
    </>
  );
}
