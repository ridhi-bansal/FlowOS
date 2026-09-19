# FlowOS — Database Reference

This describes how the Supabase (cloud-mode) database is structured, as a
living reference — not a point-in-time audit. For the dated findings from
inspecting this schema (what was traced, what risks were found), see
`docs/FLOWOS_AUDIT_REPORT.md`'s "Database / Supabase Audit" section instead;
this file should be updated whenever the schema itself changes, the audit
report only when a re-audit happens.

Source of truth for the actual schema: `database/supabase-schema.sql`. This
file only exists in cloud mode — local mode uses IndexedDB
(`lib/data/local/`) and has no schema at all, just object stores mirroring
the same TypeScript types.

## Tables (21)

`profiles`, `areas`, `tags`, `goals`, `projects`, `milestones`, `tasks`,
`task_dependencies`, `task_tags`, `attachments`, `events`, `focus_sessions`,
`time_entries`, `habits`, `habit_logs`, `journal_entries`, `reviews`,
`coach_conversations`, `coach_messages`, `integrations`, `notifications`.

Not every table has a UI feature that populates it yet — `milestones`,
`reviews`, `coach_conversations`/`coach_messages`, and `tags`/`task_tags`
are schema-ready but not currently written to by any built feature. They
exist so the schema doesn't need a breaking migration when those features
are eventually built.

## Ownership & row-level security

Every table has RLS enabled. The pattern, applied generically in a loop in
the schema script rather than written out per table:

- Every table except `profiles` has a `user_id` column and a single
  `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`
  policy — covering SELECT/INSERT/UPDATE/DELETE, not just reads.
- `profiles` uses `auth.uid() = id` instead, since its primary key *is* the
  user id (no separate `user_id` column; the row is auto-created by a
  trigger on signup).
- The two pure join tables (`task_dependencies`, `task_tags`) have no
  `user_id` of their own — ownership is checked through the parent task.

This is enforced by Postgres itself, not just the app's own
`.eq("user_id", ...)` filtering (which is also present in the generic
Supabase repo, but is a courtesy/query-scoping convenience, not the
security boundary).

## Foreign key / delete behavior

Matches the app's own delete semantics, not generic cascade-everything:

- Deleting a `project` or `goal` sets `project_id`/`goal_id` to `NULL` on
  affected `tasks` (unlink, not destroy).
- Deleting a parent `task` cascades to its `subtasks` (matches
  `taskService.deleteTask`'s app-layer behavior).
- Everything hanging off `auth.users` (via `user_id`) cascades on account
  deletion.

## Constraints & triggers

- Every enum-like column (`status`, `priority`, `kind`, `energy`, `horizon`,
  etc.) has an explicit `CHECK` constraint mirroring its TypeScript union
  type — an invalid value can't reach the database even from a bug that
  slips past the frontend.
- `updated_at` is trigger-maintained on every table that has the column —
  stays correct even from a hypothetical direct SQL edit, not just app-layer
  writes.
- `Goal.progress` and `Project`'s equivalent stored-progress columns exist
  but are explicitly legacy/unused — the app never writes to them; progress
  is always derived live from linked tasks/projects, by design (avoids
  storing a value that could drift out of sync with reality).

## Local ↔ cloud data layer

`lib/data/remote/genericSupabaseRepo.ts` implements the same `Repository<T>`
interface as `lib/data/local/genericRepo.ts`, so `lib/data/index.ts` can
export either implementation per entity based on `isSupabaseConfigured()`
without any importing file changing. `profiles` doesn't fit the generic
per-row pattern (its PK is the user id, row is trigger-created) so it has
its own `lib/data/remote/profileRepo.ts`.

## Local → cloud migration

`lib/services/migrationService.ts`, surfaced in Settings, cloud-mode only:

1. `preflightMigration()` — checks what's locally present and whether the
   cloud account already has data; if so, requires an explicit
   confirmation checkbox before proceeding, to avoid accidental duplicate
   imports.
2. `migrateLocalDataToSupabase()` — inserts in dependency order
   (areas/goals → projects → tasks in two passes, so subtasks insert after
   their parent task exists → events/habits/habit logs/focus
   sessions/time entries/journal entries/integrations), re-stamping every
   row to the real signed-in user's id. Local row ids are already valid
   UUIDs (`crypto.randomUUID()`), so they're reused as-is.
3. Never deletes local data automatically, at any point.

Not migrated by this flow, because no current UI feature populates them
locally either: `milestones`, `tags`, `attachments`, `reviews`,
`coach_conversations`. Revisit this list if any of those tables gets a real
feature built on top of it.

## Status

Written and internally consistent (every column matches its TypeScript
type, every relationship matches app-layer delete behavior), but **never
run against a live Postgres instance** — no development sandbox to date has
had network access to verify it. Treat schema correctness and RLS
correctness as "correct on paper" until the verification steps in
`docs/ROADMAP.md`'s current priorities are actually done.
