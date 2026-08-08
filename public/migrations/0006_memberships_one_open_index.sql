-- Phase 4 review triage, finding 5: a student could end up with two open (end_date IS
-- NULL) memberships if two plan-change POSTs raced -- the UPDATE-then-INSERT in
-- students/[id]/membership.js was two separate statements with no atomicity and no DB
-- backstop. This partial unique index makes "at most one open membership per user" an
-- enforced invariant rather than a hopeful one; membership.js now wraps the UPDATE+INSERT
-- in DB.batch() and catches a constraint violation as a 409. Local only -- production
-- migration is a later [HUMAN GATE] (plan/phase-4.md T4.10), re-verify
-- `SELECT COUNT(*) FROM memberships` is still 0 immediately before applying it there.
CREATE UNIQUE INDEX idx_memberships_one_open ON memberships(user_id) WHERE end_date IS NULL;
