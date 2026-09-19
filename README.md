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
lib/ai/         Server-only AI provider scaffolding (`import "server-only"`).
                Reserved for backend route handlers and external model
                providers. Client code must NOT import this module.
lib/services/   Domain logic per feature (taskService, projectService,
                goalService, eventService, habitService, focusService,
                journalService, analyticsService, coachService,
                whatNowService, migrationService) — built on lib/data,
                never on IndexedDB/Supabase directly. Coach and
                whatNowService run locally here as deterministic rule engines.
lib/supabase/   Browser/server/admin Supabase clients + isSupabaseConfigured().
lib/utils/date.ts   Timezone-correct "what day is it" helpers — see below.
lib/db/         Generic IndexedDB wrapper used by lib/data/local/*.
database/supabase-schema.sql   Full Postgres schema, RLS policies,
                constraints, and indexes. Run this in the Supabase SQL
                editor once per project to reproduce the database.
```

**The rule going forward:** UI and page code imports repositories from
`@/lib/data`, auth from `@/lib/auth`, and domain services from
`@/lib/services` — never from a `local/`, `remote/`, or `providers/`
subfolder directly.

**Important regarding AI:** Client components must **never** import from
`@/lib/ai` (it is marked `import "server-only"`). The Productivity Coach and
"What should I do now?" are client-safe, deterministic, rule-based engines
housed in `@/lib/services/coachService.ts` and `@/lib/services/whatNowService.ts`.

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
11 core feature areas (Dashboard, Tasks with subtasks, Calendar, Projects,
Goals with live progress derivation, Habits, Focus, Journal, Analytics,
Coach, and Settings), plus the global command palette (⌘K) and light/dark
theming, are built and deployed.

Cloud mode (Supabase Auth + Postgres + Row Level Security) is live on
Vercel and owner-verified for authentication, persistence, and multi-user
isolation. Local mode remains fully available for offline development.

## Documentation

This README stays high-level; deeper technical detail lives under `docs/` and root:

- `PROJECT_STATUS.md` — current state of the whole project, kept live.
- `CHANGELOG.md` — dated history of changes.
- `DEPLOYMENT.md` — developer deployment workflows, environment variable rules, and safety protocols.
- `docs/ROADMAP.md` — current priorities, what's next, what's later.
- `docs/DATABASE.md` — living reference for the Supabase schema and RLS.
- `docs/DEPLOYMENT_GUIDE.md` — beginner-friendly Supabase → GitHub → Vercel deployment walkthrough.
- `docs/TESTING_CHECKLIST.md` — manual test steps (owner-verified tests recorded).
- `docs/FLOWOS_AUDIT_REPORT.md` — point-in-time codebase audit snapshot.
- `AI_INSTRUCTIONS.md` — how future AI agents should work in this repo, including how to keep this documentation set in sync with the code.
