import type { CoachMode, Priority, TaskStatus, GoalHorizon, GoalStatus, CoachMemory } from "@/types";
import type { BehavioralSignal } from "./behaviorEngine";
import type {
  WorkloadCapacity,
  CurrentWindowPlanning,
  PlannedBlock,
  DayPlan,
  UserPlanningConstraints,
} from "./planningEngine";
import type {
  DailyState,
  DailyRisk,
  DailyRiskType,
  DailyOpportunity,
  DailyOpportunityType,
} from "./dailyIntelligenceEngine";
import type {
  CoachTrigger,
  CoachTriggerType,
  CoachTriggerAction,
  TriggerPriority,
} from "./proactiveEngine";
import type {
  DailyReflectionSummary,
  ReflectionObservation,
  ReflectionObservationType,
  AdaptationCandidate,
  AdaptationType,
} from "./reflectionEngine";
import type {
  CoachReview,
  ReviewPeriod,
  PriorityProgressSummary,
  PlanningRealismSummary,
  ExecutionConsistencySummary,
  AdaptationImpactSummary,
  ReviewTrend,
  ReviewTrendType,
  ReviewInsight,
} from "./reviewEngine";
import type { ExecutionState } from "./executionEngine";

export type { BehavioralSignal, BehavioralSignalType } from "./behaviorEngine";
export type {
  WorkloadCapacity,
  TaskWindowFit,
  CurrentWindowPlanning,
  PlannedBlock,
  DayPlan,
  UserPlanningConstraints,
} from "./planningEngine";
export type {
  DailyState,
  DailyRisk,
  DailyRiskType,
  DailyOpportunity,
  DailyOpportunityType,
} from "./dailyIntelligenceEngine";
export type {
  CoachTrigger,
  CoachTriggerType,
  CoachTriggerAction,
  TriggerPriority,
} from "./proactiveEngine";
export type {
  DailyReflectionSummary,
  ReflectionObservation,
  ReflectionObservationType,
  AdaptationCandidate,
  AdaptationType,
} from "./reflectionEngine";
export type {
  CoachReview,
  ReviewPeriod,
  PriorityProgressSummary,
  PlanningRealismSummary,
  ExecutionConsistencySummary,
  AdaptationImpactSummary,
  ReviewTrend,
  ReviewTrendType,
  ReviewInsight,
} from "./reviewEngine";
export type {
  ExecutionState,
  ActiveExecutionTask,
  ExecutionWindow,
  ExecutionCommitment,
  PlannedExecutionBlock,
  ExecutionRecoveryOption,
} from "./executionEngine";

export interface CompactTask {
  id: string;
  name: string;
  priority: Priority;
  due_date: string | null;       // YYYY-MM-DD
  due_time: string | null;       // HH:MM
  estimated_minutes: number;
  status: TaskStatus;
  project_name?: string;
  goal_title?: string;
  is_overdue: boolean;
  postpone_count: number;
}

export interface CompactGoal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  status: GoalStatus;
  deadline: string | null;
  why: string | null;
  obstacles: string | null;
  progress_percent: number;
}

export interface BusyBlock {
  title: string;
  start: string;                 // ISO datetime
  end: string;                   // ISO datetime
  source: "native" | "google";
  all_day: boolean;
}

export interface FreeWindow {
  start: string;                 // ISO datetime
  end: string;                   // ISO datetime
  duration_minutes: number;
}

export interface ScheduleContext {
  date: string;                  // YYYY-MM-DD
  timezone: string;
  busy_blocks: BusyBlock[];
  free_windows: FreeWindow[];
  total_free_minutes: number;
  total_busy_minutes: number;
}

export interface FocusSummary {
  completed_sessions_7d: number;
  total_focus_minutes_7d: number;
  avg_rating: number | null;
}

export interface HabitConsistency {
  total_habits: number;
  completed_today: number;
  avg_7d_rate_percent: number;
}

export interface UserOperatingContext {
  user: {
    name: string;
    timezone: string;
    persona: string | null;
    preferred_style: string | null;
    productivity_method: string | null;
  };
  now: {
    iso: string;
    date: string;                // YYYY-MM-DD
    time: string;                // HH:MM
    day_of_week: string;
  };
  schedule: ScheduleContext;
  capacity: WorkloadCapacity;
  planning: CurrentWindowPlanning;
  execution: {
    top_three: CompactTask[];
    overdue_tasks: CompactTask[];
    today_tasks: CompactTask[];
    upcoming_urgent_tasks: CompactTask[];
    stalled_or_avoided_tasks: CompactTask[];
    total_open_tasks: number;
    completed_today_count: number;
  };
  behavioral_signals: BehavioralSignal[];
  focus_summary?: FocusSummary;
  habit_consistency?: HabitConsistency;
  memory: {
    relevant: CoachMemory[];
  };
  goals: CompactGoal[];
  daily_state?: DailyState;
  day_plan?: DayPlan;
  active_triggers?: CoachTrigger[];
  reflection?: DailyReflectionSummary;
  review_summary?: CoachReview;
  execution_state?: ExecutionState;
  recent_reflection?: {
    date: string;
    mood: string | null;
    energy: string | null;
    what_mattered: string | null;
    avoided: string | null;
    postponing?: string | null;
  };
}

export interface CoachActionReceipt {
  tool: string;
  description: string;
  entityId?: string;
  status: "executed" | "requires_confirmation";
  requires_confirmation?: boolean;
  confirmation_details?: {
    action: string;
    payload: unknown;
  };
}

export interface CoachChatStreamChunk {
  type: "text" | "action" | "done" | "error";
  content?: string;
  action?: CoachActionReceipt;
  error?: string;
}
