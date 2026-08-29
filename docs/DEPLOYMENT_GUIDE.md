# FlowOS — Beginner's Deployment Guide

Written assuming you've never used Git, GitHub, Vercel, Supabase, or
environment variables before. Follow in order:

```
LOCAL FLOWOS → SUPABASE → TEST TWO USERS → GITHUB → VERCEL → LIVE FLOWOS
```

---

## Part 9 — Supabase Setup

**What it is:** Supabase is a hosted Postgres database plus a ready-made
login system (Supabase Auth). Instead of you building a server, it gives
you one.
**Why you need it:** local mode only stores data in your own browser — for
a real multi-user app, you need somewhere that everyone's data actually
lives.

### 9.1 Create the project

1. Go to **supabase.com**, sign in (GitHub login is easiest), click **New
   project**.
2. Pick an organization (your account, usually), a project name (e.g.
   "flowos"), a **database password** — write this down somewhere safe,
   you won't see it again — and a region near you.
3. Click **Create new project**. Wait ~2 minutes.
4. **You'll know it worked** when the project dashboard loads with a
   sidebar (Table Editor, SQL Editor, Authentication, etc.) instead of a
   loading spinner.

### 9.2 Run the database schema

1. In the left sidebar, click **SQL Editor** → **New query**.
2. On your Mac, open `database/supabase-schema.sql` from the FlowOS
   project folder in any text editor, select all, copy.
3. Paste it into the Supabase SQL editor, click **Run** (or ⌘+Enter).
4. **You'll know it worked** when it says "Success. No rows returned" and
   the **Table Editor** (left sidebar) now shows ~20 tables (profiles,
   tasks, projects, goals, etc.).
   **Common error:** if you run it twice, you might see "already exists"
   errors for some objects — that's fine, the script is written to be
   safe to re-run; ignore those specific errors as long as the tables show
   up.

### 9.3 Find your API credentials

1. Sidebar → **Project Settings** (gear icon) → **API**.
2. You need two values now:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)
3. There's also a **service_role** key on this page —
   **do not use this anywhere in your app's frontend code or commit it to
   GitHub.** It bypasses all security rules. FlowOS doesn't currently need
   it at all; leave it alone.

**Which is safe to expose publicly?** The **Project URL** and **anon
public** key are *designed* to be public — they go in `NEXT_PUBLIC_*`
environment variables, which end up visible in your deployed site's
JavaScript, and that's fine. Real protection comes from the Row Level
Security rules in the database (already set up by the schema), not from
hiding these two values. The **service_role** key is the one genuine
secret — it must never appear in frontend code, `NEXT_PUBLIC_*` variables,
or a public GitHub repo.

### 9.4 Configure Auth settings

1. Sidebar → **Authentication** → **URL Configuration**.
2. Set **Site URL** to `http://localhost:3000` for now (you'll change this
   to your real domain after deploying to Vercel, in Part 11).
3. Sidebar → **Authentication** → **Providers** → **Email**: decide
   whether to require email confirmation before login. Either setting
   works with FlowOS — the signup page already handles both cases (shows
   "check your email" if confirmation is required, or logs you straight
   in if not).

### 9.5 Configure your local environment variables

1. On your Mac, in the FlowOS project folder, copy `.env.example` to a new
   file named **exactly** `.env.local`.
2. Open `.env.local`, fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your Project URL from 9.3>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key from 9.3>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
3. Save. Restart `npm run dev` if it was already running (env vars are
   only read at startup).
4. **You'll know it worked** when the login/signup page copy changes from
   "stored only in this browser" to "real account, backed by Supabase."

### 9.6 Test the database

1. Sign up with a real email on `localhost:3000`.
2. In Supabase → **Table Editor** → `profiles` table — you should see a
   new row with your user id.
3. Create a task in the app → check the `tasks` table in Supabase → the
   row should be there with your `user_id`.

### 9.7 Test two users / RLS

This is **Test 20** in the testing checklist — do it exactly as described
there. This is the single most important test before you consider this
safe to show anyone else.

---

## Part 10 — GitHub Setup

**What it is:** GitHub stores your code online and is what Vercel deploys
from. Git is the tool that tracks changes to your code over time.
**Why you need it:** Vercel deploys by watching a GitHub repository — no
GitHub, no automatic deployment.

### 10.1 Check what should and shouldn't be committed

Open `.gitignore` in the FlowOS folder — it should already contain
`.env.local` (confirm this — **if `.env.local` is not in `.gitignore`, do
not proceed until it is**, or your Supabase keys could end up in a public
GitHub history). Everything else in the project — all the `.ts`/`.tsx`
files, `package.json`, `database/supabase-schema.sql` — should be
committed; none of it is secret.

### 10.2 Create the repository

1. Go to **github.com**, sign in, click the **+** in the top right → **New
   repository**.
2. Name it (e.g. "flowos"), choose **Private** (recommended while
   testing) or Public, **don't** check "Add a README" (you already have
   files locally). Click **Create repository**.
3. GitHub shows you a page with commands — keep this tab open.

### 10.3 Push your code (Terminal, in the FlowOS folder)

```bash
git init
```
*Meaning: "start tracking this folder with Git."*

```bash
git add .
```
*Meaning: "stage every file for the next snapshot" (respects `.gitignore`
— `.env.local` won't be included).*

```bash
git commit -m "Initial FlowOS commit"
```
*Meaning: "save this snapshot with a label."*

```bash
git remote add origin <the URL GitHub showed you, ending in .git>
```
*Meaning: "connect this folder to that GitHub repository."*

```bash
git branch -M main
git push -u origin main
```
*Meaning: "upload the snapshot to GitHub."*

**You'll know it worked** when refreshing the GitHub repo page in your
browser shows all your files.
**Common error:** "repository not found" usually means a typo in the URL
from step 10.3, or you're not logged into git with the right account —
GitHub will prompt you to authenticate (a browser popup or a personal
access token) the first time you push.

---

## Part 11 — Vercel Deployment

**What it is:** Vercel builds and hosts your Next.js app, giving you a
public URL.
**Why you need it:** this is what makes FlowOS actually reachable by
anyone, not just `localhost` on your Mac.

### 11.1 Connect and import

1. Go to **vercel.com**, **sign in with GitHub**.
2. Click **Add New** → **Project**.
3. Find your `flowos` repo in the list → **Import**.
4. Vercel auto-detects Next.js — you don't need to change any build
   settings (Build Command, Output Directory, etc. are already correct by
   default).

### 11.2 Add environment variables

Before clicking Deploy: expand **Environment Variables** and add the same
three you put in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL   (leave this blank for now — you'll add it after
                        deploying, once you know your real URL)
```

### 11.3 Deploy

Click **Deploy**. Takes 1–3 minutes.
**You'll know it worked** when Vercel shows a screenshot preview of your
app and a **Visit** button.
**Common errors:** a build failure shows red text in the deployment log —
usually a TypeScript error. Since this hasn't been run/built before (see
the audit report's repeated caveat about no network access in the
development sandbox), **this is the single most likely place to hit a
real error for the first time** — read the error message, it'll point to
a specific file and line.

### 11.4 Fix the site URL loop

1. Copy your new URL (like `flowos-yourname.vercel.app`).
2. Vercel → your project → **Settings** → **Environment Variables** → add/
   edit `NEXT_PUBLIC_SITE_URL` to `https://flowos-yourname.vercel.app` →
   **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) for the change to
   take effect.
3. Back in Supabase → **Authentication** → **URL Configuration** → change
   **Site URL** to the same address. This makes password-reset and
   confirmation email links point to the right place.

### 11.5 Test production

Repeat the key tests from the testing checklist (signup, task CRUD, two-
user isolation) against your live Vercel URL, not just localhost —
they're not guaranteed to behave identically until you've actually checked.

### 11.6 What happens when you push new code later

Every `git push` to the `main` branch automatically triggers a new Vercel
deployment — no extra steps needed once this initial setup is done. See
the workflow below for how to do this safely.

---

## Part 12 — Future Update Workflow

**Git branches, in plain language:** think of `main` as "the version
that's live." A branch is a separate copy where you can make changes
without touching `main` until you're sure they work. If something goes
wrong on a branch, `main` (and your live site) is untouched.

### The safe workflow for any future change

1. **Pull latest code** (only matters if you've made changes from another
   computer): `git pull`
2. **Create a branch** for the change: `git checkout -b fix-dashboard-bug`
   (name it after what you're doing)
3. **Ask AI to inspect before modifying** — see the reusable prompt
   template below; always start with "inspect the current implementation
   first, don't rebuild existing functionality"
4. **Make the changes**
5. **Run locally**: `npm run dev`, check it in the browser
6. **Test** using the relevant section of the testing checklist
7. **Commit**: `git add .` then `git commit -m "Fix dashboard bug"`
8. **Push the branch**: `git push -u origin fix-dashboard-bug`
9. On GitHub, you'll see a prompt to open a **Pull Request** — this shows
   exactly what changed. Click **Merge** when you're satisfied (or just
   merge locally with `git checkout main && git merge fix-dashboard-bug &&
   git push` if you'd rather skip the PR UI for solo work)
10. **Vercel automatically deploys** the new `main` — check the
    Deployments tab for progress
11. **Test production** again after it deploys
12. **Roll back if necessary**: Vercel → Deployments → find the previous
    working deployment → **⋯** → **Promote to Production** — instant, no
    Git commands needed

### Concrete examples

- **"I want to change the Dashboard"** → branch → edit
  `app/(app)/dashboard/page.tsx` and/or `components/dashboard/*` → test
  locally → commit → push → merge → done.
- **"I want to add Google Calendar"** → this is a new integration, bigger
  scope — branch → this will likely need a new file under `lib/services/`
  or a new API route, plus new env vars for Google's API credentials
  (never commit those either) → test thoroughly before merging, since
  it touches external auth.
- **"I want to fix a bug"** → branch named after the bug → fix → test the
  specific broken flow → commit → push → merge.
- **"I want Claude/Codex to modify the project"** → see Part 13 below.

---

## Part 13 — AI Development Workflow

Reusable prompt template — use this every time you ask Claude (or another
AI) to change FlowOS:

```
Continue working on the existing FlowOS project. Do NOT rebuild or
redesign existing functionality.

Before making changes:
1. Inspect the current implementation of [feature/area] — read the
   actual files, don't assume from memory or past summaries.
2. Identify exactly which files are affected by this change.
3. Check whether existing services/providers already cover part of this
   — reuse them rather than duplicating logic.

Then implement: [describe the specific change you want]

Constraints:
- Preserve all existing functionality — this app is close to a real
  deployment, so treat existing behavior as something to protect.
- Don't add new dependencies unless genuinely necessary.
- Don't touch files unrelated to this change.
- After implementing, check that all imports still resolve and there
  are no broken references.
- Update PROJECT_STATUS.md with what changed.
- Tell me exactly which files changed and how I should test it — give
  me a short manual testing checklist for this specific change, same
  style as TESTING_CHECKLIST.md.

Work in one coherent pass. Don't stop to ask permission for small
implementation decisions — use good judgment and explain what you chose
at the end.
```

---

## Part 14 — Learning Resources

Best 1–2 per topic, official sources preferred.

| Topic | Resource | What you'll learn | Essential? |
|---|---|---|---|
| Git/GitHub | [GitHub's own "Hello World" guide](https://docs.github.com/en/get-started/quickstart/hello-world) | The exact commands you just used, explained slower | Essential |
| Git/GitHub | [Git Handbook (GitHub)](https://docs.github.com/en/get-started/using-git/about-git) | What a commit/branch/remote actually is conceptually | Optional but clarifying |
| Next.js | [Next.js App Router docs — "Getting Started"](https://nextjs.org/docs/app/getting-started) | How the `app/` folder routing FlowOS uses actually works | Essential if you'll edit pages yourself |
| Supabase | [Supabase Docs — "Row Level Security"](https://supabase.com/docs/guides/database/postgres/row-level-security) | Exactly what's protecting your users' data | Essential |
| Supabase | [Supabase Docs — "Auth Quickstart (Next.js)"](https://supabase.com/docs/guides/auth/quickstarts/nextjs) | How the login system FlowOS uses works under the hood | Optional (already built) but good for confidence |
| PostgreSQL basics | [PostgreSQL Tutorial (postgresqltutorial.com)](https://www.postgresqltutorial.com/) | Reading/writing basic SQL, useful for the SQL Editor | Optional |
| Vercel | [Vercel Docs — "Deploying"](https://vercel.com/docs/deployments/overview) | What actually happens on each deploy | Essential |
| Environment variables | [Next.js Docs — "Environment Variables"](https://nextjs.org/docs/app/guides/environment-variables) | Why `NEXT_PUBLIC_` vars are public and others aren't | Essential |

---

## Part 15 — Product Roadmap After Deployment

Prioritized by user value, differentiation, and complexity — not everything
should be built next, only the top few.

**Do first (highest value, lowest risk):**
1. **Fix whatever the two-user isolation test and general testing checklist
   surface** — this must happen before showing FlowOS to anyone else,
   full stop.
2. **A visual/aesthetic pass on Focus** (item #22) — cheap, high perceived-
   quality improvement, no architecture risk.
3. **Analytics: Focus Minutes as a line graph** (item #23) — trivial change
   (recharts already supports it), improves a page people will actually
   look at regularly.

**Do next (real differentiation, moderate complexity):**
4. **Habits: monthly/custom frequency** — closes an obvious gap in an
   already-built feature rather than starting something new.
5. **Journal: AI-generated prompts from user data** (item #16) — this is
   FlowOS's most differentiated possible feature (a coach that actually
   knows your week informing your reflection prompts), but do it with the
   *existing* local rule-based approach first (e.g. "you mentioned X task
   three times this week, has that been on your mind?") before reaching
   for an external AI API.

**Do later (bigger scope, real cost/risk):**
6. **External AI API integration** — only after the rule-based Coach has
   been used for a while and you know specifically where it falls short.
   Adding a paid API before knowing that is guessing.
7. **Google Calendar / Todoist integrations** — real user value but real
   complexity (OAuth flows, sync conflict handling) — worth doing once the
   core product has real usage validating it's worth the investment.
8. **Multi-user collaboration** (shared projects/teams) — a different
   product shape (single-user → multi-user-per-workspace), don't start
   this casually.
9. **Payments/subscriptions** — only once there's something people
   actually want to pay for, which you'll know from usage, not guessing.

**Consciously not prioritized without more information:** customer
support tooling and product analytics/telemetry (items #12–13) — these
matter once you have users, not before. Add them when you're about to
actually launch to people other than yourself.
