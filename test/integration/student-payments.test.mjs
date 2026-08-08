// T4.7: student self-view. Read-only, own records only -- the endpoint takes no
// userId parameter of any kind, so an IDOR attempt has nothing to supply.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { openDb } from '../helpers/db.mjs';
import { todayIso, addDaysIso } from '../../public/functions/api/_utils/dates.js';

let db;
let disposeDb;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ db, dispose: disposeDb } = await openDb());
});

after(async () => {
  stopServer();
  await disposeDb();
});

test('a student sees their own plan, status, and payment history', async () => {
  await db
    .prepare('INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind('mem-self-view', 'seed-student-active-1', 'plan_weekly', todayIso(), 'seed-coach-1')
    .run();
  await db
    .prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_cents, method, paid_on, covers_start, covers_end, recorded_by)
       VALUES (?, 'seed-student-active-1', 'plan_weekly', 55000, 'cash', ?, ?, ?, 'seed-coach-1')`
    )
    .bind('pay-self-view', todayIso(), todayIso(), addDaysIso(todayIso(), 20))
    .run();

  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const res = await fetch(BASE_URL + '/api/student/payments', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.plan.name, 'One Class / week');
  assert.equal(body.plan.effectivePriceCents, 55000);
  assert.equal(body.status, 'paid');
  assert.equal(body.payments.length, 1);
  assert.equal(body.payments[0].amountCents, 55000);
});

test('a student with no membership gets a clean empty state, not an error', async () => {
  const { cookie } = await login('active2@seed.test', 'StudentPass123!');
  const res = await fetch(BASE_URL + '/api/student/payments', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.plan, null);
  assert.equal(body.status, 'none');
  assert.deepEqual(body.payments, []);
});

test('the endpoint ignores any attempt to read another user\'s records via a query param', async () => {
  // active1 has a membership+payment from the first test; active2 does not.
  // Logged in as active2, try every plausible way to ask for active1's data.
  const { cookie } = await login('active2@seed.test', 'StudentPass123!');
  const res = await fetch(BASE_URL + '/api/student/payments?userId=seed-student-active-1', {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  // Must be active2's own (empty) data, never active1's.
  assert.equal(body.plan, null);
  assert.equal(body.status, 'none');
  assert.deepEqual(body.payments, []);
});
