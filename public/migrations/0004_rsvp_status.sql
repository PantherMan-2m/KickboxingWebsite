-- Phase 3: waitlist. A session_rsvps row can now mean "going" or "waitlisted"
-- instead of always meaning "going". DEFAULT 'going' backfills every existing
-- row correctly by construction -- every row that exists today means "going".
-- Validated in application code, not a CHECK constraint (SQLite's ALTER TABLE
-- ADD COLUMN is constrained, and this codebase has no CHECK constraints to be
-- consistent with).
-- Apply with: wrangler d1 migrations apply cjn-academy --remote
-- (drop --remote for local dev against the emulated DB)

ALTER TABLE session_rsvps ADD COLUMN status TEXT NOT NULL DEFAULT 'going';

CREATE INDEX idx_session_rsvps_queue
  ON session_rsvps(template_id, session_date, status, created_at);
