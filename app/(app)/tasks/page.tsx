"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTasks } from "@/components/tasks/TasksProvider";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { filterByView } from "@/lib/services/taskService";
import { todayKey } from "@/lib/utils/date";

type View = "inbox" | "today" | "upcoming" | "completed";
const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "inbox", label: "Inbox" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

function TasksPageInner() {
  const { tasks, loading } = useTasks();
  const params = useSearchParams();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const view = (params.get("view") as View) || "today";

  const shown = useMemo(() => filterByView(tasks, view), [tasks, view]);

  function setView(v: View) {
    router.push(`/tasks?view=${v}`);
  }

  const emptyCopy: Record<View, { title: string; body: string }> = {
    inbox: { title: "Inbox is empty", body: "New tasks with no date land here until you triage them." },
    today: { title: "Nothing due today", body: "Add a task or check Upcoming for what's next." },
    upcoming: { title: "Nothing coming up", body: "Tasks due in the next two weeks will show here." },
    completed: { title: "No completed tasks yet", body: "Finished tasks will show up here." },
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1 className="page-title">Tasks</h1>
          <p className="sub">{tasks.filter((t) => !t.done).length} open tasks</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ Add task</button>
      </div>

      <div className="tabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`tab${view === v.key ? " active" : ""}`} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p className="muted small">Loading tasks…</p>
        ) : (
          <TaskList tasks={shown} emptyTitle={emptyCopy[view].title} emptyBody={emptyCopy[view].body} />
        )}
      </div>

      <TaskFormModal open={creating} onClose={() => setCreating(false)} defaultDueDate={view === "today" ? todayKey() : undefined} />
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="muted small">Loading tasks…</p>}>
      <TasksPageInner />
    </Suspense>
  );
}
