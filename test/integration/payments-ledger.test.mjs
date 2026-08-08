// T4.5: the payments ledger API. Covers recording, the recorded_by-from-session
// guarantee (never the request body), and each validation rule.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
});

after(() => {
  stopServer();
});

function authedFetch(path, init = {}) {
  return fetch(BASE_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie, ...(init.headers || {}) },
  });
}

const VALID_BODY = {
  user_id: 'seed-student-active-1',
  plan_id: 'plan_weekly',
  amount_cents: 55000,
  method: 'cash',
  paid_on: '2026-06-01',
  covers_start: '2026-06-01',
  covers_end: '2026-06-30',
};

test('records a payment', async () => {
  const res = await authedFetch('/api/coach/payments', { method: 'POST', body: JSON.stringify(VALID_BODY) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.payment.amountCents, 55000);

  const listBody = await (await authedFetch('/api/coach/payments')).json();
  assert.ok(listBody.payments.find((p) => p.id === body.payment.id));
});

test('recorded_by always comes from the session, never the request body', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, recorded_by: 'seed-student-active-2' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payment.recordedBy, 'seed-coach-1', 'the session coach, not the body-supplied value');
});

test('rejects a bad method', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, method: 'card' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('rejects covers_end < covers_start', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, covers_start: '2026-06-30', covers_end: '2026-06-01' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('rejects an invalid date', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, paid_on: 'not-a-date' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('rejects a non-student user id', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, user_id: 'seed-coach-1' }),
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test('rejects a non-positive amount', async () => {
  const res = await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, amount_cents: 0 }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('400s on a null body', async () => {
  const res = await authedFetch('/api/coach/payments', { method: 'POST', body: 'null' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('GET ?userId= filters to one student', async () => {
  await authedFetch('/api/coach/payments', {
    method: 'POST',
    body: JSON.stringify({ ...VALID_BODY, user_id: 'seed-student-active-2' }),
  });
  const body = await (await authedFetch('/api/coach/payments?userId=seed-student-active-2')).json();
  assert.ok(body.payments.length > 0);
  assert.ok(body.payments.every((p) => p.userId === 'seed-student-active-2'));
});
