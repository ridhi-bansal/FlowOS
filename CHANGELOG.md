# Changelog

All notable changes to FlowOS are recorded here. Unlike `PROJECT_STATUS.md`
(which always describes the *current* state), this file is a historical
log — entries are never rewritten once added, only appended to.

Format: newest first. Dates are approximate where prior session history
wasn't recorded at the time.

---

## [Baseline] — 2026-09-19

This changelog was initialized this session, after the fact. FlowOS already
had substantial history before this entry; the items below are a single
baseline snapshot of what existed at initialization, reconstructed from
`PROJECT_STATUS.md` and `docs/FLOWOS_AUDIT_REPORT.md`, not a real
change-by-change history. Everything from this point forward will be a real,
per-change entry.

### Added (cumulative, pre-changelog)
- Core feature set: Dashboard, Tasks (with subtasks), Calendar, Projects,
  Goals, Habits, Focus, Journal, Analytics, Coach, Settings, plus a global
  command palette (⌘K) and light/dark theme.
- Dual-mode data/auth/AI architecture: single swap point per concern
  (`lib/data/index.ts`, `lib/auth/index.ts`, `lib/ai/index.ts`) switching
  between a local implementation (IndexedDB, localStorage, rule-based mock)
  and a Supabase implementation (Postgres, Supabase Auth) based on
  `isSupabaseConfigured()`.
- Full Supabase schema (`database/supabase-schema.sql`) with RLS on every
  table, CHECK constraints mirroring TypeScript unions, and `updated_at`
  triggers.
- Local → cloud one-time data migration flow (`lib/services/migrationService.ts`),
  surfaced in Settings.
- Centralized local-date handling (`lib/utils/date.ts`), replacing a
  UTC-vs-local-date bug that had spread across 15 files.

### Fixed (cumulative, pre-changelog)
- Two data-integrity hazards caught before they could reach a live cloud
  account: services hardcoding `user_id: "local"` (now always overridden by
  the real authenticated user id on insert), and `resetAllLocalData()`
  (now always targets IndexedDB directly regardless of mode, instead of
  risking a cloud-mode data wipe).
- 8 stabilization-pass bugs: mode-aware UI copy, a stale dashboard data
  source, a mobile Calendar layout bug, missing Escape-to-close on all 8
  modals, heading/typography polish, Coach reachability, and a dark-mode
  flash-of-light-theme on load.

### Known as of this baseline
- Nothing Supabase-related has been run against a live project — no network
  access has been available in any development sandbox to date. Everything
  cloud-mode is implemented and statically/manually verified, not executed.
- No automated tests exist anywhere in the project.

See `PROJECT_STATUS.md` for the full current-state detail behind this
summary, and `docs/FLOWOS_AUDIT_REPORT.md` for the underlying audit.
