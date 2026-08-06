// Shared capacity validation for Pages Functions. A capacity is a positive integer, or
// null/absent/empty-string meaning "unlimited" -- the empty-string case matters because
// an HTML form field that's been cleared submits '', which must clear to unlimited
// rather than be coerced to 0 (a capacity of zero is rejected, not "no one can attend").
// The HTML `type="number"` attribute is not the guard; every caller validates again here.
export function parseCapacity(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, capacity: null };
  }
  // Reject by type before coercing -- Number(true) === 1 and Number([1]) === 1 would
  // otherwise sail through as a valid capacity of 1.
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { ok: false, error: 'capacity must be a positive whole number, or empty/null for unlimited' };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: 'capacity must be a positive whole number, or empty/null for unlimited' };
  }
  return { ok: true, capacity: n };
}
