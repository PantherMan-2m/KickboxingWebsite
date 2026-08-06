# Phase 2 Checkpoint Packet

**Status**: Merged, deployed, live-verified. `main` at `ac9d39f`. Migration `0003` applied
to production 2026-08-07. Full evidence per task in `reports/phase-2-completion.md` — this
packet is for planning Phase 3, not re-deriving what Phase 2 did.

## What changed

T2.0-T2.6 built class capacity end-to-end (schema → API → UI → enforcement) plus the
stated headline goal (next-class headcount panel) and two smaller coach-time-savers
(attendance pre-fill from RSVP, roster search). A fresh Sonnet review pass found 3 real
bugs, fixed on the branch before merge (see below). All `[HUMAN GATE]` steps — backup,
`--remote` migration, push, deploy — were explicitly confirmed by Giovanni before running.
Live-verified: public smoke test (homepage, `app.js?v=2`, new endpoint correctly gated),
a byte-identical historical-attendance spot-check against the pre-migration backup, and
Giovanni's own confirmation that the dashboard panel and capacity-setting work live.

## Review fixes applied (bucket 1, all in scope, all fixed)

1. `student/rsvp.js`'s capacity-limited insert now has `ON CONFLICT ... DO NOTHING` — a
   double-submitted RSVP from the same user (racing the existing-row check) was throwing
   an uncaught PK-constraint error instead of responding gracefully. Disambiguates the
   now-ambiguous `meta.changes === 0` by re-querying the user's own row.
2. `_utils/capacity.js`'s `parseCapacity` now rejects by `typeof` before coercing —
   `true`/`[1]`/`{}` were passing as capacity `1` via `Number()`.
3. Removed a dead `catch` around a `fetchJson` call in `coach/session.html` (`fetchJson`
   never throws — `plan/phase-2.md` fact #2) that had slipped past the original build.

## What's open for Phase 3 (waitlist + coach notification)

1. **The 409 is the hook, nothing more.** `student/rsvp.js` returns `409 {ok:false,
   error:'This class is full'}` on a full class and writes nothing. Phase 3 turns that
   rejection into a waitlist join — no waitlist table, UI, or notification exists yet.
2. **Open question from `PLAN.md`, still unanswered**: notify the coach when a class
   *reaches* capacity, or only when someone *joins the waitlist*? Current assumption
   (stated in `PLAN.md`) is waitlist-join-only, since that's the actionable signal — this
   still needs a real decision before T3.x specs get written.
3. **Effective capacity can change out from under an existing waitlist** once one exists
   — a coach raising a template's capacity should presumably auto-promote waitlisted
   students, but nothing in Phase 2 handles that flow (there's no waitlist to promote
   into yet). Worth designing deliberately, not organically.
4. **The capacity resolution rule is stable and reusable**: `COALESCE(class_sessions
   .capacity, class_templates.capacity)`, resolved in four places already
   (`sessions/[id].js`, `student/rsvp.js`, `student/upcoming.js`, `coach/next-class.js`).
   Phase 3's waitlist logic should resolve capacity the same way, not reinvent it.
5. **Only `active`/`inactive` are distinct status-filter buckets on the roster** (T2.6);
   `pending` students only show up under "all". Not a Phase 3 concern, but noted in case
   a future roster-facing feature needs to reason about `pending` specifically.

## Judgement calls made without an explicit spec (from the original T2.0-T2.6 pass, still valid)

- `spotsRemaining` clamps to 0 rather than going negative (an overbooked class — capacity
  lowered below an existing RSVP count — would otherwise show a confusing negative number).
- The session-capacity override lives on `coach/session.html`, not `attendance.html`
  (attendance.html's "Create session" is a bare button, nowhere to put a field) — per the
  amended spec, not a new deviation.
- Saving a session's capacity override deliberately does **not** re-render the roster
  (`refreshCapacityMeta()` only updates the capacity display), so it doesn't discard
  in-progress unsaved attendance selections. `coach/templates.html`'s equivalent capacity
  save *does* re-render, since there's no roster to lose there — the two pages behave
  differently on purpose, not by oversight.
- Roster status filter defaults to "all" (matches pre-T2.6 unfiltered behaviour, so no
  student silently disappears from the coach's view the first time they load the page
  after this shipped).

## Operational note for future `[HUMAN GATE]` migrations

The first `wrangler d1 export --remote` attempt failed with a Cloudflare API auth error
(`code: 10000`) on the export endpoint specifically, even though `wrangler` otherwise
showed a valid-looking login with `d1 (write)` scope. An interactive `wrangler login`
refresh fixed it. If a future backup fails the same way, that's the first thing to try —
don't assume the D1 database or credentials are actually broken.

## Test suite

86 tests, 0 failures, confirmed on the merged `main` branch immediately before push (not
just on the feature branch pre-merge). Grew from 52 (Phase 1 baseline) to 86 across
T2.0-T2.6 plus the 3 review fixes.
