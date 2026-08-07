# Phase 3 Checkpoint Packet

**Status**: T3.0-T3.7 and T3.9 (docs) complete on `phase-3-waitlist`, **not merged** —
review is a separate fresh Sonnet session that didn't write this code, merge is
Giovanni's call. T3.8 (`[HUMAN GATE]`, env vars) is presented to Giovanni but not yet
confirmed — see "What's still open" below. Full evidence per task in
`reports/phase-3-completion.md`; this packet is for the Phase 3→4 checkpoint, not
re-deriving what Phase 3 did.

## What changed

Class capacity stops being a dead end: a full class waitlists instead of rejecting with
409, the oldest waitlisted student is promoted automatically the moment a spot frees
(going cancellation, or a coach raising capacity — one or many dates at once), and the
coach and the promoted student both get notified. `session_rsvps` gained a `status`
column (`going`/`waitlisted`); every one of the four sites that previously counted the
table unconditionally now filters on it, fixed in the same commit as the schema change
per the checkpoint's own fact 2 — this was the highest-risk part of the phase (a silent
capacity bug, armed but invisible until a waitlisted row existed) and is the thing most
worth spot-checking on review.

12 commits: migration + 4 filters (T3.0), the promotion helper (T3.1), RSVP contract
change (T3.2), the notification module (T3.3), wiring the two events (T3.4),
capacity-raise auto-promotion (T3.5), student UI (T3.6), coach visibility (T3.7),
`.dev.vars` gitignore (T3.8's local half), and docs (T3.9). 110 tests, 0 failures,
grown from 90 (immediately after T3.0) to 110.

## The three decisions (D1-D3), built as specified defaults

- **D1 — notify on waitlist join only, not capacity merely filling.** Built exactly as
  spec'd; no `class_full` event exists.
- **D2 — raising capacity auto-promotes.** Built. Both capacity write points
  (`templates/[id].js`, `sessions/[id].js` PATCH) call `promoteAndNotify` on every
  successful write.
- **D3 — waitlisted students see their position, not total queue length.** Built.
  `"Waitlisted — #2 in line"`.

None of the three were revisited by Giovanni during execution — they shipped as the
spec's recommended defaults. Still cheap to flip if he wants something different (see
each decision's note in `plan/phase-3.md` for what changes).

## What's still open (blocks calling Phase 3 fully done)

1. **T3.8's env var is now set** (`COACH_NOTIFY_EMAIL=info@cjnacademy.com`, confirmed
   present alongside the pre-existing `RESEND_API_KEY` via `wrangler pages secret list`)
   — done via `wrangler pages secret put` at Giovanni's explicit request, after the
   Cloudflare dashboard's plaintext Variables UI turned out to be disabled for this
   project ("managed through wrangler.toml"). **The live end-to-end email test is still
   outstanding** — that's a real write against production and needs Giovanni's separate
   go-ahead, plus it's untested whether the already-deployed production build picks up a
   secret set after deployment or needs a fresh deploy to see it. Until that test runs,
   the notification feature has **zero live verification** — everything so far is tested
   against a local no-op path (deliberately, per the "no test may send real email" rule)
   plus code review. This is the single biggest gap between "tests pass" and "actually
   works in production."
2. **Migration `0004` is not applied to production.** Needs a fresh backup + Giovanni's
   confirmation per T0.3, naturally sequenced after T3.8's env vars (no point testing
   against production before there's a notification destination configured). The
   production schema and the branch's code are currently out of sync — this is expected
   mid-phase, but means `phase-3-waitlist` cannot be merged/deployed until both this and
   the env vars land.
3. **No review yet.** Per `PLAN.md`'s review policy, Phase 3 is not on `/code-review
   ultra`'s reserved list (that's Phases 4/7/8 — payments, account safety, the first
   unauthenticated write) — a fresh Sonnet reviewer session is the default here.

## Bucket-3 candidates for the reviewer (deliberate, not defects)

- **`going:false` (any status) is a hard DELETE, not a status flip** — inherited from
  Phase 2, still true. Promotion hangs off the DELETE's `RETURNING status`, one
  statement, no read-then-delete race.
- **A waitlisted student still appears on the attendance roster** (not hidden), just
  never pre-marked present and listed separately. Deliberate — they're still an active
  student who could show up and need attendance marked, distinct from "confirmed via
  RSVP."
- **The three non-counting `session_rsvps` sites in `rsvp.js` are deliberately
  unfiltered** on `status` (the existing-row check, the ambiguous-`changes` re-check,
  the cancel DELETE) — they need to find a row regardless of status, for logic rather
  than counting. Each is commented in place; don't "fix" these to add a status filter.
- **T3.4's browser verification used `button.click()`/`form.requestSubmit()` via JS**,
  not literal simulated clicks — the Browser pane's `computer` tool stopped compositing
  partway through this session (see the completion report's note). This is a tooling
  limitation for this session, not a claim about the code; the actual page event
  handlers still ran for real.

## What I'd want Opus's judgment on

1. **Is the T3.8/production gap acceptable to report as "Phase 3 complete, pending one
   manual step," or does it need to block calling the phase done at all?** My read: the
   code and local verification are complete and solid; the live-email step is
   inherently something only Giovanni can trigger (dashboard access + a real inbox to
   check), so gating the whole phase's "done" status on it seems like the wrong
   granularity — but that's a judgment call about how this program reports phase
   completion, not a code question.
2. **Does Phase 4 (payments) interact with the waitlist in a way that needs deciding
   now rather than later?** `PLAN.md`'s carried-forward note says "flag only, no
   enforcement" for an overdue member's RSVP — worth confirming that also means
   promotion ignores overdue status (a waitlisted-and-overdue student still gets
   auto-promoted like anyone else) before Phase 4 is spec'd in detail.

## Test suite

110 tests, 0 failures, on the `phase-3-waitlist` branch (not yet merged to `main`).
8 new test files (`waitlist-filters`, `waitlist-promotion`, `waitlist-rsvp`, `notify`,
`waitlist-notify`, `waitlist-capacity-promote`, `waitlist-upcoming`,
`waitlist-coach-visibility`) plus amendments to 1 existing file (`rsvp-capacity.test.mjs`,
3 assertions updated for the 409→200 contract change, the rest untouched). `rsvp.test.mjs`
(7 tests) passes **unmodified** — none of its scenarios touch capacity/waitlisting.
