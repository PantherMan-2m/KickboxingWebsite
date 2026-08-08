// T4.4: membership assignment. Covers assign/change (exactly one open row survives),
// the D2 drop-in guard, the D3 price override, and students/[id].js's newly-guarded PATCH.
//
// Review triage finding 5: two concurrent plan-change POSTs could leave two open
// memberships, since the UPDATE-then-INSERT was two separate un-batched statements with
// no DB-level backstop. Fixed with migration 0006's partial unique index
// (idx_memberships_one_open) plus wrapping the UPDATE+INSERT in DB.batch() (same
// precedent as coach/mark-attendance.js:37-39) and catching the constraint violation as
// a 409 instead of an uncaught 500.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { openDb } from '../helpers/db.mjs';
import { onRequestPost as postMembership } from '../../public/functions/api/coach/students/[id]/membership.js';

let coachCookie;
let db;
let disposeDb;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
  ({ db, dispose: disposeDb } = await openDb());
});

after(async () => {
  stopServer();
  await disposeDb();
});

function authedFetch(path, init = {}) {
  return fetch(BASE_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie, ...(init.headers || {}) },
  });
}

async function openMembershipCount(userId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM memberships WHERE user_id = ? AND end_date IS NULL')
    .bind(userId)
    .first();
  return row.n;
}

test('assigning a plan creates an open membership', async () => {
  const res = await authedFetch('/api/coach/students/seed-student-active-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_weekly', start_date: '2026-01-01' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.membership.planId, 'plan_weekly');
  assert.equal(await openMembershipCount('seed-student-active-1'), 1);
});

test('changing a plan closes the old row -- exactly one open row remains', async () => {
  await authedFetch('/api/coach/students/seed-student-active-2/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_weekly', start_date: '2026-01-01' }),
  });
  assert.equal(await openMembershipCount('seed-student-active-2'), 1);

  const changeRes = await authedFetch('/api/coach/students/seed-student-active-2/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_unlimited', start_date: '2026-02-01' }),
  });
  assert.equal(changeRes.status, 200);
  assert.equal(await openMembershipCount('seed-student-active-2'), 1, 'exactly one open row after a change, not two');

  const rows = await db
    .prepare('SELECT plan_id, end_date FROM memberships WHERE user_id = ? ORDER BY start_date')
    .bind('seed-student-active-2')
    .all();
  assert.equal(rows.results.length, 2, 'both the old and new rows exist');
  assert.equal(rows.results[0].plan_id, 'plan_weekly');
  assert.equal(rows.results[0].end_date, '2026-01-31', 'old row closed the day before the new start');
  assert.equal(rows.results[1].plan_id, 'plan_unlimited');
  assert.equal(rows.results[1].end_date, null);
});

test('assigning the Drop-in plan is rejected (D2 -- paid for, not enrolled in)', async () => {
  const res = await authedFetch('/api/coach/students/seed-student-mustchange-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_dropin', start_date: '2026-01-01' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
  assert.equal(await openMembershipCount('seed-student-mustchange-1'), 0);
});

test('price_override_cents (the family discount) is stored', async () => {
  const res = await authedFetch('/api/coach/students/seed-student-lockout-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_weekly', start_date: '2026-01-01', price_override_cents: 40000 }),
  });
  assert.equal(res.status, 200);
  const row = await db
    .prepare('SELECT price_override_cents FROM memberships WHERE user_id = ? AND end_date IS NULL')
    .bind('seed-student-lockout-1')
    .first();
  assert.equal(row.price_override_cents, 40000);
});

test('students/[id].js PATCH now returns 400 on a null body (newly guarded)', async () => {
  const res = await authedFetch('/api/coach/students/seed-student-active-1', {
    method: 'PATCH',
    body: 'null',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('GET /api/coach/students reflects the assigned plan', async () => {
  const body = await (await authedFetch('/api/coach/students')).json();
  const row = body.students.find((s) => s.id === 'seed-student-active-1');
  assert.equal(row.planId, 'plan_weekly');
  assert.equal(row.planName, 'One Class / week');
});

test('finding 5: migration 0006 rejects a second open membership at the DB level', async () => {
  // seed-student-mustchange-1: its only prior use in this file (the D2 drop-in test)
  // was rejected with a 400 before any row was written, so it starts this test with
  // zero membership rows -- unlike active-1/active-2/lockout-1, already touched above.
  await db
    .prepare(`INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)`)
    .bind('mem-race-1', 'seed-student-mustchange-1', 'plan_weekly', '2026-01-01', 'seed-coach-1')
    .run();

  await assert.rejects(
    () =>
      db
        .prepare(`INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)`)
        .bind('mem-race-2', 'seed-student-mustchange-1', 'plan_unlimited', '2026-02-01', 'seed-coach-1')
        .run(),
    /UNIQUE constraint failed/,
    'idx_memberships_one_open must reject a second end_date IS NULL row for the same user'
  );
});

test('finding 4: a backdated start_date that would invert the open membership\'s end_date is rejected', async () => {
  const assignRes = await authedFetch('/api/coach/students/seed-student-inactive-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_weekly', start_date: '2026-02-01' }),
  });
  assert.equal(assignRes.status, 200);

  // Backdating the "new" plan's start to 2026-01-15 would close the open row on
  // 2026-01-14 -- before its own start_date of 2026-02-01. Must be rejected, not
  // silently written as an inverted end_date < start_date.
  const backdatedRes = await authedFetch('/api/coach/students/seed-student-inactive-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_unlimited', start_date: '2026-01-15' }),
  });
  assert.equal(backdatedRes.status, 400);
  assert.equal((await backdatedRes.json()).ok, false);

  assert.equal(await openMembershipCount('seed-student-inactive-1'), 1, 'the original open row must be untouched by the rejected request');
  const row = await db
    .prepare('SELECT plan_id, start_date FROM memberships WHERE user_id = ? AND end_date IS NULL')
    .bind('seed-student-inactive-1')
    .first();
  assert.equal(row.plan_id, 'plan_weekly', 'the rejected request must not have changed the plan');
  assert.equal(row.start_date, '2026-02-01');
});

test('finding 4: a start_date the day after the open membership started is accepted (boundary)', async () => {
  const assignRes = await authedFetch('/api/coach/students/seed-student-pending-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_weekly', start_date: '2026-02-01' }),
  });
  assert.equal(assignRes.status, 200);

  // New start 2026-02-02 closes the old row on 2026-02-01 -- exactly its own
  // start_date, not before it. Must be accepted.
  const res = await authedFetch('/api/coach/students/seed-student-pending-1/membership', {
    method: 'POST',
    body: JSON.stringify({ plan_id: 'plan_unlimited', start_date: '2026-02-02' }),
  });
  assert.equal(res.status, 200);
  assert.equal(await openMembershipCount('seed-student-pending-1'), 1);
});

test('finding 5: a losing concurrent membership POST gets a 409, not an uncaught 500', async () => {
  // Simulates the race directly rather than relying on real request timing: wraps the
  // real DB so .prepare() still hits the live D1 (student/plan lookups must succeed),
  // but .batch() throws the same SQLITE_CONSTRAINT error idx_memberships_one_open would
  // raise for a losing concurrent request -- proving the handler catches it as a 409
  // instead of letting it fall through as an unhandled 500.
  const conflictingDb = {
    prepare: (...args) => db.prepare(...args),
    batch: async () => {
      throw new Error('D1_ERROR: UNIQUE constraint failed: memberships.user_id: SQLITE_CONSTRAINT');
    },
  };

  const res = await postMembership({
    params: { id: 'seed-student-active-1' },
    request: { json: async () => ({ plan_id: 'plan_weekly', start_date: '2026-03-01' }) },
    env: { DB: conflictingDb },
    data: { user: { id: 'seed-coach-1' } },
  });

  assert.equal(res.status, 409, 'a constraint violation must surface as 409, not a bare 500');
  const body = await res.json();
  assert.equal(body.ok, false);
});
