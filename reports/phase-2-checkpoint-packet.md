# Phase 2 Checkpoint Packet

**Branch**: `phase-2-capacity`, off `main` at `80d9008` (7 commits ahead, unmerged).
**Written by**: the same session that wrote the code — not an independent verifier. Treat
the exit-condition table below as self-reported; per `PLAN.md`'s review policy a fresh
Sonnet reviewer session (not `/code-review ultra` — Phase 2 isn't on that reserved list)
should still check it against the code before T2.7 proceeds.

## What changed

T2.0 (`parseJsonBody` helper, adopted in the 4 routes this phase opens) → T2.1 (`0003_class_capacity.sql`,
verified against both a fresh seed and a real production-backup restore) → T2.2 (capacity
API + UI on `templates.js`/`templates/[id].js`/`sessions.js`/`sessions/[id].js`, new
`_utils/capacity.js`) → T2.3 (atomic capacity enforcement on `student/rsvp.js`, `upcoming.js`
enrichment) → T2.4 (`_utils/schedule.js` — `expandTemplates`/`selectNextClass` — new
`GET /api/coach/next-class`, `sastNowParts`/`sastTodayIso`, `app.js?v=` bumped 1→2 on all 12
pages) → T2.5 (`attendanceSaved` on `sessions/[id].js`, pre-fill in `coach/session.html`) →
T2.6 (client-side roster search/filter on `coach/students.html`). One commit per task, in
order. T2.7 (production migration, merge, doc updates) not started — human-gated, per
instruction.

## What is open

Nothing bucket-2/3/4 to triage yet — this packet precedes the independent review T2.7 calls
for, so no findings exist to triage. The items below are judgement calls made during
implementation that a reviewer (or Giovanni) may want to weigh in on; none blocked a task's
exit condition, but none were explicitly specified by `plan/phase-2.md` either.

1. **`spotsRemaining` clamped to 0, not allowed negative.** `coach/next-class.js`:
   `Math.max(0, capacity - attending)`. An overbooked class (capacity lowered below an
   existing RSVP count) would otherwise show a negative number. Not specified either way in
   the phase-2 spec; seemed like the less confusing default.
2. **Session-level capacity override UI lives on `coach/session.html`** as a standalone form
   next to the roster, not integrated into the attendance-marking flow visually. Matches the
   amended spec's instruction (attendance.html's bare "Create session" button has no form to
   extend), but the resulting page now has two independent save actions (capacity, then
   attendance) with two separate status lines — a minor UX seam, not a bug.
2b. **Session capacity save deliberately does not re-render the roster** (`refreshCapacityMeta()`
   only updates the capacity display), specifically to avoid discarding in-progress
   unsaved attendance selections. This is a real behavior difference from `coach/templates.html`'s
   full-reload pattern; flagging in case a reviewer expects the two pages to behave identically.
3. **T2.3's RSVP tests inject a third and fourth test-only student directly via SQL**
   (`test/integration/rsvp-capacity.test.mjs`), rather than reusing seeded accounts, because
   only `active1`/`active2` are usable without side effects (`mustchange1` is 403'd by
   middleware, `lockout1` is reserved for the lockout test per its seed comment). Same
   PBKDF2 hash format as `scripts/db-reset-seed.js`. Not a schema/behavior change, just a
   test-fixture note worth knowing before adding more RSVP tests.
4. **`todayIso()` now delegates to `sastNowParts(now).date`** rather than keeping its own
   independent computation. Behaviorally identical (same regression tests pass unchanged,
   confirmed before/after), but it's a structural change to a function every other phase's
   tests import — worth a reviewer's eyes even though nothing broke.
5. **Roster status filter has three options (all/active/inactive), default "all".**
   `coach/students.html`'s roster query returns `pending` students too (unfiltered by role
   status); "all" is the only option that shows them, since the filter doesn't have a
   dedicated "pending" bucket. Not specified in the spec beyond "active / inactive / all" —
   flagging in case pending students should be surfaced differently.

## Verification table (exit conditions, self-reported)

| Task | Exit condition | Evidence |
|---|---|---|
| T2.0 | Null body → 400 on every adopted route; `rsvp.js`'s existing test unchanged; suite green | `test/integration/parse-json-body.test.mjs` (3 tests) + existing `rsvp.test.mjs` unchanged; 55/55 at commit `0530d17` |
| T2.1 | Migration applies cleanly to fresh seed AND a real production-backup restore; `migrations list` pending→applied both ways | Manual two-path verification in commit `4d13379`'s message; both reconciled via the same `d1_migrations` procedure Phase 0 used on production |
| T2.2 | Persist/clear/inherit/override/validation table, all via direct API | `test/integration/capacity.test.mjs` (6 tests) + browser walkthrough (template capacity set/reload, session inherits then overrides, roster preserved across capacity save) |
| T2.3 | 409+no-row on full class, idempotent re-RSVP bypass, cancel/rejoin, NULL unlimited, concurrency race → exactly 1 winner, non-going observer sees `full:true` | `test/integration/rsvp-capacity.test.mjs` (3 tests) + browser walkthrough ("0 left"/"Full"/disabled button) |
| T2.4 | Next class correct across mid-week/later-today/week-rollover/00:30-SAST scenarios; attending matches direct COUNT; unlimited shows "N going" not "N/null"; empty state; upcoming.js refactor behavior-preserving | Pinning test written and passing *before* the `expandTemplates` refactor, re-run after (`test/integration/upcoming.test.mjs`); 9 unit tests on `selectNextClass`/`expandTemplates` including the SAST-vs-UTC case; 3 integration tests against real seed data; browser walkthrough (rolled-forward next class, capacity display, empty state, `getTimezoneOffset` absence confirmed structurally) |
| T2.5 | Never-saved pre-fills correctly; opening-without-saving writes zero rows; saved-absent beats RSVP-going on reopen; one-off always absent | `test/integration/attendance-prefill.test.mjs` (4 tests) + browser walkthrough of the save-beats-prefill regression specifically |
| T2.6 | Search filters case-insensitively; clearing restores all; status filter composes; empty state; works at 375px inside `.scroll-x` | Browser walkthrough only (no build step, pure DOM logic) — all 5 conditions checked individually, including a composed search+status-filter query and a computed-style check that `.scroll-x` has `overflow-x:auto` with the table inside it at mobile width |

Full suite after every task: green, growing from 52 (start) to 84 (final). No test skipped,
no test weakened to pass.

## Not done

T2.7 not started, per instruction — production migration, branch merge, live deploy,
`coach-student-system.md`/`-technical.md` updates, and `plan/codebase-map.md` updates all
remain, all human-gated.
