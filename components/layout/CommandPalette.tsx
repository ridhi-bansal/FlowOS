"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { GoalFormModal } from "@/components/goals/GoalFormModal";
import { HabitFormModal } from "@/components/habits/HabitFormModal";

type ModalKind = "task" | "event" | "project" | "goal" | "habit" | null;

interface StaticCommand {
  label: string;
  hint?: string;
  run: (ctx: { router: ReturnType<typeof useRouter>; openModal: (k: ModalKind) => void }) => void;
}

const STATIC_COMMANDS: StaticCommand[] = [
  { label: "Add Task", run: ({ openModal }) => openModal("task") },
  { label: "Add Event", run: ({ openModal }) => openModal("event") },
  { label: "Add Project", run: ({ openModal }) => openModal("project") },
  { label: "Add Goal", run: ({ openModal }) => openModal("goal") },
  { label: "Add Habit", run: ({ openModal }) => openModal("habit") },
  { label: "What should I do now?", hint: "Coach", run: ({ router }) => router.push("/coach") },
  { label: "Go to Dashboard", run: ({ router }) => router.push("/dashboard") },
  { label: "Go to Tasks", run: ({ router }) => router.push("/tasks") },
  { label: "Go to Calendar", run: ({ router }) => router.push("/calendar") },
  { label: "Go to Projects", run: ({ router }) => router.push("/projects") },
  { label: "Go to Goals", run: ({ router }) => router.push("/goals") },
  { label: "Go to Habits", run: ({ router }) => router.push("/habits") },
  { label: "Go to Focus", run: ({ router }) => router.push("/focus") },
  { label: "Go to Journal", run: ({ router }) => router.push("/journal") },
  { label: "Go to Analytics", run: ({ router }) => router.push("/analytics") },
  { label: "Go to Coach", run: ({ router }) => router.push("/coach") },
  { label: "Go to Settings", run: ({ router }) => router.push("/settings") },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { goals } = useGoals();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("flowos:open-command-palette", onExternalOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("flowos:open-command-palette", onExternalOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const matchedCommands = useMemo(
    () => (q ? STATIC_COMMANDS.filter((c) => c.label.toLowerCase().includes(q)) : STATIC_COMMANDS.slice(0, 8)),
    [q]
  );
  const matchedTasks = useMemo(
    () => (q ? tasks.filter((t) => !t.done && t.name.toLowerCase().includes(q)).slice(0, 5) : []),
    [q, tasks]
  );
  const matchedProjects = useMemo(
    () => (q ? projects.filter((p) => p.status !== "archived" && p.name.toLowerCase().includes(q)).slice(0, 5) : []),
    [q, projects]
  );
  const matchedGoals = useMemo(
    () => (q ? goals.filter((g) => g.status !== "archived" && g.title.toLowerCase().includes(q)).slice(0, 5) : []),
    [q, goals]
  );

  function openModal(kind: ModalKind) {
    setModal(kind);
    setOpen(false);
  }

  function runCommand(cmd: StaticCommand) {
    cmd.run({ router, openModal });
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div className="command" onClick={() => setOpen(false)}>
          <div className="command-box" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, projects, goals, or run a command…"
            />
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {matchedTasks.length > 0 && (
                <>
                  <div className="cmd-item muted small" style={{ borderBottom: "none", paddingBottom: 2 }}>Tasks</div>
                  {matchedTasks.map((t) => (
                    <div key={t.id} className="cmd-item" style={{ cursor: "pointer" }} onClick={() => { router.push("/tasks"); setOpen(false); }}>{t.name}</div>
                  ))}
                </>
              )}
              {matchedProjects.length > 0 && (
                <>
                  <div className="cmd-item muted small" style={{ borderBottom: "none", paddingBottom: 2 }}>Projects</div>
                  {matchedProjects.map((p) => (
                    <div key={p.id} className="cmd-item" style={{ cursor: "pointer" }} onClick={() => { router.push("/projects"); setOpen(false); }}>{p.name}</div>
                  ))}
                </>
              )}
              {matchedGoals.length > 0 && (
                <>
                  <div className="cmd-item muted small" style={{ borderBottom: "none", paddingBottom: 2 }}>Goals</div>
                  {matchedGoals.map((g) => (
                    <div key={g.id} className="cmd-item" style={{ cursor: "pointer" }} onClick={() => { router.push("/goals"); setOpen(false); }}>{g.title}</div>
                  ))}
                </>
              )}
              {matchedCommands.length > 0 && (
                <>
                  <div className="cmd-item muted small" style={{ borderBottom: "none", paddingBottom: 2 }}>Commands</div>
                  {matchedCommands.map((c) => (
                    <div key={c.label} className="cmd-item" style={{ cursor: "pointer" }} onClick={() => runCommand(c)}>
                      {c.label}{c.hint && <span className="muted small"> — {c.hint}</span>}
                    </div>
                  ))}
                </>
              )}
              {q && matchedTasks.length === 0 && matchedProjects.length === 0 && matchedGoals.length === 0 && matchedCommands.length === 0 && (
                <div className="cmd-item muted small">No matches.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <TaskFormModal open={modal === "task"} onClose={() => setModal(null)} />
      <EventFormModal open={modal === "event"} onClose={() => setModal(null)} />
      <ProjectFormModal open={modal === "project"} onClose={() => setModal(null)} />
      <GoalFormModal open={modal === "goal"} onClose={() => setModal(null)} />
      <HabitFormModal open={modal === "habit"} onClose={() => setModal(null)} />
    </>
  );
}
