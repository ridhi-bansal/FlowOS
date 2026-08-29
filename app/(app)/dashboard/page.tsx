"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTasks } from "@/components/tasks/TasksProvider";
import { filterByView } from "@/lib/services/taskService";
import { TaskList } from "@/components/tasks/TaskList";
import { TopThreeCard } from "@/components/dashboard/TopThreeCard";
import { WhatNowCard } from "@/components/dashboard/WhatNowCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { ProgressCard } from "@/components/dashboard/ProgressCard";
import { ScheduleCard, TodayRhythmCard, CoachCard } from "@/components/dashboard/DashboardCards";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { tasks, loading } = useTasks();

  const todayTasks = useMemo(() => filterByView(tasks, "today"), [tasks]);
  const upcomingTasks = useMemo(() => filterByView(tasks, "upcoming").slice(0, 5), [tasks]);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const firstName = (user?.full_name || user?.email || "there").split(" ")[0].split("@")[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{today}</div>
          <h1 className="page-title">{greeting()}, {firstName}.</h1>
          <p className="sub">
            {loading ? "Loading your day…" : `${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} need attention today.`}
          </p>
        </div>
      </div>

      <div className="dash-grid">
        <div className="span-8">
          <div className="stack">
            <TopThreeCard />

            <div className="card">
              <div className="card-head">
                <h3>Due today &amp; overdue</h3>
                <a href="/tasks?view=today" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>View all →</a>
              </div>
              <TaskList tasks={todayTasks} emptyTitle="Nothing due today" emptyBody="Enjoy the clear day, or pull something in from Upcoming." />
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Upcoming</h3>
                <a href="/tasks?view=upcoming" style={{ fontSize: 13, fontWeight: 650, color: "var(--accent)" }}>View all →</a>
              </div>
              <TaskList tasks={upcomingTasks} emptyTitle="Nothing on the horizon" emptyBody="Tasks due in the next two weeks will show here." />
            </div>

            <ScheduleCard />
          </div>
        </div>

        <div className="span-4">
          <div className="stack">
            <WhatNowCard />
            <ProgressCard />
            <CoachCard />
            <QuickActions />
            <TodayRhythmCard />
            <RecentActivityCard />
          </div>
        </div>
      </div>
    </>
  );
}
