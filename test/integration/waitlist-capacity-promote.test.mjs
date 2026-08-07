// T3.5 (D2): raising capacity auto-promotes, at both write points --
// coach/templates/[id].js PATCH (bounded to today..RSVP_WINDOW_DAYS, one
// affected date at a time) and coach/sessions/[id].js PATCH (exactly one
// date). Calls the handlers directly against a real local D1 binding (same
// pattern as waitlist-notify.test.mjs) so DB state and dispatched-notification
// counts can both be inspected precisely, including a genuinely past date to
// prove it's never touched.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed } from '../helpers/server.mjs';
import { openDb } from '../helpers/db.mjs';
import { onRequestPatch as patchTemplate } from '../../public/functions/api/coach/templates/[id].js';
import { onRequestPost as createSessionHandler } from '../../public/functions/api/coach/sessions.js';
import { onRequestPatch as patchSession } from '../../public/functions/api/coach/sessions/[id].js';
import { todayIso, addDaysIso } from '../../public/functions/api/_utils/dates.js';

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

const ENV = { RESEND_API_KEY: 'test-key' }; // student-only dispatch -- isolates the per-promotion count

function makeContext({ params = {}, body }) {
  const waitUntilPromises = [];
  return {
    request: new Request('http://local.test/patch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { DB: db, ...ENV },
    params,
    waitUntil: (p) => waitUntilPromises.push(p),
    _waitUntilPromises: waitUntilPromises,
  };
}

async function createTemplate(id, dayOfWeek, capacity) {
  await db
    .prepare('INSERT INTO class_templates (id, day_of_week, start_time, name, active, capacity) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(id, dayOfWeek, '18:00', 'Capacity Promote Test', capacity)
    .run();
}

async function insertRsvp(templateId, date, userId, status, createdAt) {
  await db
    .prepare('INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(templateId, date, userId, status, createdAt)
    .run();
}

async function statusOf(templateId, date, userId) {
  const row = await db
    .prepare('SELECT status FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?')
    .bind(templateId, date, userId)
    .first();
  return row ? row.status : null;
}

const STUDENTS = [
  'seed-student-active-1', // A
  'seed-student-active-2', // B
  'seed-student-inactive-1', // C
  'seed-student-pending-1', // D
  'seed-student-mustchange-1', // studentX (going)
  'seed-student-lockout-1', // studentY (going)
];
const [A, B, C, D, STUDENT_X, STUDENT_Y] = STUDENTS;
const STUDENT_Z = 'seed-coach-mustchange-1'; // borrowed id, only used as a foreign-key-valid user_id

test('raising a template capacity by 1 promotes the oldest waitlisted student on each affected future date, one event per promotion, and never touches a past date', async () => {
  await createTemplate('t5-raise', 1, 1);
  const today = todayIso();
  const date1 = addDaysIso(today, 2);
  const date2 = addDaysIso(today, 3);
  const pastDate = addDaysIso(today, -3);

  // date1: 1 going + 2 waitlisted (A earlier than B) -- only A should be promoted.
  await insertRsvp('t5-raise', date1, STUDENT_X, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-raise', date1, A, 'waitlisted', '2020-01-01 00:01:00');
  await insertRsvp('t5-raise', date1, B, 'waitlisted', '2020-01-01 00:02:00');

  // date2: 1 going + 1 waitlisted (C) -- should be promoted too.
  await insertRsvp('t5-raise', date2, STUDENT_Y, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-raise', date2, C, 'waitlisted', '2020-01-01 00:01:00');

  // A past date with its own going + waitlisted row -- must be completely untouched.
  await insertRsvp('t5-raise', pastDate, STUDENT_Z, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-raise', pastDate, D, 'waitlisted', '2020-01-01 00:01:00');

  const ctx = makeContext({ params: { id: 't5-raise' }, body: { capacity: 2 } });
  const res = await patchTemplate(ctx);
  assert.equal(res.status, 200);
  await Promise.all(ctx._waitUntilPromises);

  assert.equal(await statusOf('t5-raise', date1, A), 'going', 'A (earliest) should be promoted on date1');
  assert.equal(await statusOf('t5-raise', date1, B), 'waitlisted', 'B should stay waitlisted -- only one spot freed on date1');
  assert.equal(await statusOf('t5-raise', date2, C), 'going', 'C should be promoted on date2');
  assert.equal(await statusOf('t5-raise', pastDate, D), 'waitlisted', 'a past date must never be touched');
  assert.equal(await statusOf('t5-raise', pastDate, STUDENT_Z), 'going', 'the past date\'s going row must be untouched too');

  assert.equal(fetchCalls.length, 2, 'exactly one waitlist_promoted dispatch per promoted student (A and C), not per date query or one combined');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  const [emailA, emailC] = await Promise.all(
    [A, C].map(async (id) => (await db.prepare('SELECT email FROM users WHERE id = ?').bind(id).first()).email)
  );
  assert.deepEqual(recipients, [emailA, emailC].sort());
});

test('lowering a template capacity leaves every going row untouched and promotes nobody', async () => {
  await createTemplate('t5-lower', 1, 3);
  const date = addDaysIso(todayIso(), 2);

  await insertRsvp('t5-lower', date, STUDENT_X, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-lower', date, STUDENT_Y, 'going', '2020-01-01 00:00:01');
  await insertRsvp('t5-lower', date, STUDENT_Z, 'going', '2020-01-01 00:00:02');
  await insertRsvp('t5-lower', date, A, 'waitlisted', '2020-01-01 00:01:00');

  const ctx = makeContext({ params: { id: 't5-lower' }, body: { capacity: 1 } });
  const res = await patchTemplate(ctx);
  assert.equal(res.status, 200);
  await Promise.all(ctx._waitUntilPromises);

  for (const [id, label] of [[STUDENT_X, 'X'], [STUDENT_Y, 'Y'], [STUDENT_Z, 'Z']]) {
    assert.equal(await statusOf('t5-lower', date, id), 'going', `going student ${label} must never be demoted by a capacity decrease`);
  }
  assert.equal(await statusOf('t5-lower', date, A), 'waitlisted', 'nobody should be promoted when capacity decreases');
  assert.equal(fetchCalls.length, 0, 'no promotion, no notification');
});

test('raising a session-level capacity override promotes for that one date only', async () => {
  await createTemplate('t5-session', 1, 1);
  const date = addDaysIso(todayIso(), 2);
  const otherDate = addDaysIso(todayIso(), 3);

  await insertRsvp('t5-session', date, STUDENT_X, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-session', date, A, 'waitlisted', '2020-01-01 00:01:00');
  // A second date sharing the template, at the template's own (unraised) capacity --
  // must be unaffected by a session-level override on the first date.
  await insertRsvp('t5-session', otherDate, STUDENT_Y, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-session', otherDate, B, 'waitlisted', '2020-01-01 00:01:00');

  const createRes = await createSessionHandler({
    request: new Request('http://local.test/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: 't5-session', date }),
    }),
    env: { DB: db },
    data: { user: { id: 'seed-coach-1' } },
  });
  assert.equal(createRes.status, 200);
  const { session } = await createRes.json();

  const ctx = makeContext({ params: { id: session.id }, body: { capacity: 2 } });
  const res = await patchSession(ctx);
  assert.equal(res.status, 200);
  await Promise.all(ctx._waitUntilPromises);

  assert.equal(await statusOf('t5-session', date, A), 'going', 'A should be promoted on the session\'s own date');
  assert.equal(await statusOf('t5-session', otherDate, B), 'waitlisted', 'the other date must be unaffected by a session-level override');
  assert.equal(fetchCalls.length, 1, 'exactly one promotion event');
});

// Review fix 4: no prior test covered clearing capacity to null (unlimited) --
// promoteWaitlist's null-capacity branch (promote every waitlisted row, no
// LIMIT arithmetic) was only exercised directly against promoteWaitlist itself
// (test/integration/waitlist-promotion.test.mjs), never through this endpoint.
test('clearing a template capacity to null (unlimited) promotes every waitlisted student, one event each', async () => {
  await createTemplate('t5-null', 1, 1);
  const date = addDaysIso(todayIso(), 2);

  await insertRsvp('t5-null', date, STUDENT_X, 'going', '2020-01-01 00:00:00');
  await insertRsvp('t5-null', date, A, 'waitlisted', '2020-01-01 00:01:00');
  await insertRsvp('t5-null', date, B, 'waitlisted', '2020-01-01 00:02:00');
  await insertRsvp('t5-null', date, C, 'waitlisted', '2020-01-01 00:03:00');

  const ctx = makeContext({ params: { id: 't5-null' }, body: { capacity: null } });
  const res = await patchTemplate(ctx);
  assert.equal(res.status, 200);
  await Promise.all(ctx._waitUntilPromises);

  for (const [id, label] of [[A, 'A'], [B, 'B'], [C, 'C']]) {
    assert.equal(await statusOf('t5-null', date, id), 'going', `${label} should be promoted -- unlimited capacity means nobody stays waitlisted`);
  }
  assert.equal(await statusOf('t5-null', date, STUDENT_X), 'going', 'the pre-existing going student must be untouched');

  assert.equal(fetchCalls.length, 3, 'one waitlist_promoted dispatch per promoted student (A, B, C), not one combined dispatch');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  const emails = await Promise.all(
    [A, B, C].map(async (id) => (await db.prepare('SELECT email FROM users WHERE id = ?').bind(id).first()).email)
  );
  assert.deepEqual(recipients, emails.sort());
});
