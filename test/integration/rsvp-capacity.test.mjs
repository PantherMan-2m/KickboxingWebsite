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
import { todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';
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

// The one date for `dow` that falls within the RSVP_WINDOW_DAYS window from today --
// matching exactly what rsvp.js's own window check accepts.
function dateForDowInWindow(dow) {
  const today = todayIso();
  for (let i = 0; i < RSVP_WINDOW_DAYS; i++) {
    const d = addDaysIso(today, i);
    if (dayOfWeekFor(d) === dow) return d;
  }
  throw new Error(`no date for day-of-week=${dow} within the ${RSVP_WINDOW_DAYS}-day window`);
}

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

test('a full class rejects a third RSVP with 409 and writes no row; the two already in keep working cancel/re-RSVP', async () => {
  const date = dateForDowInWindow(1); // seed-template-mon, Monday
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  const { cookie: c3 } = await login('rsvptest3@local.test', 'RsvpTest3Pass123!');

  const patchRes = await setCapacity('seed-template-mon', 2);
  assert.equal(patchRes.status, 200);

  const r1 = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(r1.status, 200);
  const r2 = await rsvp(c2, 'seed-template-mon', date, true);
  assert.equal(r2.status, 200);

  const r3 = await rsvp(c3, 'seed-template-mon', date, true);
  assert.equal(r3.status, 409, `expected 409 for the third RSVP, got ${r3.status}`);
  const r3body = await r3.json();
  assert.equal(r3body.ok, false);
  assert.equal(r3body.error, 'This class is full');
  assert.equal(countRsvpRows('seed-template-mon', date), 2, 'the rejected RSVP must not write a row');

  // A student already RSVP'd to a now-full class re-POSTing going:true gets ok:true.
  const rRepeat = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(rRepeat.status, 200);
  assert.equal((await rRepeat.json()).ok, true);
  assert.equal(countRsvpRows('seed-template-mon', date), 2, 'the idempotent re-RSVP must not write a second row');

  // The two who are in can still cancel.
  const cancelRes = await rsvp(c1, 'seed-template-mon', date, false);
  assert.equal(cancelRes.status, 200);
  assert.equal(countRsvpRows('seed-template-mon', date), 1);

  // And re-RSVP now that a spot has reopened.
  const rejoinRes = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal(rejoinRes.status, 200);
  assert.equal((await rejoinRes.json()).ok, true);
  assert.equal(countRsvpRows('seed-template-mon', date), 2);

  // And a spot reopening lets the previously-rejected student in.
  await rsvp(c2, 'seed-template-mon', date, false);
  const r3Retry = await rsvp(c3, 'seed-template-mon', date, true);
  assert.equal(r3Retry.status, 200, 'a reopened spot should accept the previously-rejected student');
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

test('concurrent requests for one remaining spot produce exactly one winning row, and the full class is reported correctly to a non-going student', async () => {
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
  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one of the two concurrent requests should win');
  assert.equal(countRsvpRows('seed-template-fri', friDate), 2, 'the row count must reflect exactly one winner, not zero or two');

  const upcomingRes = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: observer } });
  const upcomingBody = await upcomingRes.json();
  const entry = upcomingBody.upcoming.find((u) => u.templateId === 'seed-template-fri' && u.date === friDate);
  assert.ok(entry, 'expected the Friday class to appear in the observer\'s upcoming list');
  assert.equal(entry.capacity, 2);
  assert.equal(entry.attending, 2);
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

test('a genuinely full class still returns 409 after the ON CONFLICT DO NOTHING fix', async () => {
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

  const r2 = await rsvp(c2, template.id, date, true);
  assert.equal(r2.status, 409, 'a different student hitting a full class must still get 409, not a false ok');
  const r2body = await r2.json();
  assert.equal(r2body.ok, false);
  assert.equal(r2body.error, 'This class is full');
  assert.equal(countRsvpRows(template.id, date), 1, 'the rejected RSVP must not write a row');
});
