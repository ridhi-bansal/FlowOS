# FlowOS — Manual Testing Checklist

Do these in order. Each one: **WHAT I DO → WHAT I SHOULD SEE → WHAT FAILURE
LOOKS LIKE**. Check items off as you go; if something fails, note it and keep
going rather than stopping — collect everything first, fix in one pass after.

## 0. Startup

**Do:** `npm install`, then `npm run dev`, open `http://localhost:3000`.
**Should see:** "Loading FlowOS…" briefly, then redirect to `/login`.
**Failure looks like:** a terminal error during `npm install`/`npm run dev`
(copy the exact error), a blank white page, or a browser console error
(⌘+Option+J to open it).

## 1. Signup (local mode — no `.env.local` yet)

**Do:** Click "Create one," fill in name/email/any password (4+ chars), submit.
**Should see:** Redirected straight to `/dashboard`, greeting shows your name.
**Failure:** Error message, stuck on the signup page, or redirected but blank.

## 2. Demo data present

**Do:** Look at the Dashboard.
**Should see:** Populated cards — a fictional student's tasks/goals/habits
already there (seeded automatically on first load).
**Failure:** Everything empty (seeding didn't run) or an error in the console.

## 3. Logout / Login

**Do:** Settings → Log out. Then log back in with the same email/password.
**Should see:** Returns to login, then back to the same dashboard with the
same data.
**Failure:** Data missing after re-login, or login rejects correct credentials.

## 4. Refresh persistence

**Do:** Create a task, then hard-refresh the page (⌘+R).
**Should see:** Task still there.
**Failure:** Task disappeared — this would mean IndexedDB isn't persisting.

## 5. Task CRUD

**Do:** Tasks → "+ Add task" → fill name/priority/due date/duration → Save.
**Should see:** Appears immediately in the list and on the Dashboard's "Due
Today" or "Upcoming" card without a refresh.
**Do:** Click the task → change priority → Save.
**Should see:** Change reflected everywhere immediately.
**Do:** Click the checkbox to complete it.
**Should see:** Strikethrough, moves to Completed tab.
**Do:** Uncheck it.
**Should see:** Moves back out of Completed.
**Do:** Edit it again → Delete → confirm.
**Should see:** Gone from every list.
**Failure:** Any of the above not reflecting immediately, or the task
reappearing after refresh despite being deleted.

## 6. Subtasks

**Do:** Open a task → add a subtask in the field at the bottom.
**Should see:** Subtask appears in that list, NOT as a separate top-level
task in Inbox/Today.
**Do:** Delete the parent task.
**Should see:** The subtask is also gone (cascade delete).
**Failure:** Subtask shows up standalone in Today/Inbox, or survives its
parent's deletion.

## 7. Projects

**Do:** Projects → "+ New project" → name/color/deadline → Save.
**Should see:** Card appears with 0% progress (no tasks yet).
**Do:** Open it → "+ Add task" → create 2 tasks → complete 1.
**Should see:** Progress bar updates to 50% immediately, on both the
Projects page and the Dashboard's Progress card.
**Do:** Delete the project.
**Should see:** A confirm dialog mentioning tasks will be kept but unlinked
— confirm, then check Tasks: the 2 tasks still exist, just with no project.
**Failure:** Progress not updating live, or deleting the project also
deleting its tasks.

## 8. Goals

**Do:** Goals → "+ New goal" → fill fields → Save.
**Do:** Open it → link the project you made in step 7.
**Should see:** Goal's progress bar matches the linked project's progress.
**Do:** In the goal, "+ Add task" (a direct task, no project).
**Should see:** It counts toward the goal's progress too, without double-
counting the project's tasks.
**Failure:** Progress numbers that don't add up, or a task counted twice.

## 9. Calendar

**Do:** Calendar → month view → click "+ Add event" → fill in a time → Save.
**Should see:** Appears on the correct day in the grid.
**Do:** Give a task (from step 5) a due date of today.
**Should see:** A dashed "◇" marker for it also appears on today's cell,
distinct from real events.
**Do:** Switch to Day view for today.
**Should see:** Both the event and the task deadline listed, correct times.
**Do:** On mobile width (resize browser narrow, or use phone), check the
month grid.
**Should see:** Smaller cells that still fit the screen, not overflowing.
**Failure:** Event on the wrong day (this is exactly the timezone bug class
— flag immediately if you see it), month grid broken/overflowing on narrow
screens.

## 10. Habits

**Do:** Habits → "+ New habit" → daily → Save.
**Do:** Click the checkbox to mark it done today.
**Should see:** Checkmark, streak shows "1 day streak."
**Do:** Check the Dashboard's "Today's rhythm" card.
**Should see:** Same habit shown as done.
**This is the specific bug that was reported — pay extra attention:** do
this test in the evening (after 6pm local time) if possible, since that's
when the UTC-vs-local bug would have shown up before the fix. Confirm the
habit logs against *today's* date, not tomorrow's.
**Failure:** Habit shows against the wrong day, especially in the evening.

## 11. Focus

**Do:** Focus → pick a task or type a custom goal → pick a duration → Start.
**Should see:** A live countdown timer.
**Do:** Switch to another browser tab for 30 seconds, come back.
**Should see:** Timer has kept counting accurately (not paused/reset) —
confirms it's computing from the real start time, not a naive tick.
**Do:** Click "Complete session" → rate it → save.
**Should see:** Shows in "Today's sessions," and Dashboard's rhythm card
updates.
**Failure:** Timer resets or freezes on tab switch, session not saved.

## 12. Journal

**Do:** Journal → answer a couple of prompts → Save.
**Do:** Refresh the page.
**Should see:** Your answers still there (same day = same entry, upserted).
**Do:** Check "Past entries" (won't show today's entry there — that's
correct, today's entry lives in the editor above).
**Failure:** Answers lost on refresh, or a duplicate entry created for the
same day.

## 13. Analytics

**Do:** Open Analytics.
**Should see:** Real charts reflecting the tasks/focus sessions you actually
created, not placeholder data. Insight text at the top referencing real
numbers (e.g., your actual completion rate).
**Failure:** Charts empty despite having data, or numbers that don't match
what you actually did.

## 14. Coach

**Do:** Open Coach from the sidebar, then also click the 🧭 icon in the
topbar from a different page (e.g. Habits).
**Should see:** Same page both times, showing your most important task
today, upcoming deadlines, and any patterns (postponed tasks, at-risk
projects/goals) — all referencing your real data.
**Failure:** Generic/empty output, or numbers not matching your actual data.

## 15. Settings & theme

**Do:** Settings → switch to Dark theme.
**Should see:** Instant switch, no flash.
**Do:** Refresh the page.
**Should see:** Stays dark, and — specifically — no flash of light mode
before it turns dark (this was a bug fixed this session; look closely at
the very first frame after refresh).
**Failure:** Any flash of the wrong theme, or theme not persisting.

## 16. Command palette

**Do:** Press ⌘K (Mac) or Ctrl+K (Windows/Linux) from any page.
**Should see:** Search box opens. Type part of a task name — it appears
in results. Type "Add Goal" — selecting it opens the goal form directly.
**Do:** Press Escape.
**Should see:** Closes.
**Failure:** Doesn't open, search finds nothing despite matching data, or
Escape doesn't close it (also test Escape on any other modal — task edit,
project edit, etc. — all 8 should close on Escape now).

## 17. Mobile / responsive

**Do:** Resize your browser to ~375px wide (or open dev tools' device
toolbar and pick an iPhone).
**Should see:** Sidebar collapses behind a ☰ menu button, content reflows
to single columns, Calendar's month grid shrinks but stays usable, no
horizontal scrollbar anywhere.
**Failure:** Any horizontal overflow, unreadable text, or the sidebar stuck
open covering the content.

---

## Cloud mode tests (only after you've connected Supabase — see the
deployment guide)

## 18. Supabase signup

**Do:** With `.env.local` configured and a fresh browser (or incognito),
sign up with a real email.
**Should see:** Either straight into the dashboard, or (if your Supabase
project requires email confirmation) a message telling you to check your
email — this is expected, not a bug.
**Failure:** A raw/unhandled error instead of a clear message either way.

## 19. Supabase persistence

**Do:** Create a task, goal, project. Refresh. Log out, log back in.
**Should see:** Everything still there.
**Failure:** Data missing after refresh or re-login (check the Supabase
dashboard's Table Editor to see if the row exists there at all — narrows
down whether it's a save problem or a fetch problem).

## 20. User A vs. User B isolation — the most important cloud test

**Do:** In one browser, sign up as User A, create 3–4 tasks with
distinctive names. In a second browser (or incognito window), sign up as
User B with a different email.
**Should see:** User B's Dashboard/Tasks are empty — none of User A's data
visible anywhere, in any page, including Analytics and Coach.
**Failure:** User B sees ANY of User A's data. If this happens, stop and do
not deploy — this means RLS isn't working and is a real security problem,
not a cosmetic bug.

## 21. Local → Cloud migration

**Do:** With existing local-mode data (from your earlier testing) and a
Supabase account connected, go to Settings → "Import local data" → "Check
for local data" → review the counts → "Import to my account."
**Should see:** A result showing counts imported per table, no errors.
**Do:** Check that the imported data now shows up throughout the app.
**Do:** Check Settings → local data is still there too (import doesn't
delete it) — you can then use "Reset local data" to clean it up once
you've confirmed the cloud copy looks right.
**Failure:** Errors during import, duplicated data, or missing tables.
