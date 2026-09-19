# FlowOS — Roadmap

Prioritized by user value, differentiation, and complexity — not everything
here should be built next, only the top few at any time. This consolidates
what previously lived as "Part 15" of `DEPLOYMENT_GUIDE.md` (now just a
pointer to this file) and the postponed-items list in
`docs/FLOWOS_AUDIT_REPORT.md`.

This reflects priorities as previously reasoned about, not commitments —
re-confirm with the project owner before treating anything here as decided.

## Current priorities

1. **Verify local-to-cloud data migration (Test 21).** Test `lib/services/migrationService.ts` with real sample data on a test account; verify preflight counts and dependency ordering.
2. **Tooling & typing consistency.** Add non-interactive ESLint configuration (`.eslintrc.json`) so `npm run lint` runs in CI without prompting; align `HabitLog` typing in `types/index.ts` with the database schema.
3. **Password reset end-to-end verification.** Confirm live email delivery and password reset flow against the configured Vercel production domain and Supabase Redirect URLs.

## Next

4. A visual/aesthetic pass on Focus's timer — cheap, high perceived-quality
   improvement, no architecture risk.
5. Analytics: Focus Minutes as a line graph instead of a bar chart —
   trivial (recharts already supports it), improves a page people look at
   regularly.
6. Habits: monthly/custom frequency, closing a gap in an already-built
   feature rather than starting something new.
7. Journal: prompts informed by the user's own recent data (e.g. "you
   mentioned X task three times this week") — using the *existing* local
   rule-based approach, not an external AI call. This is FlowOS's most
   differentiated realistic next feature.

## Future

8. External AI API integration — only after the rule-based Coach has been
   used for a while and it's clear specifically where it falls short.
   Adding a paid API before knowing that is guessing.
9. Google Calendar / Todoist integrations — real value, real complexity
   (OAuth, sync conflict handling). Worth it once the core product has
   real usage validating the investment.
10. Multi-user *collaboration* (shared projects/teams) — a different product
    shape than today's multi-user *isolation* (separate accounts, separate
    data, already implemented). Don't start this casually.
11. Payments/subscriptions — only once there's something people actually
    want to pay for, which comes from usage, not from guessing.
12. Customer support tooling and product analytics/telemetry — matter once
    there are users, not before.

Smaller postponed items not yet sequenced above (see
`docs/FLOWOS_AUDIT_REPORT.md` section D for the full list as of the last
audit): Calendar week/year views, richer Goals obstacle-tracking fields,
richer Journal past-entries view, an AI avatar/pop-up interaction pattern.

## Completed

- Core feature set (Dashboard, Tasks, Calendar, Projects, Goals, Habits,
  Focus, Journal, Analytics, Coach, Settings, command palette, theming).
- Dual-mode (local/Supabase) data, auth, and AI architecture.
- Supabase schema, Row Level Security (RLS) policies, and production deployment on Vercel — **owner-verified live**.
- Multi-user data isolation (User A vs. User B) and cloud persistence — **owner-verified live**.
- Timezone-correctness fix across the whole codebase (`lib/utils/date.ts`).

See `CHANGELOG.md` for the dated history behind these.
