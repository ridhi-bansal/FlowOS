export type Priority = "low" | "medium" | "high";
export type TaskStatus = "inbox" | "next" | "scheduled" | "waiting" | "someday" | "completed";
export type ProjectStatus = "on_track" | "at_risk" | "behind" | "done" | "archived";
export type GoalHorizon = "vision" | "long_term" | "yearly" | "quarterly" | "monthly";
export type GoalStatus = "active" | "at_risk" | "behind" | "done" | "archived";
export type IntegrationStatus = "not_connected" | "connected" | "coming_soon" | "demo";
export type CoachMode = "strategist" | "executor" | "coach" | "analyst" | "minimalist" | "study_coach";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  persona: string | null;
  typical_schedule: string | null;
  responsibilities: string | null;
  problems: string[];
  preferred_style: string | null;
  productivity_method: string | null;
  onboarding_completed: boolean;
  theme: "light" | "dark";
  timezone: string;
}

export interface Task {
  id: string;
  user_id: string;
  parent_task_id: string | null;
  project_id: string | null;
  goal_id: string | null;
  area_id: string | null;
  event_id: string | null;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  energy: "low" | "medium" | "high" | null;
  context: string | null;
  recurrence: string | null;
  notes: string | null;
  done: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  goal_id: string | null;
  area_id: string | null;
  name: string;
  objective: string | null;
  deadline: string | null;
  status: ProjectStatus;
  notes: string | null;
  color: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Goal {
  id: string;
  user_id: string;
  parent_goal_id: string | null;
  area_id: string | null;
  title: string;
  why: string | null;
  horizon: GoalHorizon;
  deadline: string | null;
  success_metric: string | null;
  /** Legacy manual field, superseded by the derived rollup in goalService.goalProgress. Kept for schema compatibility. */
  progress: number;
  status: GoalStatus;
  obstacles: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  frequency: "daily" | "weekly" | "custom";
  target_per_period: number;
  color: string;
  archived: boolean;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  logged_date: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  kind: "event" | "time_block" | "focus_block" | "task";
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
}

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  session_goal: string | null;
  technique: string;
  planned_minutes: number;
  actual_minutes: number | null;
  started_at: string;
  ended_at: string | null;
  rating: number | null;
  reflection: string | null;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  task_id: string | null;
  category: string;
  started_at: string;
  ended_at: string;
  notes: string | null;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  mood: string | null;
  energy: string | null;
  answers: Record<string, string>;
}

export interface Integration {
  id: string;
  user_id: string;
  provider: string;
  status: IntegrationStatus;
  external_account_email: string | null;
  connected_at: string | null;
}

export interface CoachMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/** Output shape for the "What Should I Do Now?" AI feature. */
export interface WhatNowRecommendation {
  taskId: string | null;
  taskName: string;
  minutes: number;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export interface Area {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export interface Milestone {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  done: boolean;
}

export interface CoachConversation {
  id: string;
  user_id: string;
  mode: CoachMode;
  title: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  kind: "daily" | "weekly" | "monthly";
  period_start: string;
  period_end: string;
  answers: Record<string, string>;
  generated_plan: unknown;
}

/** Output shape for natural-language task parsing, pre-confirmation. */
export interface ParsedTaskDraft {
  name: string;
  due_date: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
  priority: Priority;
  ambiguous: boolean;
  clarification_question: string | null;
}
