# Phase 8 — Public trial bookings

**Status**: Mapped at phase level only; not yet detailed into tasks. Depends on Phases 2, 3, 7.
`/code-review ultra` is reserved for this phase (first unauthenticated write endpoint) — see
`PLAN.md`'s "Review policy".

Non-members book a trial class from the public site, consuming the same capacity as member
RSVPs so the headcount stays honest. This is the **first unauthenticated endpoint that writes
real rows** — the contact form only sends email. That is a genuine change to the threat model:
needs rate limiting (Phase 7), abuse protection, a per-person trial limit, and a decision on
whether a booking creates a `pending` user or a separate `trial_bookings` record.

**Open question** (see `PLAN.md`): does a trial booking create a `pending` user (reusing the
Phase 2 approval flow) or a separate record? Leaning `pending` user, for reuse.
