# Phase 3 Completion Report

Branch `phase-3-waitlist`, off `main` at `c2a843b` (the Phase 2→3 checkpoint doc commit,
itself off `8552e87`/`ac9d39f`). **Not yet merged** — review is a separate fresh Sonnet
session per `PLAN.md`, and the merge is Giovanni's call. 12 commits on the branch (10
feat/fix + 1 chore + 1 docs). Migration `0004` applied **locally only**; production
application is T3.8, a `[HUMAN GATE]` blocked on Giovanni's confirmation in the
Cloudflare dashboard (see T3.8 below — not fully closed by this report). Full suite:
**110/110** at the time of writing.

---

## T3.0 — Migration `0004`, and every counting site in the same commit

**Exit conditions**: `migrations list` shows zero pending locally; every existing row
backfills to `status='going'`; four before/after tests (one per counting site); grep
shows every `FROM session_rsvps` hit is filtered or annotated.

**Evidence**:
- `wrangler d1 migrations list cjn-academy --local` → `✅ No migrations to apply!` after
  `npm run db:reset` (applies `0001`-`0004`).
- Backfill: `SELECT COUNT(*) FROM session_rsvps WHERE status <> 'going'` → `0` on a fresh
  seed (0 total rows either way — the seed doesn't create any RSVPs — so also confirmed
  via `rsvp-capacity.test.mjs`'s existing tests, which create real rows through the API
  and read `status='going'` back correctly).
- `test/integration/waitlist-filters.test.mjs`, 4 tests, **each shown failing before the
  filter and passing after** (all four failed with the unfiltered code — e.g.
  `rsvp.js:82` returned `409` for a capacity-1 class with one waitlisted-only row;
  `upcoming.js:28` reported `attending:2` instead of `1`; `next-class.js:30` selected
  the wrong template because two isolation-bug templates tied for "next" — a
  self-inflicted test bug caught and fixed before the real assertions ran;
  `sessions/[id].js:43` showed a waitlisted student `going:true`). All 4 passed after
  adding `AND status = 'going'` to the four sites.
- `grep -rn "FROM session_rsvps" public/functions` — 10 hits: 4 filtered (the counting
  sites above), 3 annotated as deliberately unfiltered for logic, not counting
  (`rsvp.js`'s existing-row check, its ambiguous-`changes` re-check, the cancel
  `DELETE`), 3 more added by later tasks (T3.1's `waitlistPosition`/`waitlistCount`, all
  filtered).

Full suite after this task: **90/90**.

---

## T3.1 — `_utils/waitlist.js`: the promotion helper

**Exit conditions**: deterministic promotion order including same-second ties; two
concurrent calls with one free spot promote exactly one; zero when full; all when
unlimited; `going` count never decreases.

Nothing calls this helper yet (T3.2 wires it in), so it's tested directly against a real
local D1 binding — `wrangler`'s `getPlatformProxy({persist: true})`, confirmed
empirically to read/write the exact same on-disk state `wrangler pages dev` uses,
**provided the process's cwd is `public/` when the proxy opens** (verified by testing an
absolute `persist` path from the repo root, which did *not* work, vs. `chdir`ing into
`PUBLIC_DIR` first, which did — `test/helpers/db.mjs` encodes this).

**Evidence**: `test/integration/waitlist-promotion.test.mjs`, 5 tests, all passing:
- 3 waitlisted (two sharing a `created_at` second) + 1 spot freed → the earliest
  `created_at` promoted; the same-second tie broken by `user_id`; a second call with no
  further free spots promotes nobody.
- Two concurrent `promoteWaitlist` calls with exactly 1 free spot →
  `a.length + b.length === 1` (not 0, not 2).
- Capacity 1, 1 going, 1 waitlisted → `[]` (still full).
- Capacity `null`, 3 waitlisted → all 3 promoted.
- `going` count asserted non-decreasing across two successive calls.

Full suite: **95/95**.

---

## T3.2 — RSVP becomes waitlist-aware

**Exit conditions**: full class → 200 `status:'waitlisted'`, not 409; a `going`
cancellation promotes the oldest waitlisted student, a `waitlisted` cancellation
promotes nobody; re-RSVP idempotent from both statuses; `rsvp.test.mjs` and
`rsvp-capacity.test.mjs` pass, amended only where the 409→200 contract changed.

**Evidence**: `rsvp-capacity.test.mjs`'s three tests that asserted the old 409 were
rewritten for the new contract (waitlist join, auto-promote-on-cancel, concurrent
outcome now `[going, waitlisted]` not `[200, 409]`) — each amendment preserves the
underlying invariant the test was actually checking (capacity enforcement, exactly-one
winner, row counts). `rsvp.test.mjs` (unaffected by the contract change — none of its 7
tests touch capacity) passes **unmodified**. New `test/integration/waitlist-rsvp.test.mjs`,
2 tests: a waitlisted student's cancellation leaves a second waitlisted student
untouched (status checked directly against the DB, not via `/upcoming`'s `going` field,
which doesn't distinguish "has a row" from "status=going" until T3.6); re-RSVPing while
waitlisted returns the same `position` and writes no second row.

Full suite: **97/97**.

---

## T3.3 — `notify.js`: the notification module

**Exit conditions**: `buildEvent` tested for both event types (subject + round-trippable
body); no-op with no env vars; an injected failing dispatcher doesn't reject; no
hardcoded recipient.

**Evidence**: `test/unit/notify.test.mjs`, 4 tests:
- `buildEvent('waitlist_joined', ...)` → exact subject
  `[CJN][WAITLIST_JOINED] Mon 18:00 Adults — 2026-08-10`; body round-trips through a
  naive `key: value` parser.
- Same for `waitlist_promoted`.
- No env vars → `notifyCoach`'s dispatched promise resolves without throwing.
- `COACH_WEBHOOK_URL` pointed at `http://127.0.0.1:1/hook` (connection refused,
  a genuine `fetch`-level rejection) → the dispatched promise still resolves, not
  rejects — the `try/catch` around the webhook `fetch` is doing its job.

`grep -rn "@cjnacademy\|@gmail" public/functions` → 2 hits, both pre-existing sender
addresses in `contact.js`/`email.js`, no notification recipient hardcoded.

Full suite: **101/101**.

---

## T3.4 — Wire the two events

**Exit conditions**: a waitlist join emits exactly one `waitlist_joined`, a repeat RSVP
emits none; a promoting cancellation emits one `waitlist_promoted` naming the student,
recipients include the student's own address; two simultaneous promotions emit two
events.

**Evidence**: `test/integration/waitlist-notify.test.mjs`, 3 tests. Calls `rsvp.js`'s
`onRequestPost` directly (bypassing `wrangler pages dev`'s HTTP layer) against a real
local D1 binding, with a hand-built `context.waitUntil` that captures dispatched
promises, and `globalThis.fetch` monkey-patched for the test's duration to intercept
outbound calls instead of hitting the real network:
- Fill the one spot (no dispatch) → second student joins the waitlist (exactly 1 fetch
  call, subject + `queueLength:1` confirmed) → same student re-RSVPs (0 further calls).
- Fill + waitlist one student (join dispatch discarded) → the going student cancels →
  exactly 2 fetch calls (coach + the promoted student), recipients
  `['active2@seed.test', 'coach@example.test']`.
- Directly manipulated DB state (1 going, 2 waitlisted, capacity raised 1→3 via SQL,
  since T3.5's endpoint wiring doesn't exist yet) + a direct `promoteAndNotify` call →
  2 fetch calls, one per promoted student (coach email deliberately unset, isolating the
  per-student count).

Full suite: **104/104**.

---

## T3.5 — Auto-promote when capacity is raised

**Exit conditions**: raising a template's capacity by 1 with 3 waitlisted across 2 dates
promotes exactly one per date, oldest first, one event each; lowering leaves every
`going` row untouched; past dates never touched.

**Evidence**: `test/integration/waitlist-capacity-promote.test.mjs`, 3 tests, calling the
PATCH handlers directly (same direct-D1 pattern as T3.4) with a `fetch` spy:
- Template capacity 1→2 with `date1` (1 going + 2 waitlisted, A before B) and `date2` (1
  going + 1 waitlisted C), plus a **past date** with its own going+waitlisted row → A
  promoted on `date1` (not B), C promoted on `date2`, past date's going and waitlisted
  rows both untouched, exactly 2 dispatch calls (one per promotion).
- Template capacity 3→1 (lowering) with 3 going + 1 waitlisted → all 3 going rows
  unchanged, the waitlisted row stays waitlisted, 0 dispatches.
- A session-level override 1→2 on one date promotes only that date, leaving a second
  date sharing the same template untouched.

Full suite: **107/107**.

---

## T3.6 — Student UI: join, position, leave

**Exit conditions**: three states render distinctly; leaving the waitlist removes the
row without promoting anyone; asset versions bumped if either changed.

**Evidence**: `test/integration/waitlist-upcoming.test.mjs`, 1 test covering all four
transitions via the real API contract (`rsvpStatus`/`waitlistPosition`/`going`): not
booked (`null`/`null`/`false`) → going (`'going'`/`null`/`true`) → waitlisted
(`'waitlisted'`/`1`/`false`) → left (`null`/`null`/`false`, with the other student's
`going` unaffected).

Manual browser walkthrough (dev server, real click events — see the note below on the
Browser pane): `/student/upcoming.html` showed "I'm going" on a not-yet-full class →
after a second student filled the one spot, reloading as the first student showed **"Join
waitlist"** → `button.click()` (dispatched through the page's own `addEventListener`)
produced **"Waitlisted — #1 in line (tap to leave)"** → clicking again returned to "Join
waitlist" with no promotion (nobody else waitlisted). No console errors.

No CSS or `app.js` changes were needed, so no asset-version bump — confirmed via
`grep -rn "app\.js?v=" public`, all 12 pages still `?v=2`.

Full suite: **108/108**.

---

## T3.7 — Coach visibility

**Exit conditions**: the panel's waitlist count matches a direct `COUNT(*)`; waitlisted
students appear in `created_at` order and are not in the attendance roster (T3.0's
pre-fill guarantee still holds).

**Evidence**: `test/integration/waitlist-coach-visibility.test.mjs`, 2 tests:
- `next-class.js`'s `waitlisted` field matched a direct
  `SELECT COUNT(*) WHERE status='waitlisted'` both at 0 and at 1.
- A session's `waitlist` array contained the correct single waitlisted student, and that
  student's roster row still read `going:false` (not pre-marked present).

Manual browser walkthrough: dashboard panel showed **"1 / 1 going (0 spots left) · 1
waitlisted"**; the session page showed the going student with a normal RSVP checkmark
and a separate **"Waitlisted (1)"** list below the attendance table, naming the
waitlisted student — not a table row, not pre-checked present.

Full suite: **110/110**.

---

## T3.8 — Configure notification env vars `[HUMAN GATE]`

**Status: not fully closed.** This task is Giovanni's action in the Cloudflare
dashboard, presented but not yet confirmed as of this report:

- `COACH_NOTIFY_EMAIL=info@cjnacademy.com` (confirmed value, per Giovanni), plus
  optionally `COACH_WEBHOOK_URL`/`COACH_WEBHOOK_SECRET` — **to be set by Giovanni** in
  Cloudflare Pages → Settings → Environment variables (Production). Not yet confirmed
  done.
- `public/.dev.vars` created locally with all three names left empty (gitignored — it
  wasn't in `.gitignore` before this, added in the same commit). Full suite re-run with
  the file present: **110/110**, confirming the empty values still take the no-op path
  (`Using secrets defined in .dev.vars` appeared in wrangler's own output, and behaviour
  was unchanged).
- **Not done**: the one real end-to-end waitlist join on production producing one email.
  This requires the dashboard variable to be set first, then Giovanni's explicit
  go-ahead to trigger a live write against production (per `PLAN.md` rule 4/5) — neither
  has happened yet.

Migration `0004` is **not yet applied to production** either — that also needs a fresh
backup and Giovanni's confirmation per T0.3, and hasn't been requested yet since T3.8's
dashboard step comes first in the natural order (env vars configured before there's
anything to test against).

---

## T3.9 — Docs, map, and this report

`public/docs/coach-student-system.md` and `coach-student-system-technical.md` updated
(waitlist behaviour, the `status` column and its "every count must filter" rule, the two
new `_utils/` modules, the API reference, a new "Waitlist and notifications" section).
`plan/codebase-map.md` updated (page/function-tree/verb-table, the corrected
non-obvious-behaviours entry, migration `0004`'s local-only status, notification env
vars). This report and `reports/phase-3-checkpoint-packet.md` written last.

---

## A note on browser verification tooling

Partway through T3.6, the Browser pane's simulated mouse/keyboard input
(`computer` tool: `left_click`, `type`, `key`) stopped registering — clicks and
keystrokes produced no visible effect and no corresponding network request, while a
`screenshot` call failed with "the Browser pane is not displayed, so the page is not
compositing frames." All subsequent browser verification (T3.6, T3.7) used
`form.requestSubmit()` / `button.click()` via the page's own JavaScript context instead
of simulated input — this still exercises the real page code (the actual
`addEventListener` handlers, the actual `fetch` calls with the real session cookie), just
not via literal coordinate-based clicks. Every UI state described as "verified live in
the browser" above was confirmed this way, cross-checked against `get_page_text` and
`read_console_messages` (no errors). Automated tests remain the primary evidence; the
browser walkthroughs are corroborating, not sole, evidence for every UI claim.

---

## Discrepancies from `plan/phase-3.md`

None of substance in the code itself — every task's exit conditions were met as
specified. Two things worth recording for future planning:

1. **T3.0's own test file had a self-inflicted isolation bug** (documented in T3.0's
   evidence above): four tests each created a template on the same day-of-week/time,
   so `next-class.js`'s test picked the wrong "next" template. Caught immediately by the
   test failing for the *wrong reason* (template ID mismatch, not the counting
   assertion) rather than silently passing — exactly the kind of failure `PLAN.md`'s
   "show it failing before the fix" rule is meant to catch, just one level removed (a
   bug in the test harness itself, not the production code).
2. **T3.4's third exit condition** ("a promotion of two students at once emits two
   events") names a scenario ("capacity raised by 2") that only becomes possible once
   T3.5's endpoint wiring exists — T3.4 predates it. Resolved by testing
   `promoteAndNotify` directly with the DB state a future capacity raise would produce,
   rather than waiting for T3.5. This is the correct call in retrospect: `promoteAndNotify`
   is the shared mechanism both T3.2's cancel path and T3.5's capacity-raise path go
   through, so pinning its multi-promotion behavior once, independent of caller, is more
   robust than re-deriving it per call site.

Everything else — the promotion SQL shape, the notification event/payload shapes, the
three-state UI contract, the coach-visibility placement — matched the spec as written.
