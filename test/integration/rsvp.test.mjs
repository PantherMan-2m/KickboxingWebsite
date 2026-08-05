import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { dayOfWeekFor, addDaysIso, todayIso, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';
import devEnv from '../../scripts/lib/devEnv.js';

const { runWrangler, getD1Config } = devEnv;
const { databaseName } = getD1Config();

before(async () => {
  resetAndSeed();
  await startServer();
});

after(() => {
  stopServer();
});

// Finds the first date within the RSVP_WINDOW_DAYS window (starting today)
// satisfying `predicate(dateStr)`, or null if none does.
function findDateInWindow(predicate) {
  const today = todayIso();
  for (let i = 0; i < RSVP_WINDOW_DAYS; i++) {
    const candidate = addDaysIso(today, i);
    if (predicate(candidate)) return candidate;
  }
  return null;
}

test('RSVP rejects a date whose day-of-week does not match the template (regression: T0.6b #2)', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  // seed-template-mon is day_of_week=1 (Monday). Find a date within the
  // upcoming window that is NOT a Monday.
  const mismatchedDate = findDateInWindow((d) => dayOfWeekFor(d) !== 1);
  assert.ok(mismatchedDate, 'expected at least one non-Monday date in the window');

  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: mismatchedDate, going: true }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
});

test('RSVP rejects a date outside the 7-day upcoming window (regression: T0.6b #2)', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  // Next Monday far beyond the 7-day window (correct day-of-week, wrong window).
  const today = todayIso();
  let farDate = addDaysIso(today, 70);
  while (dayOfWeekFor(farDate) !== 1) {
    farDate = addDaysIso(farDate, 1);
  }

  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: farDate, going: true }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
});

test('RSVP cancellation succeeds even for a row that would fail create-time validation (regression: Phase 0 review finding #1)', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  // Simulate a row that predates this validation, or whose template's
  // day_of_week changed after the RSVP was created: insert directly via SQL,
  // bypassing the create-time endpoint entirely, for a date that does NOT
  // match seed-template-mon's weekday (Monday=1).
  const mismatchedDate = findDateInWindow((d) => dayOfWeekFor(d) !== 1);
  assert.ok(mismatchedDate, 'expected at least one non-Monday date in the window');

  // No shell involved (see devEnv.js's wranglerCommand()), so the SQL string
  // needs no escaping at all -- it's one argv element, passed straight through.
  const sql = `INSERT INTO session_rsvps (template_id, session_date, user_id) VALUES ('seed-template-mon', '${mismatchedDate}', 'seed-student-active-1')`;
  runWrangler(['d1', 'execute', databaseName, '--local', `--command=${sql}`], { stdio: 'ignore' });

  // Cancelling it should succeed -- ownership of the row is the only
  // requirement for a delete, unlike creation.
  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: mismatchedDate, going: false }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `expected cancellation to succeed, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
});

test('RSVP create then delete round-trip on a valid date', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  const validDate = findDateInWindow((d) => dayOfWeekFor(d) === 1);
  assert.ok(validDate, 'expected a Monday in the window');

  const createRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: validDate, going: true }),
  });
  assert.equal(createRes.status, 200);
  const createBody = await createRes.json();
  assert.equal(createBody.ok, true);

  const upcomingRes = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: cookie } });
  const upcomingBody = await upcomingRes.json();
  const entry = upcomingBody.upcoming.find((u) => u.templateId === 'seed-template-mon' && u.date === validDate);
  assert.ok(entry, 'expected the RSVP\'d class to appear in upcoming');
  assert.equal(entry.going, true);

  const deleteRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: validDate, going: false }),
  });
  assert.equal(deleteRes.status, 200);

  const afterRes = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: cookie } });
  const afterBody = await afterRes.json();
  const afterEntry = afterBody.upcoming.find((u) => u.templateId === 'seed-template-mon' && u.date === validDate);
  assert.equal(afterEntry.going, false);
});

test('RSVP checks the window before the template exists (deliberate order: 400, not 404)', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  // Unknown templateId AND a date outside the window. If the window check ran
  // second, this would 404 (revealing the templateId doesn't exist) instead of
  // 400 -- see rsvp.js's comment on why the order is deliberate.
  const today = todayIso();
  const farDate = addDaysIso(today, RSVP_WINDOW_DAYS + 10);

  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'no-such-template', date: farDate, going: true }),
  });
  const body = await res.json();
  assert.equal(res.status, 400, `expected the window check (400) to win over the template lookup (404), got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, false);
});

test('RSVP rejects a null JSON body gracefully instead of crashing (regression: Phase 0 review finding #2)', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  // `null` is valid JSON -- context.request.json() resolves successfully with
  // it, so this must not reach an unguarded destructure of the parsed body.
  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: 'null',
  });
  assert.equal(res.status, 400, `expected a graceful 400, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('RSVP rejects a past date', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  const pastDate = addDaysIso(todayIso(), -1);
  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date: pastDate, going: true }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
});
