-- Coach/student login + attendance tracking (Phase 1)
-- Apply with: wrangler d1 execute cjn-academy --remote --file=./migrations/0001_initial.sql
-- (drop --remote for local dev against the emulated DB)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,        -- 'pbkdf2:sha256:<iterations>:<salt_b64>:<hash_b64>'
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach','student')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (                     -- login sessions (cookie-backed), not class sessions
  id TEXT PRIMARY KEY,                      -- this value IS the cookie value
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE class_templates (               -- fixed weekly recurring schedule
  id TEXT PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun..6=Sat (JS Date.getDay())
  start_time TEXT NOT NULL,                  -- 'HH:MM' 24h
  end_time TEXT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_sessions (                -- actual dated instances, created on demand
  id TEXT PRIMARY KEY,
  session_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  template_id TEXT REFERENCES class_templates(id),  -- NULL = one-off (e.g. extra Friday class)
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_class_sessions_date ON class_sessions(session_date);
CREATE UNIQUE INDEX idx_class_sessions_template_date
  ON class_sessions(template_id, session_date) WHERE template_id IS NOT NULL;

CREATE TABLE attendance (
  session_id TEXT NOT NULL REFERENCES class_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('present','absent','excused')) DEFAULT 'absent',
  marked_by TEXT NOT NULL REFERENCES users(id),
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX idx_attendance_user ON attendance(user_id);
