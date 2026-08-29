"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTasks } from "@/components/tasks/TasksProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { useGoals } from "@/components/goals/GoalsProvider";
import { useFocus } from "@/components/focus/FocusProvider";
import { useHabits } from "@/components/habits/HabitsProvider";
import {
  completionsLast7Days, focusMinutesLast7Days, taskStats, mostPostponedTasks,
  generateInsights, habitConsistency,
} from "@/lib/services/analyticsService";

export default function AnalyticsPage() {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { sessions } = useFocus();
  const { habits, logs } = useHabits();

  const stats = taskStats(tasks);
  const completions = completionsLast7Days(tasks);
  const focusMinutes = focusMinutesLast7Days(sessions);
  const postponed = mostPostponedTasks(tasks);
  const insights = generateInsights({ tasks, projects, goals, sessions });
  const habitRates = habitConsistency(habits, logs);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Track</div>
          <h1 className="page-title">Analytics</h1>
          <p className="sub">Derived entirely from your local data — no external service involved.</p>
        </div>
      </div>

      <div className="card coach" style={{ marginBottom: 16 }}>
        <h3>What the data shows</h3>
        <div className="stack" style={{ gap: 8 }}>
          {insights.map((line, i) => (
            <p key={i} className="small" style={{ margin: 0 }}>• {line}</p>
          ))}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="kpi"><div><div className="stat">{stats.total}</div><div className="muted small">tracked tasks</div></div></div></div>
        <div className="card"><div className="kpi"><div><div className="stat">{stats.completionRate}%</div><div className="muted small">completion rate</div></div></div></div>
        <div className="card"><div className="kpi"><div><div className="stat">{stats.overdue}</div><div className="muted small">overdue</div></div></div></div>
        <div className="card"><div className="kpi"><div><div className="stat">{stats.avgEstimatedMinutes ?? "—"}</div><div className="muted small">avg est. minutes</div></div></div></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Tasks completed (last 7 days)</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={completions}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Focus minutes (last 7 days)</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={focusMinutes}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#159570" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Most postponed tasks</h3>
          {postponed.length === 0 ? (
            <p className="muted small">Nothing's been pushed back more than once — good sign.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {postponed.map((p) => (
                <div key={p.task.id} className="row between small">
                  <span>{p.task.name}</span>
                  <span className="tag">{p.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Habit consistency (7 days)</h3>
          {habitRates.length === 0 ? (
            <p className="muted small">No habits tracked yet.</p>
          ) : (
            <div className="stack">
              {habitRates.map(({ habit, rate }) => (
                <div key={habit.id}>
                  <div className="row between small" style={{ marginBottom: 4 }}>
                    <span>{habit.name}</span>
                    <span className="muted">{rate}%</span>
                  </div>
                  <div className="progress"><span style={{ width: `${rate}%`, background: habit.color ?? undefined }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
