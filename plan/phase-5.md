# Phase 5 — Attendance intelligence

**Status**: Detailed into tasks T5.0–T5.9 at the Phase 4→5 checkpoint, 2026-08-09.
Depends on Phases 2 and 4 — both done, merged, live.

Over-limit flags, dormant-student alerts, basic reporting. This is the phase where
Phase 4's `allowance_per_period` (D7) stops being dormant.

---

## Real-world facts, confirmed by Giovanni 2026-08-09

Asked before designing, per the Phase 4 precedent. Each of these overrode a default the
spec would otherwise have shipped wrong.

1. **A "One Class / week" student is entitled to 5 classes in a 5-week month.** They
   bought a weekly cadence, not a monthly quota. This is the fact that matters most —
   see "The seeded-data trap" below.
2. **Only attendance marked `present` consumes an allowance.** A student who books and
   does not turn up keeps their class. `absent` and `excused` never count.
3. **Over-limit is a flag, never a block.** Coach-visible only; the student is not told.
   Symmetric with Phase 4's answer for overdue.
4. **Dormant is 14 days with no attendance.** Giovanni chose the earliest of the options
   offered, knowing it will fire on holidays, illness and travel — the preference is to
   see it and dismiss it rather than miss it.

### The seeded-data trap (found at the checkpoint, before any code)

Migration `0005` seeded:

| Plan | Price | `allowance_per_period` | `period` |
|---|---|---|---|
| Drop-in | R150 | 1 | `session` |
| **One Class / week** | **R550** | **4** | **month** |
| Unlimited | R800 | NULL | `month` |

A given weekday falls five times in roughly a third of all months. Read literally —
4 per calendar month — **every "One Class / week" student would show OVER LIMIT in about
four months a year, for attending exactly once a week as they paid to.** This is the
same shape as the Phase 4 bug that fact-finding caught (every drop-in student reading
OVERDUE on day one), and it was already sitting in production data. Fact 1 above is the
answer: the allowance window is the **week**, and the stored data is wrong, not just the
reading of it.

---

## Decisions

- **D1 — The allowance window is separate from the billing period.** `period` stays
  exactly as Phase 4's D2 defined it (`'month'` or `'session'`; only `'month'` backs a
  membership; immutable via PATCH) — it is a *billing* column and Phase 5 does not touch
  its meaning. A new `membership_plans.allowance_window` (`'week' | 'month'`, NOT NULL
  DEFAULT `'month'`) says what the allowance counts over. `plan_weekly` becomes
  `allowance_per_period = 1, allowance_window = 'week'`.
  *Rejected*: setting `plan_weekly.allowance_per_period = 1` with no window column and
  declaring "the window is always the week". It happens to be true for all three current
  plans, but a column literally named `allowance_per_period` sitting next to
  `period = 'month'` and meaning "per week" is a landmine for a future session, and it
  cannot express "8 classes a month" if Giovanni ever adds such a plan.
  Unlike `period`, `allowance_window` **is** editable via PATCH — it is a product
  decision, not a billing invariant.
- **D2 — Only `attendance.status = 'present'` consumes an allowance.** Never
  `!= 'absent'`. `excused` exists precisely so a coach can record a miss that shouldn't
  count, and this is the first feature that gives it teeth. See the hard constraint below
  — this is the `session_rsvps` unfiltered-`COUNT` lesson repeating on a different table.
- **D3 — Computed at read time, never stored.** No `is_over_limit` column, no cron. Same
  reasoning as Phase 4's D4, and the same invalidation problem if anyone ever wants to
  cache it.
- **D4 — Flag only, coach-visible only.** Never blocks an RSVP, never appears on
  `student/dashboard.html`. Giovanni was offered the tell-the-student variant and
  declined it.
- **D5 — Dormant = an active user, with an open membership, and no `present` attendance
  in the last 14 days.** The two scopes are deliberate: a deactivated student is gone,
  not dormant, and a drop-in student never committed to a cadence so has no baseline to
  fall away from. `DORMANT_DAYS = 14`, hardcoded and named, like `PAYMENT_GRACE_DAYS`.
- **D6 — Weeks start Monday, in SAST.** Consistent with South African convention and
  with the existing fixed +2h offset. No new notion of "today" is introduced — this
  builds on `_utils/dates.js`, per the two-notions-of-today note in
  `plan/codebase-map.md`.
- **D7 — A NULL allowance is never over-limit.** Unlimited (R800) has
  `allowance_per_period IS NULL`; the flag is simply not evaluated. Drop-in never backs a
  membership (Phase 4 D2), so it is never evaluated either. In practice **exactly one of
  the three current plans can ever be over-limit.**
- **D8 — One additive migration, no new tables.** `0007` adds one nullable-with-default
  column to `membership_plans` and updates one seeded row. The blast radius is the plan
  *catalogue*, not `memberships` or `payments`.

## Hard constraints

- **`public/functions/api/student/rsvp.js` and `_utils/waitlist.js` are not edited in
  Phase 5.** Same constraint Phase 4 carried, for the same reason (D4): a flag with no
  enforcement touches no write path.
- **Every count against `attendance` filters `status = 'present'` explicitly.** An
  unfiltered `COUNT(*)` against this table is a bug by construction — `mark-attendance.js`
  writes a row for the **whole roster**, not just those present (see
  `plan/codebase-map.md`), so an unfiltered count returns the roster size, not the
  attendance. Grep to verify at the end of the phase:
  `grep -rn "FROM attendance" public/functions` — every counting hit filters on `status`.
- **`attendance` has no date column.** It joins `class_sessions` on `session_id` for
  `session_date`. Every windowed query is a JOIN, not a lookup. `idx_attendance_user`
  covers `user_id` only; there is no index supporting the date range. Fine at gym scale —
  record it here rather than re-deriving it.
- **One grouped query per page load, never a per-student loop.** Reuse
  `_utils/payments.js`'s `paymentStatusForRoster` shape — it is the precedent, per the
  Phase 4 checkpoint packet. The query count must not scale with roster size.
- **Zero new tables.** If a task appears to need one, stop and re-examine the task.

---

## Tasks

`Depends on` is literal; exit conditions are demonstrated, not asserted.

### T5.0 — Decide the test-suite cost, before writing Phase 5's tests
**Depends on**: nothing. **Do this first.**

The suite is at **7.3 minutes**, up from ~65s at the end of Phase 0. `TODO.md` has
deferred `resetAndSeed()`'s subprocess-per-integration-file cost three times, each time
explicitly on the grounds that the suite was fast. **That reasoning has expired.** Phase 4
took integration files from 4 to ~11 and the suite grew ~7×; Phase 5 is query-heavy and
will add the most integration files of any phase so far. Deferring again means paying it
through the whole phase and arriving at Phase 6 worse off.

This is a decision task, not automatically a fix task. Measure first: time one integration
file in isolation and subtract, to get the actual per-file bootstrap cost, then decide.
The historical objection (making `db-reset-seed.js` importable risks state leaking between
files) is still valid and is the thing to design against — a shared reset with per-file
isolation is a different proposal from a naked in-process import.

**Exit**: a written decision in `TODO.md` with the measured per-file cost, and either a
merged fix or a recorded reason to accept the cost that does **not** say "the suite is
fast".

### T5.1 — Migration `0007`: `allowance_window`
**Depends on**: T5.0 (order only, so the suite cost is known before tests multiply).

Add `allowance_window TEXT NOT NULL DEFAULT 'month' CHECK (allowance_window IN
('week','month'))` to `membership_plans`; `UPDATE` `plan_weekly` to
`allowance_per_period = 1, allowance_window = 'week'`. **Local only** — production is
applied in T5.9, after review. Phase 4 inverted this order and `PLAN.md` now forbids it.

**Exit**: `wrangler d1 migrations list` shows `0007` locally applied and zero pending;
a local query returns `plan_weekly` with `allowance_per_period = 1`,
`allowance_window = 'week'`, and `period` **still** `'month'`.

### T5.2 — Week/month window helpers in `_utils/dates.js`
**Depends on**: nothing.

`sastWeekStartIso(dateIso)` (Monday, D6) and `sastMonthStartIso(dateIso)`, alongside the
existing SAST helpers. Do not add a third notion of "today".

**Exit**: unit tests covering a Sunday (belongs to the *previous* Monday's week), a
Monday, a month boundary that falls mid-week, and a leap-year February.

### T5.3 — `_utils/usage.js`: the batch query
**Depends on**: T5.1, T5.2.

`DORMANT_DAYS = 14`. `usageForRoster(db, userIds, todayIso)` → per user
`{ used, allowance, window, overLimit }`, where `overLimit` is
`allowance !== null && used > allowance`. **One grouped query** over
`attendance JOIN class_sessions`, filtered `status = 'present'`, windowed per D1/D6.
Model it on `paymentStatusForRoster` deliberately, including its null/empty-roster
handling.

**Exit**: unit tests for — a NULL allowance never flagging (D7); an `excused` row not
counting (D2); an `absent` row not counting; a 5th class in a 5-week month **not**
flagging a weekly-plan student (the trap above, written failing-first against the
pre-`0007` data if that is demonstrable); an empty roster returning no queries' worth of
garbage.

### T5.4 — Plans API + catalogue UI carry `allowance_window`
**Depends on**: T5.1.

`api/coach/plans.js` (GET/POST) and `plans/[id].js` (PATCH) accept and return it;
validation lives in `_utils/plans.js` beside `parsePeriod()`. Unlike `period`, it is
mutable (D1). Surface it in `coach/payments.html`'s catalogue editor.

**Exit**: a PATCH changing only `allowance_window` succeeds; an invalid value is a 400;
a PATCH containing `period` is **still** a 400 (Phase 4's rule, unregressed) — pinned by
test.

### T5.5 — Over-limit badge on the coach roster
**Depends on**: T5.3.

`api/coach/sessions/[id].js`'s GET adds `overLimit` to every row of `roster` and
`waitlist`, beside Phase 4's `paymentStatus`. One additional batch query — the endpoint
now makes two, and **still** does not scale with roster size. Badge on
`coach/session.html` next to the payment badge.

**Exit**: a test asserting the endpoint's query count is constant across a 1-student and
a 20-student roster; the badge visible on both lists.

### T5.6 — Dormant-student alert
**Depends on**: T5.3.

`GET /api/coach/dormant` — active users, open membership, no `present` attendance in
`DORMANT_DAYS` (D5). Surface on `coach/dashboard.html` beside the next-class panel.

**Exit**: tests for — a deactivated student not listed; a drop-in student (no membership)
not listed; a student whose only recent row is `excused` **is** listed; a student present
13 days ago not listed, 15 days ago listed.

### T5.7 — Basic reporting — **BLOCKED, needs Giovanni**
**Depends on**: T5.3, and an answer.

`plan/phase-5.md` inherited "headcount, attendance trends, revenue recorded" from the
phase map. That is three different products and the vaguest task in the phase — the one
most likely to be over-built. **Ask Giovanni what he would actually look at and how
often before designing this**, exactly as T5.0-era fact-finding was done for the
allowance. Do not guess a dashboard.

**Exit**: not specified until the question is answered.

### T5.8 — Asset version bump
**Depends on**: T5.5, T5.6, T5.7.

`styles.css?v=6`, `app.js?v=4` on **every** referencing page (`PLAN.md` rule 6).
Verify with `grep -rn "app\.js?v=" public`.

### T5.9 — Docs, review, merge, migrate, deploy — **in that order**
**Depends on**: all of the above.

Update `plan/codebase-map.md` (verb table, migrations, asset versions), the two
`public/docs/coach-student-system*.md` files, and write
`reports/phase-5-completion.md` with real command output.

Phase 5 is **not** an `ultra`-reserved phase — a fresh Sonnet reviewer gets
`git diff main...phase-5-attendance-intelligence -- . ':(exclude)reports/'`. Then:
**review → fix → merge → migrate production → deploy.** Migration `0007` reaches
production only at this point, preceded by a fresh backup (`PLAN.md` rule 5, now fully
live — production holds real financial records).

**Commit your work.** `git status` clean is an exit condition of every task above.

---

## Open questions

1. **T5.7's reporting scope** — blocking that task only. See above.
2. **Dormant alert delivery** — the alert is on-screen only as specified. Phase 3 built
   `_utils/notify.js` (email + optional webhook); whether a dormant student should also
   email the coach is unasked. Default is no — an on-screen list Giovanni checks beats a
   daily email he learns to ignore, and there is no scheduler in this stack anyway.
