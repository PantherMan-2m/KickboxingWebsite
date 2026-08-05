-- Phase 3: students RSVP "going" to an upcoming occurrence of a weekly class
-- Apply with: wrangler d1 execute cjn-academy --remote --file=./migrations/0002_session_rsvps.sql
-- (drop --remote for local dev against the emulated DB)

CREATE TABLE session_rsvps (             -- keyed to the weekly template + date, not a
                                          -- class_sessions row -- a session usually
                                          -- doesn't exist yet when a student RSVPs (the
                                          -- coach creates it later via the Attendance
                                          -- page). One-off sessions have no template, so
                                          -- they're not RSVP-able.
  template_id TEXT NOT NULL REFERENCES class_templates(id),
  session_date TEXT NOT NULL,            -- 'YYYY-MM-DD', the specific occurrence
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (template_id, session_date, user_id)
);
CREATE INDEX idx_session_rsvps_date ON session_rsvps(session_date);
