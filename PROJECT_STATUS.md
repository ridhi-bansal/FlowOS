# PROJECT_STATUS.md

Last updated: this session — final stabilization pass before real-world
testing. Fixed 8 concrete bugs (mode-aware copy, stale state, mobile
Calendar layout, missing Escape-to-close on all 8 modals, heading/typography
polish, Coach accessibility, theme flash on load). Re-verified the previous
session's Supabase migration and timezone fixes are still intact. Produced
a full audit report, testing checklist, and beginner deployment guide as
separate documents (see `docs/` — not duplicated here to keep this file
scannable). No new features added, per this session's explicit scope.

## Current checkpoint

**All 11 planned feature areas are built**: Dashboard, Tasks (incl.
subtasks), Calendar, Projects, Goals, Habits, Focus, Journal, Analytics,
Coach, Settings — plus a global command palette (⌘K) and theme switching.
The app now runs in one of two modes:

- **Local mode** (no env vars set): IndexedDB + localStorage, as before.
- **Cloud mode** (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set):
  Supabase Auth + Postgres, RLS-protected, real multi-user persistence.

**Not yet done, and important:** none of the Supabase-mode code has been
run against a live project or compiled — this sandbox has no network
access (confirmed repeatedly across sessions). Everything below marked
"implemented" is real, complete source code, verified only by import
resolution and manual tracing, not by execution. See "What's actually
verified" below before treating any of it as working.

## Feature status

**Dashboard** — functional. Greeting, Top 3, Due Today/Overdue, Upcoming,
Today's Schedule, What Should I Do Now, Progress (Goals+Projects merged
into one card), Coach snippet, Quick Actions, Today's Rhythm (Focus+Habits
merged), Recent Activity. Kept deliberately compact (merged what would've
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

## What's actually verified (vs. only statically checked)

Every session has carried this same caveat, and it still applies: **no
network access in this sandbox**, so nothing Supabase-related has been
compiled or run. Verification this session was: (a) every `@/...` import
resolves to a real file — checked after every batch of changes, (b)
manual tracing of the auth/data/migration flows described above, (c) the
two hazards in section 4 were caught by manually tracing what happens to
a row's `user_id` end-to-end, not by running the code. This is a real gap
— see Recommended next step.

## Known limitations

- **Nothing has been run against a live Supabase project.** Schema
  correctness, RLS policy correctness, and the full auth/data/migration
  flow are unverified beyond static review.
- Migration is all-or-nothing per table (no partial-row conflict
  resolution) and doesn't migrate `milestones`, `tags`, `areas`
  attachments, or `reviews`/`coach_conversations` — those aren't
  populated by any current UI feature, so there's nothing to migrate yet,
  but note it if that changes.
- `lib/supabase/server.ts` and `admin.ts` are unused by the app so far —
  all current Supabase access is client-side via `lib/supabase/client.ts`
  (via the generic remote repos). They're there for when a server-side
  need arises (e.g. a future API route), not currently exercised.
- Carried over from earlier sessions, still true: sidebar highlights both
  "Tasks" and "Inbox" at once; `ProjectDetailModal`/`GoalDetailModal`'s
  edit flow closes both modals on save rather than returning to a
  refreshed detail view; no automated tests exist anywhere in the project.

## Remaining before Vercel deployment

1. Actually run this locally against a real Supabase project and verify
   the full flow (see the numbered testing checklist in the final report
   for this session).
2. Create the Supabase project, run `database/supabase-schema.sql`, set
   env vars.
3. Decide on and configure Supabase Auth email settings (confirmation
   on/off, email templates, SMTP if not using Supabase's default).
4. Set `NEXT_PUBLIC_SITE_URL` to the real deployed domain (used in
   password-reset redirect links).
5. Everything explicitly out of scope per this session's instructions:
   Google Calendar, Todoist, payments, subscriptions, external AI API,
   production analytics/support tooling — none started.

## Recommended next step

Same standing recommendation as every session, now higher-stakes than
before: get this running for real. Specifically — create a throwaway
Supabase project, run the schema, set env vars, sign up two separate test
accounts, and verify: (a) each sees only their own data, (b) the full
create-task→appears-on-dashboard→contributes-to-project/goal-progress
chain works end-to-end, (c) the local-data import works without
duplicating or dropping anything. Do this before adding anything new.
