import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, dayOfWeekFor, todayIso, addDaysIso, sastNowParts } from '../../public/functions/api/_utils/dates.js';

test('isValidDate accepts well-formed calendar dates', () => {
  assert.equal(isValidDate('2026-08-05'), true);
  assert.equal(isValidDate('2026-01-01'), true);
});

test('isValidDate rejects malformed or impossible dates', () => {
  assert.equal(isValidDate('2026-8-5'), false); // not zero-padded
  assert.equal(isValidDate('not-a-date'), false);
  assert.equal(isValidDate(''), false);
  assert.equal(isValidDate('2026-02-30'), false); // Feb 30 doesn't exist
});

test('dayOfWeekFor matches JS Date.getDay() convention (0=Sun..6=Sat)', () => {
  assert.equal(dayOfWeekFor('2026-08-05'), 3); // Wednesday
  assert.equal(dayOfWeekFor('2026-08-03'), 1); // Monday
  assert.equal(dayOfWeekFor('2026-08-09'), 0); // Sunday
});

test('addDaysIso crosses month and year boundaries', () => {
  assert.equal(addDaysIso('2026-08-05', 1), '2026-08-06');
  assert.equal(addDaysIso('2026-08-31', 1), '2026-09-01');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysIso('2026-08-05', -1), '2026-08-04');
});

test('todayIso() returns the SAST calendar date, not UTC (regression: T0.6b #1)', () => {
  // 2026-08-04T23:30:00Z is 2026-08-05 01:30 in Africa/Johannesburg (UTC+2, no DST).
  // The pre-fix implementation read the Worker's UTC clock directly and would
  // return '2026-08-04' here -- the wrong, already-finished calendar day.
  const justAfterMidnightSAST = new Date('2026-08-04T23:30:00Z');
  assert.equal(todayIso(justAfterMidnightSAST), '2026-08-05');

  // Boundary case just before SAST midnight should still be the prior day.
  const justBeforeMidnightSAST = new Date('2026-08-04T21:30:00Z'); // 23:30 SAST
  assert.equal(todayIso(justBeforeMidnightSAST), '2026-08-04');
});

test('todayIso() with no argument uses the real current time', () => {
  const result = todayIso();
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test('sastNowParts() returns both date and time from the same shifted instant, matching todayIso()', () => {
  // 2026-08-04T23:30:00Z is 2026-08-05 01:30 SAST -- date rolls over just after
  // UTC midnight the same way todayIso() already regression-tests (T0.6b #1);
  // this pins that .date agrees with todayIso() and .time reflects the same shift.
  const justAfterMidnightSAST = new Date('2026-08-04T23:30:00Z');
  const parts = sastNowParts(justAfterMidnightSAST);
  assert.equal(parts.date, '2026-08-05');
  assert.equal(parts.time, '01:30');
  assert.equal(parts.date, todayIso(justAfterMidnightSAST));
});

test('sastNowParts() with no argument uses the real current time', () => {
  const parts = sastNowParts();
  assert.match(parts.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(parts.time, /^\d{2}:\d{2}$/);
});
