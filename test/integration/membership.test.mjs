// T4.4: membership assignment. Covers assign/change (exactly one open row survives),
// the D2 drop-in guard, the D3 price override, and students/[id].js's newly-guarded PATCH.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { openDb } from '../helpers/db.mjs';

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
