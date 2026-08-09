// T4.7: student self-view. Read-only, own records only -- the endpoint takes no
// userId parameter of any kind, so an IDOR attempt has nothing to supply.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { openDb } from '../helpers/db.mjs';
import { todayIso, addDaysIso } from '../../public/functions/api/_utils/dates.js';
import { hashPassword } from '../../public/functions/api/_utils/auth.js';

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

// Dedicated fresh students for the LIMIT-3 tests below, rather than reusing seed
// fixtures other tests in this file depend on (active-2/lockout-1's state is asserted
// by other tests; mustchange-1 is blocked by the must-change-password middleware).
const HISTORY_LIMIT_PASSWORD = 'HistoryLimit123!';
let historyLimitPasswordHash;

async function createStudent(id) {
  if (!historyLimitPasswordHash) {
    historyLimitPasswordHash = await hashPassword(HISTORY_LIMIT_PASSWORD);
  }
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password)
       VALUES (?, ?, ?, ?, 'student', 'active', 0)`
    )
    .bind(id, `${id}@seed.test`, historyLimitPasswordHash, id)
    .run();
}

async function insertPayment(id, userId, { paidOn, coversStart, coversEnd, amountCents = 55000 }) {
  await db
    .prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_cents, method, paid_on, covers_start, covers_end, recorded_by)
       VALUES (?, ?, 'plan_weekly', ?, 'cash', ?, ?, ?, 'seed-coach-1')`
    )
    .bind(id, userId, amountCents, paidOn, coversStart, coversEnd)
    .run();
}

test('a student with 5 payments receives only the 3 most recent, newest first', async () => {
  await createStudent('hlimit-student-5');
  await db
    .prepare('INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind('mem-5-payments', 'hlimit-student-5', 'plan_weekly', addDaysIso(todayIso(), -150), 'seed-coach-1')
    .run();

  // 5 payments, one per past month, oldest to newest -- paid_on/covers_* all distinct
  // so "newest first" is unambiguous.
  const paidOns = [-150, -120, -90, -60, -30].map((offset) => addDaysIso(todayIso(), offset));
  for (let i = 0; i < paidOns.length; i++) {
    await insertPayment(`pay-5-${i}`, 'hlimit-student-5', {
      paidOn: paidOns[i],
      coversStart: paidOns[i],
      coversEnd: addDaysIso(paidOns[i], 29),
    });
  }

  const { cookie } = await login('hlimit-student-5@seed.test', HISTORY_LIMIT_PASSWORD);
  const res = await fetch(BASE_URL + '/api/student/payments', { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(body.payments.length, 3, 'only 3 of the 5 payments must reach the client');
  assert.deepEqual(
    body.payments.map((p) => p.id),
    ['pay-5-4', 'pay-5-3', 'pay-5-2'],
    'must be the 3 most recent by paid_on, newest first -- not the 3 oldest or an arbitrary 3'
  );
  assert.deepEqual(
    body.payments.map((p) => p.paidOn),
    [paidOns[4], paidOns[3], paidOns[2]]
  );
});

test('a student with 2 payments still receives both', async () => {
  await createStudent('hlimit-student-2');
  await db
    .prepare('INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind('mem-2-payments', 'hlimit-student-2', 'plan_weekly', addDaysIso(todayIso(), -60), 'seed-coach-1')
    .run();
  await insertPayment('pay-2-a', 'hlimit-student-2', {
    paidOn: addDaysIso(todayIso(), -60),
    coversStart: addDaysIso(todayIso(), -60),
    coversEnd: addDaysIso(todayIso(), -31),
  });
  await insertPayment('pay-2-b', 'hlimit-student-2', {
    paidOn: addDaysIso(todayIso(), -30),
    coversStart: addDaysIso(todayIso(), -30),
    coversEnd: addDaysIso(todayIso(), -1),
  });

  const { cookie } = await login('hlimit-student-2@seed.test', HISTORY_LIMIT_PASSWORD);
  const res = await fetch(BASE_URL + '/api/student/payments', { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(body.payments.length, 2, 'a student with fewer than 3 payments must still see all of them');
});

// The trap this whole change guards against: consolidating the history LIMIT with the
// status query would make paymentStatusForRoster only see the 3 most recent-by-paid_on
// payments too. Constructed so that the 4th-most-recent payment (excluded by LIMIT 3)
// is the one with the largest covers_end -- a one-time payment covering far into the
// future, made before three smaller/older-coverage payments that followed it. The 3
// most recent BY PAID_ON all have a covers_end well outside the grace window on their
// own. If status were wrongly derived from only those 3, this student would read
// 'overdue'; derived from ALL 5 payments (the correct, separate query), the older big
// payment's future covers_end makes them 'paid'.
test('a student with 5 payments still reads "paid" via an older payment outside the history LIMIT (regression: status must span ALL payments, not just the 3 returned)', async () => {
  await createStudent('hlimit-student-status');
  await db
    .prepare('INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind('mem-5-status', 'hlimit-student-status', 'plan_weekly', addDaysIso(todayIso(), -200), 'seed-coach-1')
    .run();

  // Oldest by paid_on, but its coverage runs far into the future -- excluded by LIMIT 3.
  await insertPayment('pay-status-old-big', 'hlimit-student-status', {
    paidOn: addDaysIso(todayIso(), -200),
    coversStart: addDaysIso(todayIso(), -200),
    coversEnd: addDaysIso(todayIso(), 50),
  });
  // The 3 most recent by paid_on -- each individually stale (covers_end well past the
  // 7-day grace window), so if status only saw these three, it would read 'overdue'.
  const recentOffsets = [-90, -60, -30];
  for (let i = 0; i < recentOffsets.length; i++) {
    await insertPayment(`pay-status-recent-${i}`, 'hlimit-student-status', {
      paidOn: addDaysIso(todayIso(), recentOffsets[i]),
      coversStart: addDaysIso(todayIso(), recentOffsets[i] - 5),
      coversEnd: addDaysIso(todayIso(), recentOffsets[i] + 10),
    });
  }

  const { cookie } = await login('hlimit-student-status@seed.test', HISTORY_LIMIT_PASSWORD);
  const res = await fetch(BASE_URL + '/api/student/payments', { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(
    body.status,
    'paid',
    'status must be derived from ALL payments (including the one excluded by the history LIMIT), not just the 3 returned'
  );
  assert.equal(body.payments.length, 3, 'history itself is still limited to 3');
  assert.ok(
    !body.payments.some((p) => p.id === 'pay-status-old-big'),
    'the payment carrying the future coverage must NOT appear in the limited history -- it only backs the status'
  );
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
