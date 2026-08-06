# Phase 4 — Memberships and payment recording

**Status**: Mapped at phase level only; not yet detailed into tasks. Depends on Phases 0, 1.
`/code-review ultra` is reserved for this phase (real money involved) — see `PLAN.md`'s
"Review policy".

Record-only: no gateway, no card data, no PCI scope. Coach-defined plans (name, price, allowance
count, period). A payments ledger recording money already collected out-of-band, with
`recorded_by` for audit. Overdue status surfaced on the attendance roster, where it's actually
actionable. Schema designed so a gateway *could* attach later without a rewrite.

**Open question** (see `PLAN.md`): what happens to an overdue member's RSVP? Current assumption:
nothing, flag only, consistent with the over-limit decision in Phase 5.
