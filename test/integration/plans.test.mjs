// T4.3: the membership-plan catalogue API. Covers create/list/patch-each-field plus
// the D1 (integer cents) and D2 (period immutable) validation rules.
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

test('GET lists the three seeded plans', async () => {
  const res = await authedFetch('/api/coach/plans');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.plans.length, 3);
  const dropin = body.plans.find((p) => p.id === 'plan_dropin');
  assert.equal(dropin.priceCents, 15000);
  assert.equal(dropin.period, 'session');
});

test('POST creates a new plan', async () => {
  const res = await authedFetch('/api/coach/plans', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Plan', price_cents: 30000, allowance_per_period: 2, period: 'month' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.plan.priceCents, 30000);

  const listBody = await (await authedFetch('/api/coach/plans')).json();
  assert.ok(listBody.plans.find((p) => p.id === body.plan.id));
});

test('PATCH updates each field independently', async () => {
  const createRes = await authedFetch('/api/coach/plans', {
    method: 'POST',
    body: JSON.stringify({ name: 'Patchable', price_cents: 10000, allowance_per_period: 1, period: 'month' }),
  });
  const { plan } = await createRes.json();

  await authedFetch(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) });
  let body = await (await authedFetch('/api/coach/plans')).json();
  let row = body.plans.find((p) => p.id === plan.id);
  assert.equal(row.name, 'Renamed');
  assert.equal(row.priceCents, 10000, 'price should be untouched by a name-only PATCH');

  await authedFetch(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ price_cents: 12000 }) });
  body = await (await authedFetch('/api/coach/plans')).json();
  row = body.plans.find((p) => p.id === plan.id);
  assert.equal(row.priceCents, 12000);

  await authedFetch(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ allowance_per_period: null }) });
  body = await (await authedFetch('/api/coach/plans')).json();
  row = body.plans.find((p) => p.id === plan.id);
  assert.equal(row.allowancePerPeriod, null);

  await authedFetch(`/api/coach/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  body = await (await authedFetch('/api/coach/plans')).json();
  row = body.plans.find((p) => p.id === plan.id);
  assert.equal(row.active, 0);
});

test('POST rejects a float price and a negative price', async () => {
  for (const price_cents of [199.99, -100]) {
    const res = await authedFetch('/api/coach/plans', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad Plan', price_cents, period: 'month' }),
    });
    assert.equal(res.status, 400, `expected 400 for price_cents=${price_cents}`);
    assert.equal((await res.json()).ok, false);
  }
});

test('PATCH rejects a period change', async () => {
  const res = await authedFetch('/api/coach/plans/plan_dropin', {
    method: 'PATCH',
    body: JSON.stringify({ period: 'month' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('PATCH 404s on an unknown id', async () => {
  const res = await authedFetch('/api/coach/plans/does-not-exist', {
    method: 'PATCH',
    body: JSON.stringify({ name: 'X' }),
  });
  assert.equal(res.status, 404);
});

test('POST 400s on a null body', async () => {
  const res = await authedFetch('/api/coach/plans', { method: 'POST', body: 'null' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('deactivating a plan does not delete or alter existing memberships', async () => {
  await db
    .prepare(`INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)`)
    .bind('mem-plan-deactivate-test', 'seed-student-active-1', 'plan_weekly', '2026-01-01', 'seed-coach-1')
    .run();

  const deactivateRes = await authedFetch('/api/coach/plans/plan_weekly', {
    method: 'PATCH',
    body: JSON.stringify({ active: false }),
  });
  assert.equal(deactivateRes.status, 200);

  const plansBody = await (await authedFetch('/api/coach/plans')).json();
  assert.equal(plansBody.plans.find((p) => p.id === 'plan_weekly').active, 0, 'the plan itself is deactivated');

  const membership = await db
    .prepare('SELECT plan_id, start_date, end_date FROM memberships WHERE id = ?')
    .bind('mem-plan-deactivate-test')
    .first();
  assert.ok(membership, 'the membership row must still exist');
  assert.equal(membership.plan_id, 'plan_weekly');
  assert.equal(membership.end_date, null, 'the membership must be unaltered by the plan deactivation');
});
