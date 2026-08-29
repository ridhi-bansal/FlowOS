# FlowOS

A Personal Productivity Operating System — Next.js/TypeScript. Dashboard,
Tasks, Calendar, Projects, Goals, Habits, Focus, Journal, Analytics, and a
local rule-based Productivity Coach, all connected through one shared data
layer.

## Two modes, one codebase

FlowOS runs in either mode below, decided entirely by whether Supabase env
vars are set — no code changes needed to switch:

- **Local mode** (default, no setup): data in the browser's IndexedDB
  (`lib/data/local/`), auth in localStorage (`lib/auth/local.ts`, not real
  security — don't use a real password). Nothing leaves the browser.
- **Cloud mode** (set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`):
  real accounts via Supabase Auth, data in Postgres, protected by Row
  Level Security enforced by the database itself. See
  `database/supabase-schema.sql` for the schema and
  `lib/services/migrationService.ts` (surfaced in Settings) for a one-time,
  explicit, non-destructive import of local data into a cloud account.

Nothing here fakes a connection that isn't real. The AI layer follows the
same rule: the Productivity Coach and "What should I do now?" run local,
deterministic, rule-based logic over your real data
(`lib/services/coachService.ts`, `whatNowService.ts`) — no external AI API
is called by default. A real-model path exists behind `AI_PROVIDER=anthropic`
(see `.env.example`) for a currently-unused natural-language task parser.

## Architecture

```
lib/data/       Repository<T> interface + the ONLY import point for data
                access (lib/data/index.ts). Switches IndexedDB (local/) vs
                Supabase (remote/) per-entity based on env config.
lib/auth/       Same pattern for auth: AuthProvider interface, local vs
                Supabase implementation, single swap point (index.ts).
lib/ai/         Same pattern for AI: mock provider (default) vs a real
                Anthropic-backed provider via AI_PROVIDER env var.
lib/services/   Domain logic per feature (taskService, projectService,
                goalService, eventService, habitService, focusService,
                journalService, analyticsService, coachService,
                whatNowService, migrationService) — built on lib/data,
                never on IndexedDB/Supabase directly.
lib/supabase/   Browser/server/admin Supabase clients + isSupabaseConfigured().
lib/utils/date.ts   Timezone-correct "what day is it" helpers — see below.
lib/db/         Generic IndexedDB wrapper used by lib/data/local/*.
database/supabase-schema.sql   Full Postgres schema, RLS policies,
                constraints, and indexes. Run this in the Supabase SQL
                editor once per project to reproduce the database.
```

**The rule going forward:** UI and page code imports repositories from
`@/lib/data`, auth from `@/lib/auth`, and AI functions from `@/lib/ai` —
never from a `local/`, `remote/`, or `providers/` subfolder directly.

### Timezone handling

`new Date().toISOString().slice(0, 10)` — a pattern that used to appear
throughout this codebase — returns the **UTC** date, not the viewer's local
date, which caused habits/tasks/events to shift to the wrong day for
anyone not in UTC. `lib/utils/date.ts` provides the correct local-date
helpers (`todayKey()`, `dateKey()`, `dateKeyInTimezone()`,
`formatInTimezone()`); every date computation in the app now goes through
these instead.

## Run locally

```bash
npm install
npm run dev
```

No environment variables are required for local mode. For cloud mode, copy
`.env.example` to `.env.local`, fill in your Supabase project's URL/anon
key (Supabase dashboard → Settings → API), and run the SQL in
`database/supabase-schema.sql` against that project first.

## What's implemented

See `PROJECT_STATUS.md` for the current checkpoint in detail, including
what's genuinely verified vs. only statically checked. Short version: all
of Dashboard, Tasks (with subtasks), Calendar, Projects, Goals (the full
GOAL → PROJECT → TASK chain, progress derived live), Habits, Focus,
Journal, Analytics, Coach, Settings, and a global command palette (⌘K) are
built. Supabase Auth + Postgres + RLS + local-data import are implemented
as of this session but not yet run against a live project.
