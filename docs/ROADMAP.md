# FlowOS — Roadmap

Prioritized by user value, differentiation, and complexity — not everything
here should be built next, only the top few at any time. This consolidates
what previously lived as "Part 15" of `DEPLOYMENT_GUIDE.md` (now just a
pointer to this file) and the postponed-items list in
`docs/FLOWOS_AUDIT_REPORT.md`.

This reflects priorities as previously reasoned about, not commitments —
re-confirm with the project owner before treating anything here as decided.

## Current priorities

1. **Verify the Supabase migration for real.** Create a throwaway Supabase
   project, run `database/supabase-schema.sql`, set env vars, sign up two
   test accounts, and confirm: each sees only their own data, the full
   create-task → dashboard → project/goal-progress chain works end-to-end,
   and the local→cloud import doesn't duplicate or drop anything. Nothing
   else below should be prioritized ahead of this — see
   `PROJECT_STATUS.md`'s "Known limitations" for why.
2. Fix whatever the two-user isolation test and `docs/TESTING_CHECKLIST.md`
   surface. Must happen before showing FlowOS to anyone else.

## Next

3. A visual/aesthetic pass on Focus's timer — cheap, high perceived-quality
   improvement, no architecture risk.
4. Analytics: Focus Minutes as a line graph instead of a bar chart —
   trivial (recharts already supports it), improves a page people look at
   regularly.
5. Habits: monthly/custom frequency, closing a gap in an already-built
   feature rather than starting something new.
6. Journal: prompts informed by the user's own recent data (e.g. "you
   mentioned X task three times this week") — using the *existing* local
   rule-based approach, not an external AI call. This is FlowOS's most
   differentiated realistic next feature.

## Future

7. External AI API integration — only after the rule-based Coach has been
   used for a while and it's clear specifically where it falls short.
   Adding a paid API before knowing that is guessing.
8. Google Calendar / Todoist integrations — real value, real complexity
   (OAuth, sync conflict handling). Worth it once the core product has
   real usage validating the investment.
9. Multi-user *collaboration* (shared projects/teams) — a different product
   shape than today's multi-user *isolation* (separate accounts, separate
   data, already implemented). Don't start this casually.
10. Payments/subscriptions — only once there's something people actually
    want to pay for, which comes from usage, not from guessing.
11. Customer support tooling and product analytics/telemetry — matter once
    there are users, not before.

Smaller postponed items not yet sequenced above (see
`docs/FLOWOS_AUDIT_REPORT.md` section D for the full list as of the last
audit): Calendar week/year views, richer Goals obstacle-tracking fields,
richer Journal past-entries view, an AI avatar/pop-up interaction pattern.

## Completed

- Core feature set (Dashboard, Tasks, Calendar, Projects, Goals, Habits,
  Focus, Journal, Analytics, Coach, Settings, command palette, theming).
- Dual-mode (local/Supabase) data, auth, and AI architecture.
- Supabase schema, RLS, and migration service — written, not yet verified
  live (tracked as the top current priority above, not as done).
- Timezone-correctness fix across the whole codebase.

See `CHANGELOG.md` for the dated history behind these.
