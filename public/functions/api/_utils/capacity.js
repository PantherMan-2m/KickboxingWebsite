// Shared capacity validation for Pages Functions. A capacity is a positive integer, or
// null/absent/empty-string meaning "unlimited" -- the empty-string case matters because
// an HTML form field that's been cleared submits '', which must clear to unlimited
// rather than be coerced to 0 (a capacity of zero is rejected, not "no one can attend").
// The HTML `type="number"` attribute is not the guard; every caller validates again here.
export function parseCapacity(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, capacity: null };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: 'capacity must be a positive whole number, or empty/null for unlimited' };
  }
  return { ok: true, capacity: n };
}
