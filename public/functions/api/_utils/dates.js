// Shared date helpers for Pages Functions dealing with 'YYYY-MM-DD' calendar dates.

// How many days ahead (including today) a student can see/RSVP to weekly
// classes. Shared by student/upcoming.js (what's offered) and
// student/rsvp.js (what's accepted) -- if the two disagree, the UI offers
// RSVPs the API rejects, or the reverse.
export const RSVP_WINDOW_DAYS = 7;

export function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  // Date silently normalizes overflowing components (e.g. Feb 30 -> Mar 2)
  // instead of producing NaN, so round-trip the value to catch those.
  return d.toISOString().slice(0, 10) === dateStr;
}

// Parsed as UTC midnight so the computed day-of-week matches the calendar date
// regardless of the server's local timezone.
export function dayOfWeekFor(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// The gym is in Somerset West (Africa/Johannesburg, UTC+2 fixed, no DST) but the
// Worker's clock is UTC. Computing the calendar date straight from `new Date()`
// returns the wrong day for roughly two hours after UTC midnight. Takes an
// optional `now` for testability; real callers always use the default.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// Both the SAST calendar date and the SAST time-of-day ('HH:MM'), from one shifted
// Date -- so a caller needing both (T2.4's "is this class later today") never risks
// them disagreeing by being computed from two separately-constructed Dates.
export function sastNowParts(now = new Date()) {
  const sast = new Date(now.getTime() + SAST_OFFSET_MS);
  return { date: sast.toISOString().slice(0, 10), time: sast.toISOString().slice(11, 16) };
}

// public/app.js's sastTodayIso() duplicates this fixed-offset logic for the browser --
// see that function's comment for why (no build step, so a plain <script> can't import
// this ES module). Keep the two offsets in sync; test/unit/shared-frontend.test.mjs pins it.
export function todayIso(now = new Date()) {
  return sastNowParts(now).date;
}

export function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
