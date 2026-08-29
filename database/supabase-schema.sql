-- =========================================================
-- FlowOS — Supabase Postgres schema + Row Level Security
-- Run in the Supabase SQL editor, top to bottom, once per project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
--
-- This mirrors the TypeScript types in /types/index.ts as closely as
-- possible. Enum-like text columns get CHECK constraints matching the
-- TS union types exactly, so invalid values can't reach the database
-- even if a bug slips past the frontend.
-- =========================================================

create extension if not exists "pgcrypto";

-- Generic updated_at trigger, attached to every table below that has one.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------
-- PROFILES  (1:1 with auth.users)
-- ---------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  persona text,
  typical_schedule text,
  responsibilities text,
  problems text[] not null default '{}',
  preferred_style text,
  productivity_method text,
  onboarding_completed boolean not null default false,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  -- IANA timezone name (e.g. 'America/New_York'). Every "today"/"now" the
  -- app computes for this user should be resolved against this, not the
  -- server's or browser's ambient UTC — see lib/utils/date.ts.
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles
  for each row execute procedure set_updated_at();

-- Auto-create a profile row on signup. Timezone defaults to UTC here;
-- the client updates it to the browser's real timezone on first login
-- (see lib/auth/supabase.ts).
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------
-- AREAS
-- ---------------------------------------------------------
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#635bff',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- TAGS
-- ---------------------------------------------------------
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------
-- GOALS  (vision -> long_term -> yearly -> quarterly -> monthly)
-- ---------------------------------------------------------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_goal_id uuid references goals(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  title text not null,
  why text,
  horizon text not null default 'quarterly'
    check (horizon in ('vision', 'long_term', 'yearly', 'quarterly', 'monthly')),
  deadline date,
  success_metric text,
  -- Legacy/unused by the app: progress is derived live from linked
  -- projects + direct tasks (see lib/services/goalService.ts,
  -- goalProgress()). Never written by the frontend. Kept only in case a
  -- future manual-override UI wants it; do not treat this as authoritative.
  progress numeric not null default 0,
  status text not null default 'active'
    check (status in ('active', 'at_risk', 'behind', 'done', 'archived')),
  obstacles text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists goals_set_updated_at on goals;
create trigger goals_set_updated_at before update on goals
  for each row execute procedure set_updated_at();

-- ---------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Deleting a goal unlinks its projects (set null) rather than deleting
  -- them — see goalService.deleteGoal. Matches ON DELETE SET NULL here.
  goal_id uuid references goals(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  name text not null,
  objective text,
  deadline date,
  status text not null default 'on_track'
    check (status in ('on_track', 'at_risk', 'behind', 'done', 'archived')),
  notes text,
  color text default '#635bff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists projects_set_updated_at on projects;
create trigger projects_set_updated_at before update on projects
  for each row execute procedure set_updated_at();

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Deleting a parent task cascades to its subtasks — see
  -- taskService.deleteTask, which already does this explicitly at the
  -- app layer; ON DELETE CASCADE here makes the DB enforce the same
  -- invariant even for direct SQL/other-client deletes.
  parent_task_id uuid references tasks(id) on delete cascade,
  -- Deleting a project/goal unlinks tasks (set null) rather than deleting
  -- them — see projectService.deleteProject / goalService.deleteGoal.
  project_id uuid references projects(id) on delete set null,
  goal_id uuid references goals(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  event_id uuid,  -- fk added after events table exists, below
  name text not null,
  description text,
  status text not null default 'inbox'
    check (status in ('inbox', 'next', 'scheduled', 'waiting', 'someday', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date date,
  due_date date,
  due_time time,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes >= 0),
  actual_minutes int check (actual_minutes is null or actual_minutes >= 0),
  energy text check (energy is null or energy in ('low', 'medium', 'high')),
  context text,
  recurrence text,
  notes text,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at before update on tasks
  for each row execute procedure set_updated_at();

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id)
);

create table if not exists task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  journal_entry_id uuid,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- CALENDAR EVENTS
-- ---------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  -- 'task' is a synthetic, client-only marker kind (see
  -- lib/services/eventService.ts, taskDeadlineMarkers) derived live from
  -- tasks with a due_date — it is never written to this table, only
  -- 'event' / 'time_block' / 'focus_block' rows are ever persisted here.
  kind text not null default 'event' check (kind in ('event', 'time_block', 'focus_block')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  recurrence text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at before update on events
  for each row execute procedure set_updated_at();

alter table tasks drop constraint if exists tasks_event_id_fkey;
alter table tasks
  add constraint tasks_event_id_fkey foreign key (event_id) references events(id) on delete set null;

-- ---------------------------------------------------------
-- FOCUS SESSIONS
-- ---------------------------------------------------------
create table if not exists focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  session_goal text,
  technique text not null default 'pomodoro',
  planned_minutes int not null check (planned_minutes > 0),
  actual_minutes int check (actual_minutes is null or actual_minutes >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  rating int check (rating is null or (rating between 1 and 5)),
  reflection text,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

-- ---------------------------------------------------------
-- TIME ENTRIES
-- ---------------------------------------------------------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  category text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  check (ended_at > started_at)
);

-- ---------------------------------------------------------
-- HABITS  (definitions separate from completion records)
-- ---------------------------------------------------------
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'custom')),
  target_per_period int not null default 1 check (target_per_period > 0),
  color text default '#159570',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists habits_set_updated_at on habits;
create trigger habits_set_updated_at before update on habits
  for each row execute procedure set_updated_at();

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  -- The LOCAL calendar date (in the user's profile timezone) this
  -- completion counts for — resolved client-side via lib/utils/date.ts
  -- before being sent here. Never derive this from a server-side
  -- now()::date, which would use the server's/session's timezone instead
  -- of the user's.
  logged_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_date)
);

-- ---------------------------------------------------------
-- JOURNAL / REVIEWS
-- ---------------------------------------------------------
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Same local-date rule as habit_logs.logged_date above.
  entry_date date not null,
  mood text,
  energy text check (energy is null or energy in ('low', 'medium', 'high')),
  answers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

drop trigger if exists journal_entries_set_updated_at on journal_entries;
create trigger journal_entries_set_updated_at before update on journal_entries
  for each row execute procedure set_updated_at();

alter table attachments drop constraint if exists attachments_journal_fkey;
alter table attachments
  add constraint attachments_journal_fkey foreign key (journal_entry_id) references journal_entries(id) on delete cascade;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  answers jsonb not null default '{}',
  generated_plan jsonb,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

-- ---------------------------------------------------------
-- AI COACH (conversation history — the current Coach page is entirely
-- rule-based and doesn't use these yet; reserved for a future real-AI mode)
-- ---------------------------------------------------------
create table if not exists coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'coach'
    check (mode in ('strategist', 'executor', 'coach', 'analyst', 'minimalist', 'study_coach')),
  title text,
  created_at timestamptz not null default now()
);

create table if not exists coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references coach_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- INTEGRATIONS  (explicit states only — never fake "connected")
-- ---------------------------------------------------------
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'coming_soon', 'demo')),
  external_account_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- Every table: owner-only access via auth.uid() = user_id.
-- This is the actual security boundary — the frontend's own filtering
-- (see lib/data/remote/*) is a UX/performance nicety, not what keeps
-- User A out of User B's data. Even a compromised or buggy client can't
-- bypass this.
-- =========================================================

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles','areas','tags','goals','projects','milestones','tasks',
      'task_dependencies','task_tags','attachments','events','focus_sessions',
      'time_entries','habits','habit_logs','journal_entries','reviews',
      'coach_conversations','coach_messages','integrations','notifications'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- profiles: the owning column is "id", not "user_id"
drop policy if exists profiles_owner on profiles;
create policy profiles_owner on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Standard owner policy for every table with a user_id column
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'areas','tags','goals','projects','milestones','tasks','attachments','events',
      'focus_sessions','time_entries','habits','habit_logs','journal_entries','reviews',
      'coach_conversations','coach_messages','integrations','notifications'
    ])
  loop
    execute format('drop policy if exists %I_owner on %I;', t, t);
    execute format(
      'create policy %I_owner on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t, t
    );
  end loop;
end $$;

-- Join tables have no user_id column directly — scope through the parent task.
drop policy if exists task_dependencies_owner on task_dependencies;
create policy task_dependencies_owner on task_dependencies
  for all using (
    exists (select 1 from tasks where tasks.id = task_dependencies.task_id and tasks.user_id = auth.uid())
  ) with check (
    exists (select 1 from tasks where tasks.id = task_dependencies.task_id and tasks.user_id = auth.uid())
  );

drop policy if exists task_tags_owner on task_tags;
create policy task_tags_owner on task_tags
  for all using (
    exists (select 1 from tasks where tasks.id = task_tags.task_id and tasks.user_id = auth.uid())
  ) with check (
    exists (select 1 from tasks where tasks.id = task_tags.task_id and tasks.user_id = auth.uid())
  );

-- =========================================================
-- INDEXES
-- =========================================================
create index if not exists idx_areas_user on areas(user_id);
create index if not exists idx_tags_user on tags(user_id);
create index if not exists idx_goals_user on goals(user_id);
create index if not exists idx_goals_parent on goals(parent_goal_id);
create index if not exists idx_projects_user on projects(user_id);
create index if not exists idx_projects_goal on projects(goal_id);
create index if not exists idx_tasks_user on tasks(user_id);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_goal on tasks(goal_id);
create index if not exists idx_tasks_parent on tasks(parent_task_id);
create index if not exists idx_tasks_due on tasks(due_date);
create index if not exists idx_events_user_start on events(user_id, start_at);
create index if not exists idx_focus_sessions_user on focus_sessions(user_id, started_at);
create index if not exists idx_habits_user on habits(user_id);
create index if not exists idx_habit_logs_habit on habit_logs(habit_id, logged_date);
create index if not exists idx_habit_logs_user on habit_logs(user_id);
create index if not exists idx_time_entries_user on time_entries(user_id, started_at);
create index if not exists idx_journal_user_date on journal_entries(user_id, entry_date);
create index if not exists idx_coach_messages_conv on coach_messages(conversation_id, created_at);

-- =========================================================
-- STORAGE
-- Create these buckets manually in Supabase Dashboard > Storage:
--   - avatars      (public read, owner write)
--   - attachments  (private, owner-only via RLS below)
-- Not used by any current feature — reserved for when task/journal
-- attachments are built.
-- =========================================================
-- create policy "attachments_owner_rw" on storage.objects
--   for all using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
--   with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
