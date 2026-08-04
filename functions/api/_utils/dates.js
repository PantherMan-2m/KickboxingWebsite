// Shared date helpers for Pages Functions dealing with 'YYYY-MM-DD' calendar dates.

export function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(new Date(`${dateStr}T00:00:00Z`).getTime());
}

// Parsed as UTC midnight so the computed day-of-week matches the calendar date
// regardless of the server's local timezone.
export function dayOfWeekFor(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
