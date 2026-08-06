# Phase 7 — Account safety

**Status**: Mapped at phase level only; not yet detailed into tasks. Depends on Phase 0.
`/code-review ultra` is reserved for this phase (account security) — see `PLAN.md`'s
"Review policy".

Self-service password reset (currently manual SQL — this will bite the moment trial users
onboard, and it will bite on a class night). IP-based rate limiting on `/api/auth/login` and,
critically, on the Phase 8 public endpoints. Audit trail for membership and payment changes.
**Sequenced before Phase 8 because Phase 8 opens the first unauthenticated write endpoint and
must not ship without rate limiting.**
