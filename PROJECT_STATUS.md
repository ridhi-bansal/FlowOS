# PROJECT_STATUS.md

Last updated: Documentation and production-verification alignment pass.
Vercel deployment is live and Supabase is live in production running in cloud
mode. Supabase authentication, cloud persistence, and multi-tenant User A vs.
User B data isolation have been manually tested and verified in production by
the project owner. Local mode remains fully available and functional for offline
development. TypeScript compilation (0 errors) and Next.js production build
(18 routes generated) have been verified statically by the AI agent.

## Related documentation

This file is the current-state summary. For other angles on the project:
`README.md` (intro/setup), `CHANGELOG.md` (dated history), `docs/ROADMAP.md`
(what's next and why), `docs/DATABASE.md` (living schema reference),
`docs/FLOWOS_AUDIT_REPORT.md` (point-in-time audit snapshot),
`docs/DEPLOYMENT_GUIDE.md` (beginner setup guide), `DEPLOYMENT.md` (developer
rules & safety), `docs/TESTING_CHECKLIST.md` (test procedures).
`AI_INSTRUCTIONS.md` defines how all of these are meant to be kept in sync as
the app changes.

## Current checkpoint

**All 11 planned feature areas are built and deployed**: Dashboard, Tasks
(incl. subtasks), Calendar, Projects, Goals, Habits, Focus, Journal,
Analytics, Coach, Settings — plus a global command palette (⌘K) and theme
switching. The app runs in one of two modes:

- **Local mode** (no env vars set): IndexedDB + localStorage (for local/offline development).
- **Cloud mode** (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set):
  Supabase Auth + Postgres, RLS-protected, real multi-user persistence (active in production).

**Production status summary:**
- **OWNER-SIDE LIVE VERIFICATION**: Vercel deployment is live; Supabase project is live; production is running in cloud mode; Supabase Auth is tested; cloud persistence is tested; User A / User B isolation is manually verified; local mode remains functional.
- **AI-SIDE STATIC CODE VERIFICATION**: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors; `npm run build` (`next build`) compiles successfully (all 18 routes + middleware); swap points (`lib/data/index.ts`, `lib/auth/index.ts`) statically verified; date utilities centralized.
- **PENDING REAL-WORLD VERIFICATION**: Local-to-cloud migration flow (`lib/services/migrationService.ts`, Test 21); live email delivery for password reset; live observation across a DST transition.

## Feature status

**Dashboard** — functional. Greeting, Top 3, Due Today/Overdue, Upcoming,
Today's Schedule, What Should I Do Now, Progress (Goals+Projects merged
into one card), Coach snippet, Quick Actions, Today's Rhythm (Focus+Habits merged), Recent Activity. Kept deliberately compact (merged what would've
been 8 cards down to 6) per "avoid excessive cards."

**Tasks** — functional. Full CRUD, priority, due date/time, estimated
duration, notes, status, subtasks (with cascade delete), project/goal
assignment. Views: Inbox/Today/Upcoming/Completed.

**Calendar** — functional. Month + day views, event CRUD, task deadlines
overlaid as synthetic (never persisted) markers.

**Projects** — functional. CRUD, color, status, deadline, goal linking,
progress derived live from linked tasks (never stored/duplicated).

**Goals** — functional. CRUD, horizon, status, deadline, success metric.
Progress derived live as a rollup of linked projects' progress + directly-
attached tasks (no double-counting a task through both a project and a
direct link).

**Habits** — functional. Daily/weekly, today-toggle, streak calculation,
7-day completion rate and mini-history. **This session:** fixed the exact
bug reported ("Morning Run" on the wrong day) — see Timezone section.

**Focus** — functional. Real countdown timer (elapsed-time-based, not a
naive tick counter, so it survives tab switches correctly), start against
a task or a custom goal, rating + reflection on completion, today's
session history.

**Journal** — functional. Seven daily reflection prompts, mood/energy,
one entry per calendar day (upserted, not duplicated), past-entries list.

**Analytics** — functional. Real charts (recharts) for 7-day task
completions and focus minutes, task stats, most-postponed tasks, habit
consistency, and local rule-based interpretive insights (not just raw
numbers).

**Coach** — functional. Local rule-based recommendation engine
(`lib/services/coachService.ts`) reasoning over real task/project/goal/
focus data: most important task today, overload check, upcoming
deadlines, repeatedly-postponed tasks, at-risk projects/goals, weekly
focus suggestions. Explicitly labeled as not using external AI.

**Settings** — functional. Theme toggle, account info, mode-aware
explanatory copy (local vs. cloud), local-data reset, and — new this
session — the local→cloud import flow.

## This session's work in detail

### 1. Timezone bug fix (the reported issue)

Root cause: `new Date().toISOString().slice(0, 10)` returns the **UTC**
date, not the viewer's local date — wrong for anyone not in UTC during the
hours where local and UTC disagree on the calendar day. This pattern was
used in **15 files**, not just Habits: also Calendar's day-grouping
(`eventService.dateKey`/`toDateKey`), Analytics' day-bucketing, and
several "what's today" helpers across services and pages.

Fixed by introducing `lib/utils/date.ts` (`todayKey()`, `dateKey()`,
`dateKeyInTimezone()`, `formatInTimezone()`, `addDaysToKey()`,
`detectTimezone()`) and updating every one of the 15 files to use it
instead. Also fixed a related DST-fragile pattern in Calendar's prev/next-
day navigation (was doing raw millisecond arithmetic on a date string;
now uses `addDaysToKey`).

`profiles.timezone` (already in the schema/type from earlier sessions) is
now actually used: seeded from the browser's detected timezone at signup
in cloud mode (`lib/auth/supabase.ts`), and `dateKeyInTimezone()`/
`formatInTimezone()` exist for the (not yet built) case of displaying a
stored timestamp in a specific user's timezone rather than the viewer's
ambient one.

### 2. Supabase database (Stage 2/3)

`database/supabase-schema.sql` — full schema matching the app's current
TypeScript types exactly: every status/priority/energy/kind column has a
`CHECK` constraint mirroring its TS union type, `updated_at` triggers on
every table that has one, and FK behavior matching the app's existing
unlink-not-delete semantics (deleting a project/goal sets `project_id`/
`goal_id` to null on tasks rather than cascading; deleting a parent task
cascades to subtasks, matching `taskService.deleteTask`'s existing
app-layer behavior). Full RLS on every table — the actual security
boundary, not the app's own `.eq("user_id", ...)` filtering, which is
present too but is a courtesy, not the enforcement.

`Goal.progress` and `Project`'s equivalent are explicitly documented as
legacy/unused columns — the app has never written to them; progress is
always the live-derived rollup, per the original design decision from the
Goals session.

### 3. Authentication (Stage 4)

`lib/auth/supabase.ts` implements the existing `AuthProvider` interface
for real: `supabase.auth.signUp/signInWithPassword/signOut/
resetPasswordForEmail`. `lib/auth/index.ts` now switches local/Supabase
based on `lib/supabase/config.ts`'s `isSupabaseConfigured()`. Handles the
"email confirmation required" case honestly (throws an instructional
message rather than pretending signup logged the person in). Seeds
`profiles.timezone` from the browser at signup only (never overwrites a
later manual change). `middleware.ts` rebuilt as a Supabase-session-
refresher that's a complete no-op in local mode. Password reset flow built
(`/reset-password` — request-email form + set-new-password form, the
latter detected via the `type=recovery` URL fragment Supabase's reset
links carry). `AuthProvider.tsx` gained a real `onAuthStateChange`
listener for cloud mode (needed for magic-link flows; local mode never
needed one since its session only changes through this app's own calls).

### 4. Data layer (Stage 5)

`lib/data/remote/genericSupabaseRepo.ts` mirrors
`lib/data/local/genericRepo.ts`'s `Repository<T>` shape exactly.
`lib/data/remote/profileRepo.ts` is a dedicated implementation for
`profiles` specifically, since it doesn't fit the generic pattern (its PK
*is* the user id, no separate `user_id` column, row auto-created by a DB
trigger on signup). `lib/data/index.ts` now exports the local or Supabase
implementation per entity based on the same `isSupabaseConfigured()`
check — no importing file anywhere in the app had to change.

**Two hazards caught and fixed during this pass, not left as known bugs:**
- Every service in `lib/services/*` hardcodes `user_id: "local"` when
  building a new row (harmless in local/IndexedDB mode — there's only one
  tenant per browser). The generic Supabase repo's `create()` originally
  did `row.user_id ?? userId`, which would never override that truthy
  placeholder string — every cloud-mode insert would have tried to write
  `user_id: "local"` and failed. Fixed to always stamp the real
  authenticated user id, ignoring whatever the row object says.
- `resetAllLocalData()` (Settings → "Reset local/demo data") used to
  operate through the same swappable exports as everything else — meaning
  once Supabase is live, that button would have deleted **cloud** data,
  not local data, despite its label. Fixed to always import
  `createLocalRepo` directly and operate on IndexedDB regardless of mode.
- `seedIfEmpty()` is now gated to a no-op in cloud mode — a real signup
  should never get the fictional "Maya Chen" demo data mixed into it.

### 5. Migration (Stage 6)

`lib/services/migrationService.ts`: `preflightMigration()` (what's
locally present, whether the cloud account already has data — surfaced as
an explicit warning requiring a checkbox before proceeding, to avoid
accidental duplicate imports) and `migrateLocalDataToSupabase()`
(dependency-ordered insert: areas/goals → projects → tasks in two passes
so subtasks insert after their parents exist → events/habits/habit logs/
focus sessions/time entries/journal entries/integrations, all re-stamped
to the real signed-in user). Local row ids are already valid UUIDs
(`crypto.randomUUID()`), so they're reused as-is — no id remapping needed.
**Never deletes local data automatically.** Surfaced in Settings as
"Import local data," gated to cloud mode only.

### 6. Consistency pass (Stage 8) — issues found and fixed this session

- Missing `@supabase/supabase-js` + `@supabase/ssr` in `package.json` —
  removed from `dependencies` in an earlier local-only-mode session,
  needed again now. Every Supabase-touching file in this session would
  have failed to build without this.
- `README.md` still referenced the old (now-removed) `lib/future-supabase/`
  path and `database/supabase-schema.future.sql` filename — rewritten to
  match the current dual-mode architecture and full feature set (it still
  described the app as local-only pre-Goals/Habits/Focus/etc.).
- Settings page's "About local mode" and "Reset demo data" copy was
  unconditionally local-mode language — now mode-aware, matching the
  same fix already applied to login/signup page copy.
- Login/signup page copy previously claimed "local only" / "not a real
  account system" unconditionally — now correctly describes cloud mode
  when active.

## What is actually verified (Owner-side vs. AI-side)

FlowOS distinguishes strictly between owner-side live environment testing and
AI-side static repository verification:

### Owner-Side Live Verification (Production)
- **Vercel deployment is live**: The application builds and serves in production.
- **Supabase project is live**: Production is running in cloud mode backed by Supabase.
- **Supabase authentication**: Tested and verified (sign-up, log in, session persistence).
- **Cloud persistence**: Entity creation and updates persist across sessions in Supabase.
- **Multi-user isolation (RLS)**: User A vs. User B isolation verified — neither user can see or alter the other's tasks, projects, goals, or records.
- **Local mode**: Remains available and operational for local/offline testing without environment variables.

### AI-Side Static Code Verification (Repository)
- **TypeScript compilation**: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
- **Production build**: `npm run build` (`next build`) compiles successfully (all 18 static routes generated, middleware bundled).
- **Swap-point integrity**: Statically traced `isSupabaseConfigured()`, `@/lib/data`, and `@/lib/auth`.
- **Date utility standardization**: Centralized `lib/utils/date.ts` usage confirmed across services.

## Known limitations & pending items

- **Local-to-cloud migration (Test 21)** has not yet been executed end-to-end on live data.
- **Password reset live delivery**: Requires live email verification with Supabase redirect URLs configured.
- **Query limits**: `genericSupabaseRepo.ts` queries currently omit explicit pagination/limits, subject to Supabase's default 1,000-row PostgREST ceiling on very large datasets.
- Migration is all-or-nothing per table and currently does not migrate `milestones`, `tags`, `areas` attachments, or `reviews`/`coach_conversations` (no active UI writes to these yet).
- `lib/supabase/server.ts` and `admin.ts` are reserved for server-side route handlers / webhooks, not currently exercised by client components.
- No automated test suite (e.g. Vitest/Playwright) exists yet; all verified flows are from manual testing.

## Next priorities

1. **Verify local-to-cloud migration (Test 21)** on a live test account with real sample data.
2. **ESLint non-interactive config**: Add a `.eslintrc.json` so `npm run lint` runs non-interactively in CI.
3. **Type alignment**: Add `user_id?: string` to `HabitLog` in `types/index.ts`.
4. **Planned feature sequence**: Focus timer aesthetic pass, Analytics line graph for focus minutes, and habit custom frequencies (see `docs/ROADMAP.md`).
