"use client";

import { useState } from "react";
import type { Task } from "@/types";
import { TaskRow } from "./TaskRow";
import { TaskFormModal } from "./TaskFormModal";
import { useTasks } from "./TasksProvider";

interface Props {
  tasks: Task[];
  emptyTitle?: string;
  emptyBody?: string;
  showProject?: boolean;
  defaultProjectId?: string | null;
}

export function TaskList({ tasks, emptyTitle = "Nothing here", emptyBody = "You're all caught up.", showProject = true, defaultProjectId = null }: Props) {
  const [editing, setEditing] = useState<Task | null>(null);
  const { tasks: allTasks } = useTasks(); // full unfiltered list, only used for subtask-progress lookups

  if (tasks.length === 0) {
    return (
      <div className="empty">
        <h4>{emptyTitle}</h4>
        <p className="small">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onEdit={setEditing} allTasks={allTasks} showProject={showProject} />
      ))}
      <TaskFormModal open={!!editing} task={editing} onClose={() => setEditing(null)} defaultProjectId={defaultProjectId} />
    </div>
  );
}
