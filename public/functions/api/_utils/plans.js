// Shared membership-plan field validation for Pages Functions (T4.3), next to
// capacity.js's precedent. D1: money is integer cents, never a float/string.
export function parsePriceCents(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: 'price_cents must be a non-negative whole number of cents' };
  }
  return { ok: true, priceCents: value };
}

// null means unlimited (D7 -- allowance is stored but read by nothing until Phase 5);
// otherwise a positive integer.
export function parseAllowance(value) {
  if (value === null || value === undefined) return { ok: true, allowance: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return { ok: false, error: 'allowance_per_period must be a positive whole number, or null for unlimited' };
  }
  return { ok: true, allowance: value };
}

// D2: only a 'month' plan can back a membership -- set once at creation, immutable
// afterwards (changing it would orphan live memberships).
export function parsePeriod(value) {
  if (value !== 'month' && value !== 'session') {
    return { ok: false, error: "period must be 'month' or 'session'" };
  }
  return { ok: true, period: value };
}
