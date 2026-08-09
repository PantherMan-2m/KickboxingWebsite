# Phase 4 Checkpoint Packet

**Status**: Phase 4 complete — merged to `main` (`c13b9d0`), migration `0006` applied to
production, pushed, deployed, live-verified. Full evidence in
`reports/phase-4-completion.md`; this packet is for the Phase 4→5 checkpoint, not
re-deriving what Phase 4 did.

## What changed

Membership plans, payment recording, and a computed overdue flag. Three new tables
(`membership_plans`, `memberships`, `payments`), a plan catalogue + payments ledger for
coaches (`coach/payments.html`), plan assignment on `coach/students.html`, and a
read-only self-view for students (`student/dashboard.html`). The roster and waitlist
both carry `paymentStatus: 'paid' | 'overdue' | 'none'` (D6), computed at read time from
one grouped query per page, never stored (D4). 16 commits, 41 files, +3013/−78.
172 tests, 0 failures (grown from 115 at the end of Phase 3).

## The eight decisions (D1-D8), built as specified defaults

All eight shipped as specified — none were revisited by Giovanni during execution:

- **D1** — money is integer cents everywhere (`price_cents`, `amount_cents`,
  `price_override_cents`); Rand formatting only at display time.
- **D2** — `period` is `'month'` or `'session'`; only a `'month'` plan backs a
  membership. Drop-in (`period='session'`) never creates a membership row.
- **D3** — the family discount is `memberships.price_override_cents`, nullable,
  `COALESCE`d against the plan price — same override idiom as Phase 2's effective
  capacity.
- **D4** — overdue is computed, never stored. One expression in `_utils/payments.js`:
  `effective_paid_through = COALESCE(MAX(payments.covers_end), start_date - 1 day)`,
  `overdue = effective_paid_through < today - PAYMENT_GRACE_DAYS`.
- **D5** — `PAYMENT_GRACE_DAYS = 7`, hardcoded and named, not configurable.
- **D6** — three states, not two: `paid` / `overdue` / `none`. `none` is deliberately
  not a red flag (drop-in, brand-new, or ended memberships).
- **D7** — `allowance_per_period` is stored, read by nothing. **Still true after the
  review fixes** — nothing in the 5-finding fix pass touched it. Phase 5 is where it
  stops being dormant.
- **D8** — no speculative gateway columns. The record-only shape (`method` a widenable
  `CHECK`, `note` absorbing a reference) stays gateway-compatible without carrying dead
  columns.

## What the review found, and what it cost

`/code-review ultra` found 6 real findings (0 never-existed). 5 fixed on the branch, 1
(finding 1) real-but-rejected-as-a-fix, 1 (finding 3b, 8 pre-existing sites) logged as
out of scope. Full ranked table and reasoning in `reports/phase-4-review-triage.md`;
fix-by-fix evidence in the completion report. Two findings (1 and 4) traced to gaps in
the phase spec itself, not implementation drift — recorded there for attribution.

**The one process error**: the spec had T4.10 (migrate production) depend on T4.9 and
precede T4.11 (review), backwards from Phase 3's correct review-before-migrate order.
Cost nothing this time (production had zero rows in the new tables throughout), but is
now a standing rule in `PLAN.md` so Phases 7 and 8 don't repeat it.

## Deactivation, reactivation, and "freezing" — settled 2026-08-08

Raised by Giovanni at the review-triage stage, full detail in `plan/phase-4.md`.
Short version: reactivating a student already works (a single `status` toggle,
symmetric); deactivation doesn't touch memberships, so a reactivated student
immediately reads `overdue` if unpaid — correct, not a bug. "Freezing" a prepaid month
during a deactivation is **not representable** in the current date-range coverage
model and is not built — would need either a manual `covers_end` extension or a
credit-balance schema, neither of which is warranted while multi-month prepayment
doesn't exist. Revisit only if that changes.

## Live verification — what was actually observed, including one nuance

Recording a real payment against a real student on production did **not** show the
overdue→paid roster badge transition the runbook asked for, because the test
membership's `start_date` was the same day — D4's grace period already reads that as
`paid` before any payment exists. This is correct behavior (the exact scenario
`payment-status.test.mjs` pins), not a gap, but it means the *specific* transition
wasn't observed live. What *was* confirmed live: the three seeded plans on
`coach/payments.html`, a payment write reflected in the coach roster, and the same
payment appearing in the student's own history table on `student/dashboard.html`. Full
detail in the completion report's Step 4.

## Sensitivity note carried to Phase 9

`backups/` now holds financial records (amounts, methods, coverage dates, notes)
alongside password hashes from Phase 0. Flagged for Phase 9's POPIA review, which
already depends on Phase 4.

## What Phase 5 needs to know

1. **`allowance_per_period` (D7) is where Phase 5 starts.** "4 classes a month" becomes
   an over-limit flag. The open question Phase 4 deliberately left for Phase 5: does the
   allowance count *attendance* rows or *RSVPs*, and how does a waitlisted-then-promoted
   class count? D2's `period='month'` + calendar-month billing gives that count a
   well-defined window to run over.
2. **The `paymentStatusForRoster` batch-query pattern is the precedent to reuse**, not
   reinvent, if Phase 5 needs another per-roster computed flag — one grouped query per
   page load, not a per-student loop or a stored column.
3. **Finding 1's rejected fix is a live tripwire.** If multi-month prepayment is ever
   built, the `MAX(covers_end)` scoping question in `_utils/payments.js:44-58`'s comment
   has to be re-opened as a schema question, not patched in place.

## Test suite

172 tests, 0 failures, on `main`. New in this phase: `test/unit/payments.test.mjs`,
`test/integration/{membership,payment-status,plans,payments-ledger,
roster-payment-status,student-payments}.test.mjs`,
`test/unit/students-assign-plan.test.mjs` (the review-pass vm-DOM test for finding 6),
plus a one-line addition to `test/unit/shared-frontend.test.mjs` covering
`coach/payments.html`.
