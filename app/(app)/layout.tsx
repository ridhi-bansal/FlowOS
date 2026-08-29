import { RequireAuth } from "@/components/auth/RequireAuth";
import { TasksProvider } from "@/components/tasks/TasksProvider";
import { EventsProvider } from "@/components/calendar/EventsProvider";
import { ProjectsProvider } from "@/components/projects/ProjectsProvider";
import { GoalsProvider } from "@/components/goals/GoalsProvider";
import { HabitsProvider } from "@/components/habits/HabitsProvider";
import { FocusProvider } from "@/components/focus/FocusProvider";
import { JournalProvider } from "@/components/journal/JournalProvider";
import { AppShell } from "@/components/layout/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <TasksProvider>
        <EventsProvider>
          <ProjectsProvider>
            <GoalsProvider>
              <HabitsProvider>
                <FocusProvider>
                  <JournalProvider>
                    <AppShell>{children}</AppShell>
                  </JournalProvider>
                </FocusProvider>
              </HabitsProvider>
            </GoalsProvider>
          </ProjectsProvider>
        </EventsProvider>
      </TasksProvider>
    </RequireAuth>
  );
}
