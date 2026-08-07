// T3.2: rsvp.js's waitlist-aware contract, beyond what rsvp-capacity.test.mjs's
// amended tests already cover (waitlist-instead-of-409, auto-promote-on-cancel).
// This file pins the two remaining exit conditions: a waitlisted student
// cancelling promotes nobody, and re-RSVPing while already waitlisted is
// idempotent (no duplicate row, no duplicate promotion opportunity).
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
  { id: 'wl-rsvp-student-3', email: 'wlrsvp3@local.test', password: 'WlRsvp3Pass123!', name: 'Waitlist RSVP Three' },
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
  return JSON.parse(result.stdout.toString())[0].results[0].n;
}

// Reads a row's real status straight from the DB -- /api/student/upcoming's `going`
// field still means "has any row, regardless of status" until T3.6 redefines it, so
// it can't yet be used to check whether a promotion happened.
function rsvpStatus(templateId, date, userId) {
  const result = runWrangler(
    ['d1', 'execute', databaseName, '--local', '--json', `--command=SELECT status FROM session_rsvps WHERE template_id = '${templateId}' AND session_date = '${date}' AND user_id = '${userId}'`],
    { stdio: 'pipe' }
  );
  const rows = JSON.parse(result.stdout.toString())[0].results;
  return rows.length ? rows[0].status : null;
}

test('a waitlisted student cancelling promotes nobody', async () => {
  const date = dateForDowInWindow(1); // seed-template-mon
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  const { cookie: c3 } = await login('wlrsvp3@local.test', 'WlRsvp3Pass123!');

  await setCapacity('seed-template-mon', 1);

  const r1 = await rsvp(c1, 'seed-template-mon', date, true);
  assert.equal((await r1.json()).status, 'going');
  const r2 = await rsvp(c2, 'seed-template-mon', date, true);
  assert.equal((await r2.json()).status, 'waitlisted');
  const r3 = await rsvp(c3, 'seed-template-mon', date, true);
  assert.equal((await r3.json()).status, 'waitlisted');

  // c2 (waitlisted) cancels -- frees nothing, so c3 must stay waitlisted.
  const cancelRes = await rsvp(c2, 'seed-template-mon', date, false);
  assert.equal(cancelRes.status, 200);
  assert.equal(countRsvpRows('seed-template-mon', date), 2, 'c1 (going) + c3 (still waitlisted) -- c2 is gone');
  assert.equal(
    rsvpStatus('seed-template-mon', date, 'wl-rsvp-student-3'),
    'waitlisted',
    'c3 must not have been promoted by a waitlisted cancellation'
  );
});

test('re-RSVPing while already waitlisted is idempotent -- no duplicate row, same position', async () => {
  const date = dateForDowInWindow(3); // seed-template-wed
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');

  await setCapacity('seed-template-wed', 1);

  await rsvp(c1, 'seed-template-wed', date, true);
  const first = await rsvp(c2, 'seed-template-wed', date, true);
  const firstBody = await first.json();
  assert.equal(firstBody.status, 'waitlisted');
  assert.equal(firstBody.position, 1);

  const repeat = await rsvp(c2, 'seed-template-wed', date, true);
  assert.equal(repeat.status, 200);
  const repeatBody = await repeat.json();
  assert.equal(repeatBody.status, 'waitlisted');
  assert.equal(repeatBody.position, 1, 'position must be unchanged by the idempotent re-RSVP');
  assert.equal(countRsvpRows('seed-template-wed', date), 2, 'the repeat RSVP must not write a second row');
});
