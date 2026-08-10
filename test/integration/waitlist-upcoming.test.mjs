// T3.6: /api/student/upcoming's three-state contract -- rsvpStatus (null |
// 'going' | 'waitlisted') and waitlistPosition (null unless waitlisted). `going`
// must now mean status === 'going' specifically, not "has any row" (the bug
// T3.0 deliberately left unfiltered here and flagged for this task).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { dateForDowInWindow } from '../helpers/dates.mjs';

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
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

async function upcomingEntry(cookie, templateId, date) {
  const res = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: cookie } });
  const body = await res.json();
  return body.upcoming.find((u) => u.templateId === templateId && u.date === date);
}

test('not booked, going, and waitlisted each report a distinct rsvpStatus/waitlistPosition/going combination', async () => {
  const date = dateForDowInWindow(1); // seed-template-mon
  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');

  await fetch(BASE_URL + '/api/coach/templates/seed-template-mon', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ capacity: 1 }),
  });

  // Not booked.
  const beforeEntry = await upcomingEntry(c2, 'seed-template-mon', date);
  assert.equal(beforeEntry.rsvpStatus, null);
  assert.equal(beforeEntry.waitlistPosition, null);
  assert.equal(beforeEntry.going, false);

  // Going (fills the one spot).
  await rsvp(c1, 'seed-template-mon', date, true);
  const goingEntry = await upcomingEntry(c1, 'seed-template-mon', date);
  assert.equal(goingEntry.rsvpStatus, 'going');
  assert.equal(goingEntry.waitlistPosition, null);
  assert.equal(goingEntry.going, true);

  // Waitlisted.
  const waitlistRes = await rsvp(c2, 'seed-template-mon', date, true);
  assert.equal((await waitlistRes.json()).status, 'waitlisted');
  const waitlistedEntry = await upcomingEntry(c2, 'seed-template-mon', date);
  assert.equal(waitlistedEntry.rsvpStatus, 'waitlisted');
  assert.equal(waitlistedEntry.waitlistPosition, 1);
  assert.equal(waitlistedEntry.going, false, 'a waitlisted row must never report going:true');

  // Leaving the waitlist clears the state back to "not booked" and promotes
  // nobody (c1 stays going -- there's nobody else waitlisted to promote).
  await rsvp(c2, 'seed-template-mon', date, false);
  const afterLeaveEntry = await upcomingEntry(c2, 'seed-template-mon', date);
  assert.equal(afterLeaveEntry.rsvpStatus, null);
  assert.equal(afterLeaveEntry.waitlistPosition, null);
  assert.equal(afterLeaveEntry.going, false);
  const c1StillGoing = await upcomingEntry(c1, 'seed-template-mon', date);
  assert.equal(c1StillGoing.rsvpStatus, 'going', 'c1 must be unaffected by c2 leaving the waitlist');
});
