"use client";

import { useMemo, useState } from "react";
import { useTasks } from "@/components/tasks/TasksProvider";
import { resolveTop3, setTop3Selection, isOverdue, isDueToday, isUpcoming, isTopLevel } from "@/lib/services/taskService";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { useEscapeToClose } from "@/lib/hooks/useEscapeToClose";
import type { Task } from "@/types";

export function TopThreeCard() {
  const { tasks, toggleComplete } = useTasks();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [version, setVersion] = useState(0); // bumped to re-read localStorage selection

  const top3 = useMemo(() => resolveTop3(tasks), [tasks, version]);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Today's Top 3</h3>
        <button className="ghost small" onClick={() => setPickerOpen(true)}>Choose</button>
      </div>
      {top3.length === 0 ? (
        <div className="empty">
          <h4>No priorities set</h4>
          <p className="small">Add a task or choose your top 3 for today.</p>
        </div>
      ) : (
        <div className="stack">
          {top3.map((t) => (
            <div className="task" key={t.id} style={{ padding: "8px 0" }}>
              <button className={`check${t.done ? " done" : ""}`} onClick={() => toggleComplete(t.id)} aria-label="Toggle complete">
                {t.done ? "✓" : ""}
              </button>
              <div className="task-main" onClick={() => setEditing(t)} style={{ cursor: "pointer" }}>
                <div className={`task-name${t.done ? " done" : ""}`}>{t.name}</div>
                <div className="task-meta">
                  <span className={`tag priority-${t.priority}`}>{t.priority}</span>
                  {t.estimated_minutes && <span className="tag">{t.estimated_minutes} min</span>}
                  {t.due_date && <span className={`tag ${isOverdue(t) ? "due-overdue" : isDueToday(t) ? "due-today" : ""}`}>{t.due_date}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskFormModal open={!!editing} task={editing} onClose={() => setEditing(null)} />
      {pickerOpen && (
        <Top3Picker
          tasks={tasks.filter((t) => isTopLevel(t) && !t.done && (isDueToday(t) || isOverdue(t) || isUpcoming(t, 7)))}
          initial={top3.map((t) => t.id)}
          onClose={() => setPickerOpen(false)}
          onSave={(ids) => {
            setTop3Selection(ids);
            setVersion((v) => v + 1);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Top3Picker({
  tasks, initial, onClose, onSave,
}: { tasks: Task[]; initial: string[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(initial);

  useEscapeToClose(true, onClose);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <h3>Choose today's top 3</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {tasks.length === 0 ? (
          <p className="muted small">No open tasks due soon to choose from — add a task first.</p>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            {tasks.map((t) => (
              <label key={t.id} className="row" style={{ padding: "8px 4px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={selected.includes(t.id)}
                  disabled={!selected.includes(t.id) && selected.length >= 3}
                  onChange={() => toggle(t.id)}
                />
                <span style={{ flex: 1 }}>{t.name}</span>
                <span className={`tag priority-${t.priority}`}>{t.priority}</span>
              </label>
            ))}
          </div>
        )}
        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(selected)}>Save top 3</button>
        </div>
      </div>
    </div>
  );
}
