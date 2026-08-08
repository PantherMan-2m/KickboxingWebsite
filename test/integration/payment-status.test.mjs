// T4.2: _utils/payments.js's paymentStatusForRoster -- the D4/D6 status rule, tested
// directly against a real local D1 binding (same pattern as
// test/integration/waitlist-promotion.test.mjs), since nothing calls it via HTTP yet
// (T4.6 wires it into coach/sessions/[id].js's GET). A fixed `today` reference date is
// passed explicitly to every call so the grace-day boundary is pinned rather than a
// race with the wall clock -- same reasoning as dates.test.mjs's todayIso(now) tests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed } from '../helpers/server.mjs';
import { openDb } from '../helpers/db.mjs';
import { paymentStatusForRoster } from '../../public/functions/api/_utils/payments.js';
import { addDaysIso } from '../../public/functions/api/_utils/dates.js';

let db;
let dispose;

before(async () => {
  resetAndSeed();
  ({ db, dispose } = await openDb());
});

after(async () => {
  await dispose();
});

const TODAY = '2026-06-15';
const COACH_ID = 'seed-coach-1';

async function createStudent(id) {
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password)
       VALUES (?, ?, 'x', ?, 'student', 'active', 0)`
    )
    .bind(id, `${id}@seed.test`, id)
    .run();
}

async function createMembership(id, userId, { planId = 'plan_weekly', startDate, endDate = null, overrideCents = null }) {
  await db
    .prepare(
      `INSERT INTO memberships (id, user_id, plan_id, start_date, end_date, price_override_cents, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, planId, startDate, endDate, overrideCents, COACH_ID)
    .run();
}

async function createPayment(id, userId, { planId = 'plan_weekly', coversStart, coversEnd, amountCents = 55000 }) {
  await db
    .prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_cents, method, paid_on, covers_start, covers_end, recorded_by)
       VALUES (?, ?, ?, ?, 'cash', ?, ?, ?, ?)`
    )
    .bind(id, userId, planId, amountCents, coversStart, coversStart, coversEnd, COACH_ID)
    .run();
}

test('a user with no membership row is "none"', async () => {
  await createStudent('ps-no-membership');
  const statuses = await paymentStatusForRoster(db, ['ps-no-membership'], TODAY);
  assert.equal(statuses.get('ps-no-membership'), 'none');
});

test('a drop-in-only payer (payments exist, no membership) is "none", not "overdue"', async () => {
  await createStudent('ps-dropin-only');
  await createPayment('pay-dropin-1', 'ps-dropin-only', {
    planId: 'plan_dropin',
    coversStart: TODAY,
    coversEnd: TODAY,
    amountCents: 15000,
  });
  const statuses = await paymentStatusForRoster(db, ['ps-dropin-only'], TODAY);
  assert.equal(statuses.get('ps-dropin-only'), 'none');
});

test('a member who joined today with zero payments is "paid" (the D4 COALESCE branch)', async () => {
  await createStudent('ps-joined-today');
  await createMembership('mem-joined-today', 'ps-joined-today', { startDate: TODAY });
  const statuses = await paymentStatusForRoster(db, ['ps-joined-today'], TODAY);
  assert.equal(statuses.get('ps-joined-today'), 'paid');
});

test('a member who joined 90 days ago with zero payments is "overdue"', async () => {
  await createStudent('ps-joined-90-ago');
  await createMembership('mem-joined-90-ago', 'ps-joined-90-ago', { startDate: addDaysIso(TODAY, -90) });
  const statuses = await paymentStatusForRoster(db, ['ps-joined-90-ago'], TODAY);
  assert.equal(statuses.get('ps-joined-90-ago'), 'overdue');
});

test('a member paid through the end of the current month is "paid"', async () => {
  await createStudent('ps-paid-this-month');
  await createMembership('mem-paid-this-month', 'ps-paid-this-month', { startDate: addDaysIso(TODAY, -180) });
  await createPayment('pay-this-month', 'ps-paid-this-month', {
    coversStart: addDaysIso(TODAY, -14),
    coversEnd: addDaysIso(TODAY, 15),
  });
  const statuses = await paymentStatusForRoster(db, ['ps-paid-this-month'], TODAY);
  assert.equal(statuses.get('ps-paid-this-month'), 'paid');
});

test('last covered through the previous month: "paid" on grace day 7, "overdue" on day 8', async () => {
  await createStudent('ps-grace-boundary');
  await createMembership('mem-grace-boundary', 'ps-grace-boundary', { startDate: addDaysIso(TODAY, -180) });
  // Last payment covered through exactly 7 days before TODAY.
  await createPayment('pay-grace-boundary', 'ps-grace-boundary', {
    coversStart: addDaysIso(TODAY, -37),
    coversEnd: addDaysIso(TODAY, -7),
  });

  const day7 = await paymentStatusForRoster(db, ['ps-grace-boundary'], TODAY);
  assert.equal(day7.get('ps-grace-boundary'), 'paid', 'exactly on the grace boundary is still paid');

  const day8 = await paymentStatusForRoster(db, ['ps-grace-boundary'], addDaysIso(TODAY, 1));
  assert.equal(day8.get('ps-grace-boundary'), 'overdue', 'one day past the grace boundary flips to overdue');
});

test('a membership with end_date in the past is "none", regardless of payments', async () => {
  await createStudent('ps-ended-membership');
  await createMembership('mem-ended', 'ps-ended-membership', {
    startDate: addDaysIso(TODAY, -180),
    endDate: addDaysIso(TODAY, -30),
  });
  // A payment covering a period well into the future -- must not matter once ended.
  await createPayment('pay-ended-irrelevant', 'ps-ended-membership', {
    coversStart: TODAY,
    coversEnd: addDaysIso(TODAY, 30),
  });
  const statuses = await paymentStatusForRoster(db, ['ps-ended-membership'], TODAY);
  assert.equal(statuses.get('ps-ended-membership'), 'none');
});

// db.prepare can't be monkey-patched in place -- the platform proxy's D1 binding
// doesn't honour a plain property assignment (verified empirically: the wrapper
// was never invoked). Wrapping db in a plain counting object and passing that as
// the `db` argument instead works, since paymentStatusForRoster only ever calls
// `db.prepare(...)`.
function countingDb(realDb) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    prepare: (...args) => {
      calls += 1;
      return realDb.prepare(...args);
    },
  };
}

test('the batch helper issues exactly one query, regardless of roster size', async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = `ps-batch-${i}`;
    await createStudent(id);
    await createMembership(`mem-batch-${i}`, id, { startDate: TODAY });
    ids.push(id);
  }

  const counted1 = countingDb(db);
  await paymentStatusForRoster(counted1, [ids[0]], TODAY);
  assert.equal(counted1.calls, 1, 'one user should issue exactly one query');

  const counted5 = countingDb(db);
  await paymentStatusForRoster(counted5, ids, TODAY);
  assert.equal(counted5.calls, 1, 'five users should still issue exactly one query, not five');
});

test('an empty roster returns an empty map without querying the database', async () => {
  const counted = countingDb(db);
  const statuses = await paymentStatusForRoster(counted, [], TODAY);
  assert.equal(statuses.size, 0);
  assert.equal(counted.calls, 0);
});
