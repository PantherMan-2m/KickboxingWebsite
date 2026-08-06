-- Phase 2: optional per-class capacity, enforced on RSVP (T2.3) and surfaced on the
-- coach dashboard's next-class panel (T2.4).
-- Apply with: wrangler d1 migrations apply cjn-academy --remote
-- (drop --remote for local dev against the emulated DB)

-- NULL = no limit. Every existing row stays NULL after this migration, so nothing
-- changes for any student until a coach deliberately sets a cap.
ALTER TABLE class_templates ADD COLUMN capacity INTEGER;

-- NULL = inherit the template's capacity for that template_id + session_date (a
-- class_sessions row may not exist yet -- coaches create sessions on the day).
-- A non-NULL value overrides the template for this specific dated occurrence only.
ALTER TABLE class_sessions ADD COLUMN capacity INTEGER;
