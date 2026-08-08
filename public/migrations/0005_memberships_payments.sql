-- Phase 4: membership plans, payments ledger, computed overdue flag.
-- D1: money is integer cents everywhere (price_cents, amount_cents, price_override_cents).
-- D2: period is 'month' or 'session'; only a 'month' plan can back a membership row.
-- D3: price_override_cents is the per-member family-discount override, nullable.
-- D4: overdue is computed at read time in _utils/payments.js -- no is_overdue column here.
-- D7: allowance_per_period is stored but read by nothing until Phase 5.
-- D8: no speculative gateway columns -- method is a widenable CHECK, note absorbs a reference.
-- Apply with: wrangler d1 migrations apply cjn-academy --remote
-- (drop --remote for local dev against the emulated DB)

CREATE TABLE membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  allowance_per_period INTEGER,
  period TEXT NOT NULL CHECK (period IN ('month','session')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  price_override_cents INTEGER CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_memberships_user ON memberships(user_id, end_date);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT REFERENCES membership_plans(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','eft')),
  paid_on TEXT NOT NULL,
  covers_start TEXT NOT NULL,
  covers_end TEXT NOT NULL,
  note TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (covers_end >= covers_start)
);
CREATE INDEX idx_payments_user_covers ON payments(user_id, covers_end);

INSERT INTO membership_plans (id, name, price_cents, allowance_per_period, period) VALUES
  ('plan_dropin', 'Drop-in', 15000, 1, 'session'),
  ('plan_weekly', 'One Class / week', 55000, 4, 'month'),
  ('plan_unlimited', 'Unlimited', 80000, NULL, 'month');
