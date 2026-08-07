// T3.4: the two notification events actually fire from the real write paths.
// Calls rsvp.js's onRequestPost directly (not through wrangler pages dev's HTTP
// layer) against a real local D1 binding (test/helpers/db.mjs), so the test can
// hand-build a `context` with its own `waitUntil` and inspect what got
// dispatched. `globalThis.fetch` is monkey-patched for the duration of each
// test to intercept outbound calls (both sendEmail's and the raw webhook fetch
// go through the global `fetch`) instead of hitting the real network -- no test
// sends a real email, per T3.3's exit condition, while still proving the
// correct recipient and event count.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed } from '../helpers/server.mjs';
import { openDb } from '../helpers/db.mjs';
import { onRequestPost as rsvpHandler } from '../../public/functions/api/student/rsvp.js';
import { promoteAndNotify } from '../../public/functions/api/_utils/waitlist.js';
import { todayIso, addDaysIso, dayOfWeekFor, dayLabelFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';

let db;
let dispose;

before(async () => {
  resetAndSeed();
  ({ db, dispose } = await openDb());
});

after(async () => {
  await dispose();
});

let originalFetch;
let fetchCalls;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: 'test-fake-id' }), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const STUDENT_A = { id: 'seed-student-active-1', email: 'active1@seed.test', name: 'Alice Active', role: 'student', mustChangePassword: false };
const STUDENT_B = { id: 'seed-student-active-2', email: 'active2@seed.test', name: 'Bob Active', role: 'student', mustChangePassword: false };

function makeContext({ env = {}, user, body }) {
  const waitUntilPromises = [];
  const context = {
    request: new Request('http://local.test/api/student/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { DB: db, ...env },
    data: { user },
    waitUntil: (p) => waitUntilPromises.push(p),
  };
  return { context, waitUntilPromises };
}

async function createTemplate(id, dayOfWeek, capacity) {
  await db
    .prepare('INSERT INTO class_templates (id, day_of_week, start_time, name, active, capacity) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(id, dayOfWeek, '18:00', 'Notify Test Class', capacity)
    .run();
}

// Must be within the RSVP window -- rsvp.js's going:true path rejects anything
// further out, and tests 1/2 below go through that real handler, not a direct
// DB insert.
const DATE = addDaysIso(todayIso(), Math.min(2, RSVP_WINDOW_DAYS - 1));
const DOW = dayOfWeekFor(DATE);
const DAY_LABEL = dayLabelFor(DATE);

test('a waitlist join emits exactly one waitlist_joined event; a repeat RSVP from the same student emits none', async () => {
  await createTemplate('notify-join', DOW, 1);
  const envWithCoach = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  // Fill the one spot with student A first (no notification expected -- going, not waitlisted).
  const fillCtx = makeContext({ env: envWithCoach, user: STUDENT_A, body: { templateId: 'notify-join', date: DATE, going: true } });
  await rsvpHandler(fillCtx.context);
  assert.equal(fetchCalls.length, 0, 'a successful going RSVP must not notify anyone');

  // Student B joins the waitlist -- exactly one waitlist_joined, to the coach.
  const joinCtx = makeContext({ env: envWithCoach, user: STUDENT_B, body: { templateId: 'notify-join', date: DATE, going: true } });
  const joinRes = await rsvpHandler(joinCtx.context);
  assert.equal((await joinRes.json()).status, 'waitlisted');
  await Promise.all(joinCtx.waitUntilPromises);
  assert.equal(fetchCalls.length, 1, 'exactly one dispatch (to the coach) for the new waitlist join');
  const joinBody = fetchCalls[0].body;
  assert.equal(joinBody.subject, `[CJN][WAITLIST_JOINED] ${DAY_LABEL} 18:00 Notify Test Class — ${DATE}`);
  assert.match(joinBody.text, /studentName: Bob Active/);
  assert.match(joinBody.text, /queueLength: 1/);

  // Student B re-RSVPing while still waitlisted must not fire a second notification.
  fetchCalls = [];
  const repeatCtx = makeContext({ env: envWithCoach, user: STUDENT_B, body: { templateId: 'notify-join', date: DATE, going: true } });
  const repeatRes = await rsvpHandler(repeatCtx.context);
  assert.equal((await repeatRes.json()).status, 'waitlisted');
  await Promise.all(repeatCtx.waitUntilPromises);
  assert.equal(fetchCalls.length, 0, 'a repeat RSVP from an already-waitlisted student must emit no notification');
});

test('a cancellation that promotes emits one waitlist_promoted event, addressed to both the coach and the promoted student', async () => {
  await createTemplate('notify-promote', DOW, 1);
  const env = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  const fillCtx = makeContext({ env, user: STUDENT_A, body: { templateId: 'notify-promote', date: DATE, going: true } });
  await rsvpHandler(fillCtx.context);
  const waitCtx = makeContext({ env, user: STUDENT_B, body: { templateId: 'notify-promote', date: DATE, going: true } });
  await rsvpHandler(waitCtx.context);
  fetchCalls = []; // discard the waitlist_joined dispatch from the setup above

  const cancelCtx = makeContext({ env, user: STUDENT_A, body: { templateId: 'notify-promote', date: DATE, going: false } });
  await rsvpHandler(cancelCtx.context);
  await Promise.all(cancelCtx.waitUntilPromises);

  assert.equal(fetchCalls.length, 2, 'exactly one waitlist_promoted event, dispatched to both the coach and the promoted student');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  assert.deepEqual(recipients, ['active2@seed.test', 'coach@example.test'], 'the recipient list must include the promoted student\'s own address');
  for (const call of fetchCalls) {
    assert.equal(call.body.subject, `[CJN][WAITLIST_PROMOTED] ${DAY_LABEL} 18:00 Notify Test Class — ${DATE}`);
    assert.match(call.body.text, /studentName: Bob Active/);
  }
});

test('promoting two students at once emits two waitlist_promoted events, not one', async () => {
  await createTemplate('notify-double', DOW, 1); // capacity 1, filled -- raised to 3 below
  const env = { RESEND_API_KEY: 'test-key' }; // student-only dispatch -- no COACH_NOTIFY_EMAIL, isolates the per-student count

  // Two waitlisted students (a third is going, using up the only occupied spot),
  // then the template's capacity is raised directly via SQL -- the same DB
  // effect T3.5's capacity-raise endpoint will have once it's wired -- and
  // promoteAndNotify is called directly, exactly as T3.5 will call it.
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'going', '2020-01-01 00:00:00')`)
    .bind('notify-double', DATE, 'seed-student-mustchange-1')
    .run();
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'waitlisted', '2020-01-01 00:01:00')`)
    .bind('notify-double', DATE, STUDENT_A.id)
    .run();
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'waitlisted', '2020-01-01 00:02:00')`)
    .bind('notify-double', DATE, STUDENT_B.id)
    .run();
  await db.prepare('UPDATE class_templates SET capacity = 3 WHERE id = ?').bind('notify-double').run();

  const fakeCtx = { env: { DB: db, ...env }, waitUntil: (p) => promises.push(p) };
  const promises = [];
  const promoted = await promoteAndNotify(fakeCtx, 'notify-double', DATE);
  assert.equal(promoted.length, 2, 'both waitlisted students should be promoted (3 capacity - 1 going = 2 free spots)');
  await Promise.all(promises);

  assert.equal(fetchCalls.length, 2, 'one dispatch per promoted student, not one combined dispatch');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  assert.deepEqual(recipients, [STUDENT_A.email, STUDENT_B.email].sort());
});
