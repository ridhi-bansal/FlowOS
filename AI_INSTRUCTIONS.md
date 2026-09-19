# AI Instructions — FlowOS

Read this before making any change to FlowOS. Then read `README.md` and
`PROJECT_STATUS.md`, and inspect the relevant existing code before modifying
it. Don't assume prior conversations exist — the repository (code +
documentation) is the source of truth.

## Ground rules

1. FlowOS already exists. Do not rebuild, replace the framework, drop the
   dual-mode (local/Supabase) architecture, or redesign wholesale.
2. Reuse existing components/services/patterns. Don't create a parallel
   system when an existing one can be extended.
3. Make the smallest safe change that accomplishes the request.
4. Preserve existing functionality; check for dependencies between features
   before changing shared code (`lib/data`, `lib/auth`, `lib/ai`,
   `lib/utils/date.ts` especially — many features depend on these).
5. Consider mobile/responsive behavior for any UI change.
6. Never expose secrets (API keys, service-role keys) in code, commits, or
   chat output — names of required env vars are fine, values are not.
7. Never claim something works, is tested, or is verified unless it
   actually was in this environment. If the sandbox has no network access
   (true as of this writing — confirmed every session via a failed
   `npm install`), say so plainly rather than describing Supabase-touching
   code as "working."
8. Database changes: explain the existing schema, the proposed change, and
   data/RLS impact before implementing. Prefer additive migrations over
   destructive changes. Never drop tables or remove RLS policies without
   explanation.

## Documentation map — what owns what

`README.md` is the high-level introduction (what FlowOS is, stack, setup,
pointers onward) — not the technical source of truth for how anything
actually works. `docs/` is where the deeper technical documentation lives:
schema details, deployment steps, test procedures, audit findings, and any
future subsystem write-ups. `PROJECT_STATUS.md` and `CHANGELOG.md` sit
between the two — project-wide, but not deep-dive technical.

Don't create a new file if one of these already covers the topic; extend
it instead.

| File | Purpose | Update cadence |
|---|---|---|
| `README.md` | High-level intro for humans: what FlowOS is, stack, setup, links to deeper docs. Not a technical manual. | When capabilities or setup steps change |
| `PROJECT_STATUS.md` | The current state, answering "if I opened FlowOS today, where does it stand?" | Every meaningful change |
| `CHANGELOG.md` | Dated historical log of changes. Never rewritten, only appended to. | Every meaningful change |
| `docs/ROADMAP.md` | Current priorities / next / future / completed. Priorities, not commitments. | When priorities actually shift |
| `docs/DATABASE.md` | Living reference for the Supabase schema, RLS pattern, migration flow. | When the schema or data layer changes |
| `docs/DEPLOYMENT_GUIDE.md` | Actual deployment steps (Supabase → GitHub → Vercel). | When the deployment process changes |
| `docs/TESTING_CHECKLIST.md` | Manual test steps (no automated tests exist yet). | When a feature needs new test steps |
| `docs/FLOWOS_AUDIT_REPORT.md` | Point-in-time audit findings. Historical — don't rewrite for small changes, only at a genuine re-audit. | Only at a full re-audit |

If a new feature is genuinely complex enough to need its own document
(a notification system, a permissions model, a new AI subsystem), create
`docs/<TOPIC>.md` for it — but ask first whether it fits in an existing
file. Don't create documentation for its own sake.

## Workflow for every feature request

**UNDERSTAND → PLAN → IMPLEMENT → TEST → DOCUMENTATION IMPACT CHECK →
UPDATE DOCUMENTATION → CONSISTENCY CHECK → COMMIT**

1. **Understand** — read `PROJECT_STATUS.md` + the relevant source files.
   Don't re-explain things already documented; use the docs instead of
   asking the user to re-explain them.
2. **Plan** — for anything non-trivial, briefly state what will change,
   which files, whether Supabase/RLS or new dependencies are involved, and
   how it'll be verified. Skip this for small, obvious changes.
3. **Implement** — build the complete feature (data layer → service →
   component), not just a visual shell.
4. **Test** — run whatever's actually available in the environment
   (typecheck, lint, build). If network access is unavailable and
   something can't be verified, say exactly what wasn't verified rather
   than skipping the caveat.
5. **Documentation impact check** — decide which files are actually
   affected before touching any of them:
   - Does this change the current state? → `PROJECT_STATUS.md`.
   - Is it a meaningful feature/fix? → `CHANGELOG.md`.
   - Does it change what FlowOS does at a high level (a new top-level
     feature, a setup step)? → `README.md`.
   - Does it change the architecture (the swap-point pattern, a new
     `lib/` subsystem, how pieces fit together)? → README's architecture
     section, or a new `docs/ARCHITECTURE.md` if it outgrows that section.
   - Does it change the database/Supabase behavior? → `docs/DATABASE.md`.
   - Does it change auth/authorization? → the relevant doc (create
     `docs/AUTHENTICATION.md` if this area gets complex enough to need one;
     it doesn't yet — auth is currently covered in `docs/DATABASE.md`'s RLS
     section and `README.md`'s architecture overview).
   - Does it change deployment? → `docs/DEPLOYMENT_GUIDE.md`.
   - Does it change how the feature should be tested? →
     `docs/TESTING_CHECKLIST.md`.
   - Does it introduce a substantial new subsystem? → a new
     `docs/<TOPIC>.md` — but first check nothing existing already covers
     it; never create a duplicate of a file in the map above.
   Base this on the actual feature being implemented, not a checklist to
   satisfy — only touch the files genuinely affected. Don't mechanically
   edit every documentation file after every change.
6. **Update documentation** — make the edits identified in step 5, in the
   same pass as the code (not deferred to "later"). Update each document
   in place rather than appending unrelated new files. Leave historical
   documents (`CHANGELOG.md` entries already written, `docs/
   FLOWOS_AUDIT_REPORT.md`) untouched — the audit report specifically is
   preserved as-is until a genuine re-audit, never edited to reflect a
   routine change.
7. **Consistency check** before finishing — verify each document you
   touched against the actual code (not just against other documents):
   - `README.md` doesn't contradict `PROJECT_STATUS.md`.
   - `PROJECT_STATUS.md` matches the actual code, not an aspiration.
   - The `CHANGELOG.md` entry describes what actually changed.
   - Architecture/database/deployment/testing docs match what the code
     actually does, not what was planned.
   - No document claims production verification, "all tests pass," or
     "feature complete" unless that was actually done and verified in
     this session. Use "not verified" / "requires manual verification" /
     "pending production testing" when something is genuinely unknown.
8. **Commit** — implementation and its documentation updates go in the
   same commit whenever appropriate (see Git section below), so the two
   never drift apart in history.

After committing, **report**: what changed, files touched (code and
docs), what was tested, what wasn't and why, and the recommended next
step.

## Status vocabulary

Use consistently in `PROJECT_STATUS.md` and `docs/ROADMAP.md`:
`Complete` (built and verified), `Implemented, not verified` (real code,
not run/tested — this is FlowOS's current status for everything
Supabase-related), `In Progress`, `Planned`, `Blocked` (state the reason).

## Git

Commit implementation and its documentation updates together (e.g.
`feat: add notifications and documentation`). Reserve a standalone
documentation commit for substantial restructuring, not routine updates.
Never force-push, rewrite history, or delete existing documentation
without first checking whether it holds information not captured
elsewhere.
