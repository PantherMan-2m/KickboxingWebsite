// T2.3: capacity enforcement on student RSVP. Needs 3 students able to hit student APIs.
// Only active1/active2@seed.test qualify among seeded students -- inactive1/pending1 are
// login-blocked, mustchange1 is 403'd by the student middleware until password change,
// and lockout1 is reserved exclusively for the lockout regression test. So a third,
// ready-to-use student is inserted directly here, the same way the seed script does it
// (PBKDF2 hash, must_change_password = 0). A fourth is added purely as a non-participating
// observer for the "shown as full" check.
//
// Only 3 active templates exist (Mon/Wed/Fri), each maps to exactly one date within the
// 7-day RSVP window, so each test below claims one template/date combo and does not
// share it with another test -- state from one test must never leak into another via a
// shared template+date.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { dateForDowInWindow } from '../helpers/dates.mjs';
import devEnv from '../../scripts/lib/devEnv.js';

const { runWrangler, getD1Config } = devEnv;
const { databaseName } = getD1Config();

const ITERATIONS = 100000;
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2:sha256:${ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

const EXTRA_STUDENTS = [
  { id: 'rsvp-test-student-3', email: 'rsvptest3@local.test', password: 'RsvpTest3Pass123!', name: 'RSVP Test Three' },
  { id: 'rsvp-test-observer', email: 'rsvpobserver@local.test', password: 'RsvpObserverPass123!', name: 'RSVP Observer' },
];

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));

  for (const s of EXTRA_STUDENTS) {
    const sql = `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password, created_by) VALUES ('${s.id}', '${s.email}', '${hashPassword(s.password)}', '${s.name}', 'student', 'active', 0, 'seed-coach-1')`;
    runWrangler(['d1', 'execute', databaseName, '--local', `--command=${sql}`], { stdio: 'ignore' });
  }
});

after(() => {
  stopServer();
});

async function rsvp(cookie, templateId, date, going) {
  return fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ templateId, date, going }),
  });
}

async function setCapacity(templateId, capacity) {
  return fetch(BASE_URL + `/api/coach/templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ capacity }),
  });
}

function countRsvpRows(templateId, date) {
  const result = runWrangler(
    ['d1', 'execute', databaseName, '--local', '--json', `--command=SELECT COUNT(*) as n FROM session_rsvps WHERE template_id = '${templateId}' AND session_date = '${date}'`],
    { stdio: 'pipe' }
  );
  const parsed = JSON.parse(result.stdout.toString());
  return parsed[0].results[0].n;
}

// Reads a row's real status straight from the DB -- /api/student/upcoming's `going`
// field still means "has any row, regardless of status" until T3.6 redefines it, so
// it isn't precise enough to confirm a promotion actually happened (vs. the row
// merely existing).
function rsvpStatus(templateId, date, userId) {
  const result = runWrangler(
    ['d1', 'execute', databaseName, '--local', '--json', `--command=SELECT status FROM session_rsvps WHERE template_id = '${templateId}' AND session_date = '${date}' AND user_id = '${userId}'`],
    { stdio: 'pipe' }
  );
  const rows = JSON.parse(result.stdout.toString())[0].results;
  return rows.length ? rows[0].status : null;
}

// Inserts a waitlisted row directly, bypassing rsvp.js entirely -- used to reach the
// state "going < capacity AND waitlisted > 0", which the real API can never produce
// (promoteAndNotify closes that window on every write path). Needed by the review-fix
// test below, which exists specifically to prove the inner COUNT's status='going'
// filter is load-bearing in exactly that state.
function insertWaitlistedRow(templateId, date, userId) {
  const sql = `INSERT INTO session_rsvps (template_id, session_date, user_id, status) VALUES ('${templateId}', '${date}', '${userId}', 'waitlisted')`;
  runWrangler(['d1', 'execute', databaseName, '--local', `--command=${sql}`], { stdio: 'ignore' });
}

// T3.2: a full class waitlists a new RSVP instead of rejecting it with 409, and
// cancelling a going RSVP auto-promotes the oldest waitlisted student -- both
// replace this test's pre-Phase-3 behaviour (previously: reject, then require
// the promoted student to manually re-RSVP once a spot reopened).
test('a full class waitlists a third RSVP with 200; cancelling a going RSVP auto-promotes the waitlisted student', async () => {
  const date = dateForDowInWindow(1); // seed-template-mon, Monday
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  const { cookie: c3 } = await login('rsvptest3@local.test', 'RsvpTest3Pass123!');

  const patchRes = await setCapacity('seed-template-mon', 2);
  assert.equal(patchRes.status, 200);

  const r1 = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).status, 'going');
  const r2 = await rsvp(c2, 'seed-template-mon', date, true);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).status, 'going');

  const r3 = await rsvp(c3, 'seed-template-mon', date, true);
  assert.equal(r3.status, 200, `expected 200 (waitlisted) for the third RSVP, got ${r3.status}`);
  const r3body = await r3.json();
  assert.equal(r3body.ok, true);
  assert.equal(r3body.status, 'waitlisted');
  assert.equal(r3body.position, 1);
  assert.equal(countRsvpRows('seed-template-mon', date), 3, 'the waitlisted RSVP still writes a row');

  // A student already RSVP'd to a now-full class re-POSTing going:true gets ok:true, status: going.
  const rRepeat = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(rRepeat.status, 200);
  assert.equal((await rRepeat.json()).status, 'going');
  assert.equal(countRsvpRows('seed-template-mon', date), 3, 'the idempotent re-RSVP must not write a second row');

  // c1 (going) cancels -- this frees a spot and must auto-promote c3, the sole
  // waitlisted student, with no further action from c3.
  const cancelRes = await rsvp(c1, 'seed-template-mon', date, false);
  assert.equal(cancelRes.status, 200);
  assert.equal(countRsvpRows('seed-template-mon', date), 2, 'c1 left; c3 was auto-promoted into the freed spot (c2 + c3)');

  assert.equal(
    rsvpStatus('seed-template-mon', date, 'rsvp-test-student-3'),
    'going',
    'c3 must have been auto-promoted to going by the cancellation, without re-RSVPing'
  );

  // The class is full again (c2 + auto-promoted c3) -- c1 re-RSVPing now waitlists
  // rather than rejecting, since the freed spot was already claimed by promotion.
  const rejoinRes = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(rejoinRes.status, 200);
  const rejoinBody = await rejoinRes.json();
  assert.equal(rejoinBody.status, 'waitlisted', 'the spot c1 freed was already claimed by the auto-promoted c3');
});

test('a NULL-capacity class accepts unlimited RSVPs -- no behaviour change from before T2.3', async () => {
  const wedDate = dateForDowInWindow(3); // seed-template-wed, never had capacity set -- stays NULL
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  const { cookie: c3 } = await login('rsvptest3@local.test', 'RsvpTest3Pass123!');

  for (const cookie of [c1, c2, c3]) {
    const res = await rsvp(cookie, 'seed-template-wed', wedDate, true);
    assert.equal(res.status, 200, 'an unlimited-capacity class must accept every RSVP');
  }
  assert.equal(countRsvpRows('seed-template-wed', wedDate), 3);
});

test('concurrent requests for one remaining spot produce exactly one going and one waitlisted, and the full class is reported correctly to a non-going student', async () => {
  const friDate = dateForDowInWindow(5); // seed-template-fri
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  const { cookie: c3 } = await login('rsvptest3@local.test', 'RsvpTest3Pass123!');
  const { cookie: observer } = await login('rsvpobserver@local.test', 'RsvpObserverPass123!');

  const patchRes = await setCapacity('seed-template-fri', 2);
  assert.equal(patchRes.status, 200);

  // Fill one spot first, leaving exactly one remaining, then fire two concurrent
  // requests for it.
  const first = await rsvp(c1, 'seed-template-fri', friDate, true);
  assert.equal(first.status, 200);

  const [resA, resB] = await Promise.all([
    rsvp(c2, 'seed-template-fri', friDate, true),
    rsvp(c3, 'seed-template-fri', friDate, true),
  ]);
  assert.equal(resA.status, 200, 'a full class must waitlist, not reject, the losing request');
  assert.equal(resB.status, 200);
  const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);
  const statusPair = [bodyA.status, bodyB.status].sort();
  assert.deepEqual(statusPair, ['going', 'waitlisted'], 'exactly one of the two concurrent requests should win the spot, the other waitlists');
  assert.equal(countRsvpRows('seed-template-fri', friDate), 3, 'two going rows plus one waitlisted row');

  const upcomingRes = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: observer } });
  const upcomingBody = await upcomingRes.json();
  const entry = upcomingBody.upcoming.find((u) => u.templateId === 'seed-template-fri' && u.date === friDate);
  assert.ok(entry, 'expected the Friday class to appear in the observer\'s upcoming list');
  assert.equal(entry.capacity, 2);
  assert.equal(entry.attending, 2, 'attending must count only the two going rows, not the waitlisted one');
  assert.equal(entry.full, true);
  assert.equal(entry.going, false, 'the observer never RSVP\'d, so going must be false');
});

// Fix: rsvp.js's capacity-limited INSERT...SELECT now carries an
// ON CONFLICT (template_id, session_date, user_id) DO NOTHING clause, since a
// double-submitted RSVP (two near-simultaneous requests from the same user, racing the
// earlier "existing row" check) would otherwise hit the row's own PK constraint and throw
// an uncaught error instead of a graceful response. Both new tests use their own
// dedicated template (Tuesday/Thursday) rather than the seeded Mon/Wed/Fri ones, per this
// file's own convention -- all three are already claimed by the tests above.

test('a double-submitted RSVP on a capacity-limited class returns ok twice and writes exactly one row', async () => {
  const date = dateForDowInWindow(2); // Tuesday -- unclaimed by any other test in this file
  const createRes = await fetch(BASE_URL + '/api/coach/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ dayOfWeek: 2, startTime: '19:00', name: 'Double-submit test class', capacity: 5 }),
  });
  assert.equal(createRes.status, 200);
  const { template } = await createRes.json();

  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const [r1, r2] = await Promise.all([
    rsvp(cookie, template.id, date, true),
    rsvp(cookie, template.id, date, true),
  ]);
  assert.equal(r1.status, 200, 'first submission should succeed');
  assert.equal(r2.status, 200, 'the duplicate submission should also return ok, not an error');
  assert.equal((await r1.json()).ok, true);
  assert.equal((await r2.json()).ok, true);
  assert.equal(countRsvpRows(template.id, date), 1, 'a double-submit must write exactly one row, not two');
});

test('a genuinely full class waitlists rather than rejecting, even after the ON CONFLICT DO NOTHING fix (T3.2: 409 -> 200 waitlisted)', async () => {
  const date = dateForDowInWindow(4); // Thursday -- unclaimed by any other test in this file
  const createRes = await fetch(BASE_URL + '/api/coach/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ dayOfWeek: 4, startTime: '19:00', name: 'Still-full test class', capacity: 1 }),
  });
  assert.equal(createRes.status, 200);
  const { template } = await createRes.json();

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');

  const r1 = await rsvp(c1, template.id, date, true);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).status, 'going');

  const r2 = await rsvp(c2, template.id, date, true);
  assert.equal(r2.status, 200, 'a different student hitting a full class must waitlist, not get rejected');
  const r2body = await r2.json();
  assert.equal(r2body.ok, true);
  assert.equal(r2body.status, 'waitlisted');
  assert.equal(r2body.position, 1);
  assert.equal(countRsvpRows(template.id, date), 2, 'one going row plus one waitlisted row');
});

// Review fix 1: the atomic insert's inner COUNT (rsvp.js) filters `status = 'going'`,
// but no prior test could tell that filter apart from an unfiltered COUNT(*) -- every
// existing waitlisted row was created only after the class was already full, a state
// where the filtered and unfiltered counts agree. The filter is only load-bearing in
// "going < capacity AND waitlisted > 0", which the real API can never produce on its
// own (promoteAndNotify always closes that window) -- so this test seeds it directly.
test('the atomic insert only counts going rows -- a waitlisted row already present must not consume a free spot', async () => {
  const createRes = await fetch(BASE_URL + '/api/coach/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ dayOfWeek: 0, startTime: '19:00', name: 'Filter-regression test class', capacity: 2 }),
  });
  assert.equal(createRes.status, 200);
  const { template } = await createRes.json();
  const date = dateForDowInWindow(0); // Sunday -- unclaimed by any other test in this file

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');

  // going=1, capacity=2 -- one spot free.
  const r1 = await rsvp(c1, template.id, date, true);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).status, 'going');

  // Seed a waitlisted row directly, bypassing the API -- reachable state:
  // going=1 < capacity=2, waitlisted=1.
  insertWaitlistedRow(template.id, date, 'rsvp-test-student-3');
  assert.equal(rsvpStatus(template.id, date, 'rsvp-test-student-3'), 'waitlisted');

  // A second student RSVPing must land in the one genuinely free spot. An unfiltered
  // COUNT(*) would see going(1) + waitlisted(1) = 2, which is not < capacity(2), and
  // wrongly waitlist this student instead.
  const r2 = await rsvp(c2, template.id, date, true);
  assert.equal(r2.status, 200);
  const r2body = await r2.json();
  assert.equal(
    r2body.status,
    'going',
    `expected the free spot to be granted (status 'going'), got '${r2body.status}' -- the atomic insert's COUNT is not filtering on status='going'`
  );
});
