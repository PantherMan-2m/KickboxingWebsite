// Shared helper for integration tests that need a concrete calendar date
// matching a given day-of-week, valid for the RSVP window. Previously
// hand-copied (identically) into 6 test/integration/*.test.mjs files; see
// TODO.md's "clock-dependent tests" entry for how that duplication was found.
import { todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';

// The one date for `dow` (0=Sun..6=Sat) that falls within the RSVP_WINDOW_DAYS
// window from today -- matching exactly what rsvp.js's own window check
// accepts. Deterministic across the day regardless of wall-clock hour:
// todayIso() only depends on the fixed SAST offset, never on the current
// time-of-day.
//
// IMPORTANT: a returned date of *today* is only ever safe for window/day-of-week
// validation (RSVP creation, session creation, upcoming-list membership).
// Never assume it also means "the next class" -- selectNextClass
// (_utils/schedule.js) additionally excludes a today-dated occurrence whose
// start time has already passed, which this function has no way to know and
// deliberately does not try to. A test that needs "whatever the server
// currently considers next" must ask the server (e.g. GET /api/coach/next-class)
// rather than assume this function's return value agrees with it -- that
// mismatch is exactly what made waitlist-coach-visibility.test.mjs flaky
// (fails only on the specific weekday/time seed-template-mon's occurrence has
// already started for the day).
export function dateForDowInWindow(dow) {
  const today = todayIso();
  for (let i = 0; i < RSVP_WINDOW_DAYS; i++) {
    const d = addDaysIso(today, i);
    if (dayOfWeekFor(d) === dow) return d;
  }
  throw new Error(`no date for day-of-week=${dow} within the ${RSVP_WINDOW_DAYS}-day window`);
}
