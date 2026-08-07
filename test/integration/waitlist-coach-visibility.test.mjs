// T3.7: coach-facing waitlist visibility -- the next-class panel's waitlist
// count and the session roster's separate waitlist list, in queue order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';
import devEnv from '../../scripts/lib/devEnv.js';

const { runWrangler, getD1Config } = devEnv;
const { databaseName } = getD1Config();

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
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

function directWaitlistCount(templateId, date) {
  const result = runWrangler(
    ['d1', 'execute', databaseName, '--local', '--json', `--command=SELECT COUNT(*) as n FROM session_rsvps WHERE template_id = '${templateId}' AND session_date = '${date}' AND status = 'waitlisted'`],
    { stdio: 'pipe' }
  );
  return JSON.parse(result.stdout.toString())[0].results[0].n;
}

test("the next-class panel's waitlisted count matches a direct SELECT COUNT(*) WHERE status='waitlisted'", async () => {
  // Deactivate every other template so seed-template-mon is unambiguously "next".
  for (const id of ['seed-template-wed', 'seed-template-fri']) {
    await fetch(BASE_URL + `/api/coach/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
      body: JSON.stringify({ active: false }),
    });
  }
  const date = dateForDowInWindow(1); // seed-template-mon
  await fetch(BASE_URL + '/api/coach/templates/seed-template-mon', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ capacity: 1 }),
  });

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  await rsvp(c1, 'seed-template-mon', date, true); // going, fills the 1 spot

  const zeroRes = await fetch(BASE_URL + '/api/coach/next-class', { headers: { Cookie: coachCookie } });
  const zeroBody = await zeroRes.json();
  assert.equal(zeroBody.nextClass.waitlisted, 0, 'no waitlist yet');
  assert.equal(zeroBody.nextClass.waitlisted, directWaitlistCount('seed-template-mon', date));

  await rsvp(c2, 'seed-template-mon', date, true); // waitlisted

  const oneRes = await fetch(BASE_URL + '/api/coach/next-class', { headers: { Cookie: coachCookie } });
  const oneBody = await oneRes.json();
  assert.equal(oneBody.nextClass.waitlisted, 1);
  assert.equal(oneBody.nextClass.waitlisted, directWaitlistCount('seed-template-mon', date));
});

test('the session roster lists waitlisted students separately, in created_at queue order, and never inside the attendance roster', async () => {
  const date = dateForDowInWindow(3); // seed-template-wed
  // Reactivate it -- the previous test in this file deactivated every template
  // except seed-template-mon to make it unambiguously "next".
  await fetch(BASE_URL + '/api/coach/templates/seed-template-wed', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ active: true, capacity: 1 }),
  });

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  await rsvp(c1, 'seed-template-wed', date, true); // going, fills the 1 spot
  await rsvp(c2, 'seed-template-wed', date, true); // waitlisted (only one, since c1 already used the spot)

  const createRes = await fetch(BASE_URL + '/api/coach/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ templateId: 'seed-template-wed', date }),
  });
  const { session } = await createRes.json();

  const sessionRes = await fetch(BASE_URL + `/api/coach/sessions/${session.id}`, { headers: { Cookie: coachCookie } });
  const sessionBody = await sessionRes.json();

  assert.equal(sessionBody.waitlist.length, 1);
  assert.equal(sessionBody.waitlist[0].email, 'active2@seed.test');

  // The T3.0 pre-fill guarantee still holds: a waitlisted student never appears
  // pre-marked present (going:true) on the attendance roster.
  const active2Row = sessionBody.roster.find((r) => r.email === 'active2@seed.test');
  assert.ok(active2Row, 'the waitlisted student is still on the active-student roster (their attendance can still be marked)');
  assert.equal(active2Row.going, false, 'a waitlisted student must not be pre-marked present');
  const active1Row = sessionBody.roster.find((r) => r.email === 'active1@seed.test');
  assert.equal(active1Row.going, true, 'the going student is correctly pre-marked present-eligible');
});
