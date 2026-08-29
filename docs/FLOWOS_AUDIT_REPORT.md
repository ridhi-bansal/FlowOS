# FlowOS — Final Audit Report

Session goal: stabilize before real-world testing, not add features. Everything
below reflects an actual inspection of the current codebase (100 files), not a
summary of past session notes.

---

## A. What was inspected

Every file in `app/`, `components/`, `lib/`, `database/`, plus config files
(`package.json`, `tsconfig.json`, `next.config.js`, `middleware.ts`,
`.env.example`, `.gitignore`). Specifically checked: import resolution across
the whole tree, the local↔Supabase switch points (`lib/data/index.ts`,
`lib/auth/index.ts`), RLS policy coverage, every date/time computation, every
modal's keyboard handling, hardcoded-ID leakage into cloud mode, secret
exposure, and stale documentation.

## B. What was fixed this session

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | Topbar showed "Local-only mode" even when Supabase was configured | `components/layout/AppShell.tsx` | Now checks `isSupabaseConfigured()` and shows "Cloud sync" or "Local-only mode" correctly |
| 2 | Recent Activity fetched focus sessions with its own direct DB call instead of the shared provider — could go stale relative to the rest of the app | `components/dashboard/RecentActivityCard.tsx` | Now reads from `useFocus()`, same source every other focus-aware component uses |
| 3 | Calendar month view used inline `grid-template-columns: repeat(7,1fr)` — invisible to the app's mobile CSS, so it never collapsed on a phone screen | `components/calendar/CalendarMonthView.tsx`, `app/globals.css` | Moved to real CSS classes (`.month-grid`, `.month-day`) with a mobile override (smaller cells/font under 900px) |
| 4 | **Zero of the 8 modals in the app closed on Escape** (only the command palette did) | All 8 modal components | Built one shared `lib/hooks/useEscapeToClose.ts` hook, wired into all 8 rather than duplicating the fix |
| 5 | Card headings had no visual separation from body content — sections blended together | `app/globals.css` `.card-head` | Added a border + weight bump |
| 6 | `⌘K` shortcut button had no distinct typography | `app/globals.css` | Added a `.kbd` class (monospace, letter-spacing) |
| 7 | Coach only reachable via sidebar/palette, not from every page at a glance | `components/layout/AppShell.tsx` | Added a persistent Coach icon in the topbar |
| 8 | Theme applied only after React hydration — dark-mode users saw a flash of light mode on every load | `app/layout.tsx` | Added a blocking inline `<script>` in `<head>` that sets the theme attribute before hydration, same pattern most Next.js apps use for this |

**Two hazards from the previous (Supabase migration) session, re-verified this
session, confirmed still fixed:**
- Every service hardcodes `user_id: "local"` when building a new row
  (harmless in local mode). The generic Supabase repo's `create()`
  unconditionally overrides this with the real authenticated user id —
  traced this path again end-to-end this session, confirmed correct.
- `resetAllLocalData()` (Settings) always targets IndexedDB directly,
  never the swappable cloud repos — re-confirmed it can't delete cloud data.

## C. What is currently functional

See the Feature Inventory below for the full per-page breakdown. Short
version: all 11 feature areas (Dashboard, Tasks, Calendar, Projects, Goals,
Habits, Focus, Journal, Analytics, Coach, Settings) plus the command palette
and theme system are implemented and internally consistent — every import
resolves, every provider is correctly nested, the Goal→Project→Task data
chain has no duplication (progress is always derived live).

## D. What remains (postponed by design, not forgotten)

Explicitly NOT implemented this session, per instruction not to feature-creep
during a stabilization pass:

- Analytics: Focus Minutes as a line graph instead of bar chart (item #23)
- Focus: more elaborate visual timer treatment (item #22)
- Calendar: week/year/weekday-only views (item #21)
- Habits: monthly/yearly/custom frequency beyond daily/weekly (item #20)
- Goals: separate input-vs-output metric fields, richer obstacle tracking (items #18–19)
- Journal: customizable prompts, AI-generated prompts from user data, richer past-entries view (items #15–17)
- An AI avatar/pop-up interaction pattern (item #11)
- In-app customer support/help mechanism (item #12)
- Product analytics/telemetry to see where users struggle (item #13)
- True multi-user *collaboration* features — multi-user *isolation* (separate
  accounts, separate data) is implemented and audited below; shared
  workspaces/teams are not (item #14)

These are legitimate ideas, not rejected — see the roadmap doc for sequencing.

## E. Known risks

1. **Nothing in this project has been run.** This sandbox has no network
   access — confirmed every session by testing `npm install`, which fails
   outright. Everything in this audit is verified by import-resolution
   checks and manual code tracing, not by execution. This is the single
   most important thing to understand before treating any "✅" in the
   feature inventory as a guarantee — see the legend there.
2. RLS policies have never been tested against a live Postgres instance —
   the logic is correct on paper (traced manually, see the database audit
   below) but "correct on paper" and "correct in production" are different
   claims.
3. The theme-flash fix relies on a duplicated `localStorage` key string
   (`"flowos.theme.v1"`) between an inline `<script>` and
   `lib/services/themeService.ts`, since the inline script can't import a
   TypeScript module. If that key is ever renamed in one place and not the
   other, the flash bug returns silently. Documented in a code comment.
4. No automated tests exist anywhere in the project. Every verification is
   manual (by you, using the testing checklist) or static (by Claude,
   reading code). This is normal for a project at this stage but worth
   naming as a real gap, not a nice-to-have.

---

## Feature Inventory

Legend: **✅** implemented and traced end-to-end in code · **🟡** implemented,
not run · **🔴** incomplete/broken · **⚪** planned, not built

Every row below is 🔴 for "actually tested" — nothing has been run in a real
browser this session. Read that column literally, not as a soft "probably fine."

| Feature | What it does | Functional (code) | Persists | Local mode | Cloud mode | Actually tested | Known limitation |
|---|---|---|---|---|---|---|---|
| Dashboard | Command center: Top 3, due today, upcoming, schedule, What Should I Do Now, progress, coach snippet, quick actions, rhythm, recent activity | ✅ | n/a (reads other entities) | 🟡 | 🟡 | 🔴 not run | None known beyond "not run" |
| Tasks | CRUD, priority, due date/time, estimate, notes, status, subtasks (cascade delete), project/goal assignment, 4 views | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | None known |
| Calendar | Month/day views, event CRUD, task-deadline overlay (synthetic, never persisted) | ✅ | ✅ (events) | 🟡 | 🟡 | 🔴 not run | No week/year view (by design, postponed) |
| Projects | CRUD, color, status, deadline, goal link, task list, live progress | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Edit flow closes both modals on save (minor UX, not a bug) |
| Goals | CRUD, horizon, status, deadline, success metric, rollup progress from projects + direct tasks | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | No goal hierarchy UI (schema supports it, no UI yet) |
| Habits | Daily/weekly, today-toggle, streak, 7-day history | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Only daily/weekly frequency (postponed: monthly/yearly/custom) |
| Focus | Real countdown timer, start against a task, rating + reflection | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Timer is functional but visually plain (postponed: aesthetic pass) |
| Journal | 7 daily prompts, mood/energy, one entry per day (upserted) | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Fixed prompt set, no customization (postponed) |
| Analytics | Real charts (recharts), task stats, postponed-task list, habit consistency, rule-based insights | ✅ | n/a (reads other entities) | 🟡 | 🟡 | 🔴 not run | Focus Minutes is a bar chart, not line (postponed) |
| Coach | Local rule-based recommendations from real data — most important task, overload check, deadlines, patterns | ✅ | n/a | 🟡 | 🟡 | 🔴 not run | Explicitly not using external AI — by design, not a gap |
| Settings | Theme, account info, mode-aware copy, local reset, cloud import | ✅ | n/a / ✅ (theme) | 🟡 | 🟡 | 🔴 not run | Import UI built in the migration session, never run against a live project |
| Command Palette | ⌘K search across tasks/projects/goals + quick actions | ✅ | n/a | 🟡 | 🟡 | 🔴 not run | Search navigates to the list page, not a deep link to the specific item |
| Authentication | Local (localStorage, fake) or Supabase (real), switches by env config | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Local mode is explicitly NOT secure — labeled as such in the UI |
| Theme/customization | Light/dark, persisted, no-flash on load (fixed this session) | ✅ | ✅ | 🟡 | 🟡 | 🔴 not run | Only light/dark — no accent color customization (postponed) |
| Data migration | One-time local→Supabase import, non-destructive, preflight-checked | ✅ | n/a | n/a | 🟡 | 🔴 not run | **Highest-risk unverified feature in the app — see database audit below** |
| Supabase integration | Auth + Postgres + RLS, full schema matching app types | ✅ | ✅ | n/a | 🟡 | 🔴 not run | Schema has never been run against a live Postgres instance |

---

## Database / Supabase Audit

### Can User A access User B's data?

Traced manually, table by table, against `database/supabase-schema.sql`:

- Every table has RLS enabled (`alter table ... enable row level security`).
- Every table except `profiles` has a policy: `for all using (auth.uid() =
  user_id) with check (auth.uid() = user_id)`. `for all` covers
  SELECT/INSERT/UPDATE/DELETE — not just reads.
- `profiles` uses `auth.uid() = id` (its primary key *is* the user id, no
  separate `user_id` column).
- Join tables (`task_dependencies`, `task_tags`) have no `user_id` column of
  their own — their policy checks ownership through the parent task, which
  is the correct pattern for tables that only make sense in relation to an
  owned row.

**Conclusion: by the code as written, User A cannot read, write, or delete
User B's tasks, goals, projects, events, habits, journal entries, focus
sessions, or settings.** This is enforced at the database level — even a
compromised or buggy frontend can't bypass it, because Postgres itself
rejects the query.

**What this audit could NOT verify:** whether the SQL actually runs without
error when pasted into a real Supabase project, and whether the policies
behave as intended against real data. That requires the two-user test in
the testing checklist — do not skip it.

### Schema quality

- Every enum-like column (status, priority, kind, energy, horizon) has an
  explicit `CHECK` constraint matching its TypeScript union type exactly —
  invalid values can't reach the database even from a bug that slips past
  the frontend.
- `updated_at` is trigger-maintained, not app-maintained — stays correct
  even for a hypothetical future direct SQL edit or a different client.
- Foreign key behavior matches the app's actual delete semantics: deleting
  a project/goal sets `project_id`/`goal_id` to `NULL` on tasks (unlink, not
  destroy); deleting a parent task cascades to subtasks — both now enforced
  by the database itself, not just the app layer.
- `Goal.progress` and any equivalent stored-progress column are explicitly
  documented as legacy/unused — the app has never written to them; progress
  is always the live-derived rollup from real task/project data.

### Migration/import risk assessment

This is the least-tested part of the whole system. `migrationService.ts`:
reads local IndexedDB data, re-stamps every row's `user_id` to the real
signed-in user, inserts in dependency order (areas/goals → projects → tasks
in two passes so subtasks insert after parents exist → everything else).
Reuses existing UUIDs rather than generating new ones. Never deletes local
data. Has a preflight check that warns if the cloud account already has
data and requires an explicit checkbox before proceeding.

**This has never been run against a real Supabase project.** The logic is
correct on paper. Test it with a throwaway account before trusting it with
data you care about.

---

## Date/Time/Timezone Audit

### Root cause of the reported bug ("Morning Run at night")

`new Date().toISOString().slice(0, 10)` returns the date **in UTC**, not the
viewer's local date. For anyone west of UTC, local time is *behind* UTC —
so for several hours every evening, the UTC calendar day has already rolled
over to "tomorrow" while it's still "today" locally. A habit logged in the
evening could get stored against tomorrow's date.

This was fixed in the previous session — traced through **15 files** that
used this pattern, including Habits (the reported symptom) and, less
obviously, Calendar's event day-grouping and Analytics' 7-day chart
bucketing. Fixed by introducing `lib/utils/date.ts`:

- `todayKey()` — today's date using plain local `Date` getters
  (`getFullYear`/`getMonth`/`getDate`), never `toISOString()`.
- `dateKey(d)` — same, for an arbitrary local `Date` object.
- `dateKeyInTimezone(instant, timezone)` — converts a stored UTC timestamp
  to the calendar date it represents in a *specific* IANA timezone.
- `addDaysToKey(key, n)` — date-key arithmetic that never round-trips
  through `Date`/`toISOString()`, avoiding a related DST-fragile bug found
  in Calendar's prev/next-day navigation.

**Re-verified this session:** zero remaining occurrences of the buggy
pattern anywhere in the codebase (grep-confirmed).

### Current strategy (one consistent rule)

"What day is it" is always computed from the **browser's own local
timezone** via plain `Date` getters — correct for the common case of
someone using FlowOS from one place. `profiles.timezone` (seeded from the
browser's detected timezone at signup) exists for displaying someone's data
in a timezone other than the viewer's own — built but not yet exercised by
any current UI feature.

**This has not been tested against an actual timezone change** (travel, or
a DST transition) — the logic is sound by inspection against `Date`/`Intl`
spec semantics, but hasn't been observed working live. Worth a spot-check
after deployment around a DST boundary if you want full confidence.
