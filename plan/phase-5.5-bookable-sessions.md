# Phase 5.5 — Bookable one-off sessions

**Status**: Mapped only. Created 2026-08-10, when a UI request ("let students book the
extra classes I add") turned out to need a schema change. Depends on Phases 2 and 3.
**Phase 8 depends on this.**

## Why it exists

Giovanni asked for extra one-off classes to be fully bookable — capacity, waitlist,
the lot — exactly like a recurring class. That is not achievable in the current model.

`session_rsvps` is keyed `(template_id, session_date, user_id)`. This is **deliberate,
not an oversight**: students RSVP to a class *before the coach has created its
`class_sessions` row*, so there is no session id to key to at RSVP time. The consequence,
already recorded in `plan/codebase-map.md`, is that a one-off session
(`template_id IS NULL`) can never carry an RSVP, and therefore can never be
capacity-limited or waitlisted either.

## Why it is a phase and not a task

The re-key touches the code `plan/codebase-map.md` flags as the most delicate in the repo:

- `api/student/rsvp.js` — the atomic
  `INSERT...SELECT...WHERE COUNT(status='going')<capacity ON CONFLICT DO NOTHING`.
- `_utils/waitlist.js` — `promoteWaitlist()` is the single place allowed to decide who
  gets promoted; its one-query guarantee is what stops concurrent callers over-promoting.
  Four call sites.
- Every `status='going'` count (`upcoming.js`, `next-class.js`, `sessions/[id].js`,
  `rsvp.js`) — the rule that an unfiltered count is a bug by construction.
- Effective-capacity resolution, `COALESCE(class_sessions.capacity,
  class_templates.capacity)`, which currently assumes a template exists.

Plus a migration against `session_rsvps`, which holds live RSVP data. Phase 3-sized.

## Design directions, not yet chosen

Decide at the phase's own checkpoint, with Giovanni's input:

1. **Alternative key** — add a nullable `session_id` to `session_rsvps` with a CHECK that
   exactly one of `(template_id, session_date)` or `session_id` is set. Smallest
   migration; every capacity/waitlist query then carries two modes forever.
2. **Unify on `class_sessions`** — materialise session rows for the RSVP window ahead of
   time (the system already computes this expansion via `expandTemplates()`), then key
   RSVPs purely on `session_id`. The cleaner end state and the one that most helps
   Phase 8; the larger migration and backfill.

Direction 2 is the architecturally honest one and should be costed properly before
direction 1 is chosen for being smaller — direction 1's "two modes forever" tax lands on
exactly the code that must not become harder to reason about.

## Interaction with Phase 8

Phase 8 (public trial bookings for non-members) needs a bookable class occurrence for
someone who is not yet a user. That is the same primitive. Phase 8's open question in
`PLAN.md` — whether a trial booking creates a `pending` user or a separate record —
should be re-read once this phase's direction is chosen, because direction 2 changes what
"a booking" attaches to.

## Until it ships

Extra one-off classes are coach-visible only (`plan/feat-schedule-ux.md`, T-UX.5, where
they render with `—` spots rather than `0`, since `0` would read as "full"). Students are
told about them out of band.
