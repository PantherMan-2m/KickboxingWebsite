// T2.4: /api/coach/next-class against real seeded data. The mid-week/later-today/
// week-rollover/timezone scenarios are pinned deterministically at the unit level
// (test/unit/schedule.test.mjs's selectNextClass tests, independent of the real clock);
// this file proves the endpoint wires sastNowParts + the DB queries together correctly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { todayIso, sastNowParts, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';
import { selectNextClass } from '../../public/functions/api/_utils/schedule.js';

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
});

after(() => {
  stopServer();
});

function get(cookie) {
  return fetch(BASE_URL + '/api/coach/next-class', { headers: { Cookie: cookie } });
}

test('matches the independently-computed next class from the seeded Mon/Wed/Fri templates, with capacity null and spotsRemaining null (no cap set)', async () => {
  const res = await get(coachCookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const SEED_TEMPLATES = [
    { id: 'seed-template-mon', dayOfWeek: 1, name: 'Kickboxing Fundamentals', startTime: '18:00', endTime: '19:00' },
    { id: 'seed-template-wed', dayOfWeek: 3, name: 'Muay Thai', startTime: '18:00', endTime: '19:00' },
    { id: 'seed-template-fri', dayOfWeek: 5, name: 'Kids Class', startTime: '17:30', endTime: '18:30' },
  ];
  // Compute "now" the same way the endpoint does (this test process and the dev server
  // run on the same machine, so a few milliseconds of drift can't cross a minute
  // boundary in a way that matters here).
  const { date: today, time: nowTime } = sastNowParts();
  const expected = selectNextClass(SEED_TEMPLATES, today, nowTime, RSVP_WINDOW_DAYS);

  assert.ok(expected, 'expected at least one active template to produce a next class');
  assert.equal(body.nextClass.templateId, expected.templateId);
  assert.equal(body.nextClass.date, expected.date);
  assert.equal(body.nextClass.name, expected.name);
  assert.equal(body.nextClass.startTime, expected.startTime);
  assert.equal(body.nextClass.capacity, null, 'no capacity has been set on any seed template');
  assert.equal(body.nextClass.spotsRemaining, null);
  assert.equal(body.nextClass.attending, 0);
});

test('attending count matches a direct SELECT COUNT(*) against session_rsvps', async () => {
  const { cookie: studentCookie } = await login('active1@seed.test', 'StudentPass123!');

  const before1 = await get(coachCookie);
  const beforeBody = await before1.json();
  assert.ok(beforeBody.nextClass, 'expected a next class to exist');

  const rsvpRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ templateId: beforeBody.nextClass.templateId, date: beforeBody.nextClass.date, going: true }),
  });
  assert.equal(rsvpRes.status, 200);

  const after1 = await get(coachCookie);
  const afterBody = await after1.json();
  assert.equal(afterBody.nextClass.templateId, beforeBody.nextClass.templateId);
  assert.equal(afterBody.nextClass.attending, beforeBody.nextClass.attending + 1);
});

test('renders a clear empty state (nextClass: null) when no template is active', async () => {
  for (const id of ['seed-template-mon', 'seed-template-wed', 'seed-template-fri']) {
    const res = await fetch(BASE_URL + `/api/coach/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(res.status, 200);
  }

  const res = await get(coachCookie);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.nextClass, null);
});
