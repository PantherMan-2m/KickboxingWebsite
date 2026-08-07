// T3.0: migration 0004 adds session_rsvps.status, but nothing in this phase yet
// writes a 'waitlisted' row through the API (that lands in T3.2) -- so these tests
// insert one directly via SQL, the same technique rsvp-capacity.test.mjs uses for
// extra seed users. Each test pins one of the four counting sites named in
// plan/phase-3.md's fact 2 / plan/codebase-map.md's non-obvious-behaviours entry:
// a waitlisted row must never consume a capacity slot, inflate a headcount, or
// arrive pre-marked present. Each test uses its own freshly-created template so
// none of the four share state.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { todayIso, addDaysIso, dayOfWeekFor } from '../../public/functions/api/_utils/dates.js';
import devEnv from '../../scripts/lib/devEnv.js';

const { runWrangler, getD1Config } = devEnv;
const { databaseName } = getD1Config();

let coachCookie;
let active1Cookie;
let active2Cookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
  ({ cookie: active1Cookie } = await login('active1@seed.test', 'StudentPass123!'));
  ({ cookie: active2Cookie } = await login('active2@seed.test', 'StudentPass123!'));
});

after(() => {
  stopServer();
});

// A date `offset` days out, far enough from "today" to sidestep same-day "is this
// class later today" edge cases in selectNextClass. Each test uses a distinct
// offset (and therefore a distinct day-of-week and calendar date) so its
// newly-created template can never tie with another test's for "which is next".
function dateForOffset(offset) {
  return addDaysIso(todayIso(), offset);
}

async function createTemplate(dayOfWeek, capacity) {
  const res = await fetch(BASE_URL + '/api/coach/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ dayOfWeek, startTime: '19:00', name: 'Waitlist filter test class', capacity }),
  });
  assert.equal(res.status, 200, 'template creation must succeed');
  const { template } = await res.json();
  return template.id;
}

function insertWaitlistedRow(templateId, date, userId) {
  runWrangler(
    [
      'd1',
      'execute',
      databaseName,
      '--local',
      `--command=INSERT INTO session_rsvps (template_id, session_date, user_id, status) VALUES ('${templateId}', '${date}', '${userId}', 'waitlisted')`,
    ],
    { stdio: 'ignore' }
  );
}

test('rsvp.js:82 -- a waitlisted row must not count against capacity in the atomic insert', async () => {
  const date = dateForOffset(3);
  const templateId = await createTemplate(dayOfWeekFor(date), 1);

  // active2 is the waitlisted student (seeded directly); active1 is the one actually
  // trying to RSVP and must succeed since the class's one spot is still open.
  insertWaitlistedRow(templateId, date, 'seed-student-active-2');

  const res = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: active1Cookie },
    body: JSON.stringify({ templateId, date, going: true }),
  });
  assert.equal(
    res.status,
    200,
    'a waitlisted row must not consume the one capacity slot -- an unfiltered COUNT(*) would wrongly report the class already full'
  );
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('upcoming.js:28 -- attending/full must not count a waitlisted row', async () => {
  const date = dateForOffset(4);
  const templateId = await createTemplate(dayOfWeekFor(date), 2);

  const goRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: active1Cookie },
    body: JSON.stringify({ templateId, date, going: true }),
  });
  assert.equal(goRes.status, 200);
  insertWaitlistedRow(templateId, date, 'seed-student-active-2');

  const upcomingRes = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: active1Cookie } });
  const upcomingBody = await upcomingRes.json();
  const entry = upcomingBody.upcoming.find((u) => u.templateId === templateId && u.date === date);
  assert.ok(entry, 'expected the new template to appear in the upcoming window');
  assert.equal(entry.attending, 1, 'attending must count only the going row, not the waitlisted one');
  assert.equal(entry.full, false, 'capacity is 2 with only 1 going -- must not report full because of the waitlisted row');
});

test('coach/next-class.js:30 -- the dashboard panel must not count a waitlisted row', async () => {
  // Deactivate every currently-active template (the seeded Mon/Wed/Fri, plus
  // whatever earlier tests in this file created and left active) so the new one
  // below is unambiguously "next".
  const listRes = await fetch(BASE_URL + '/api/coach/templates', { headers: { Cookie: coachCookie } });
  const { templates: existing } = await listRes.json();
  for (const t of existing.filter((t) => t.active)) {
    const patchRes = await fetch(BASE_URL + `/api/coach/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(patchRes.status, 200);
  }

  const date = dateForOffset(5);
  const templateId = await createTemplate(dayOfWeekFor(date), 2);

  const goRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: active1Cookie },
    body: JSON.stringify({ templateId, date, going: true }),
  });
  assert.equal(goRes.status, 200);
  insertWaitlistedRow(templateId, date, 'seed-student-active-2');

  const nextRes = await fetch(BASE_URL + '/api/coach/next-class', { headers: { Cookie: coachCookie } });
  const nextBody = await nextRes.json();
  assert.ok(nextBody.nextClass, 'expected the sole active template to be selected as next');
  assert.equal(nextBody.nextClass.templateId, templateId);
  assert.equal(nextBody.nextClass.attending, 1, 'the panel must not count the waitlisted row');
  assert.equal(nextBody.nextClass.spotsRemaining, 1, 'spotsRemaining must reflect only the going row');
});

test('coach/sessions/[id].js:43 -- a waitlisted student must not arrive pre-marked present on the attendance roster', async () => {
  const date = dateForOffset(6);
  const templateId = await createTemplate(dayOfWeekFor(date), null);

  insertWaitlistedRow(templateId, date, 'seed-student-active-2');

  const createRes = await fetch(BASE_URL + '/api/coach/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ templateId, date }),
  });
  assert.equal(createRes.status, 200);
  const { session } = await createRes.json();

  const sessionRes = await fetch(BASE_URL + `/api/coach/sessions/${session.id}`, { headers: { Cookie: coachCookie } });
  const sessionBody = await sessionRes.json();
  const active2Row = sessionBody.roster.find((r) => r.email === 'active2@seed.test');
  assert.ok(active2Row, 'expected active2 on the roster');
  assert.equal(
    active2Row.going,
    false,
    'a waitlisted row must not set going:true -- the client pre-fills present from this flag'
  );
});
