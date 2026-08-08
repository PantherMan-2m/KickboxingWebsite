// T4.6: the phase's headline task. paymentStatus on both the roster and waitlist
// arrays returned by coach/sessions/[id].js's GET, the drop-in "none, not overdue"
// case, and the payment-agnostic promotion guarantee (D4/D5 -- no change to
// _utils/waitlist.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { openDb } from '../helpers/db.mjs';
import { onRequestGet } from '../../public/functions/api/coach/sessions/[id].js';
import { todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';

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

function dateForDowInWindow(dow) {
  const today = todayIso();
  for (let i = 0; i < RSVP_WINDOW_DAYS; i++) {
    const d = addDaysIso(today, i);
    if (dayOfWeekFor(d) === dow) return d;
  }
  throw new Error(`no date for day-of-week=${dow} within the ${RSVP_WINDOW_DAYS}-day window`);
}

async function assignMembership(id, userId, startDate, planId = 'plan_weekly') {
  await db
    .prepare('INSERT INTO memberships (id, user_id, plan_id, start_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, planId, startDate, 'seed-coach-1')
    .run();
}

test('roster and waitlist rows both carry paymentStatus, including the overdue-and-waitlisted case', async () => {
  // active1: overdue membership (joined 90 days ago, never paid). active2: no
  // membership at all -- must read 'none' on the roster.
  await assignMembership('mem-overdue-roster', 'seed-student-active-1', addDaysIso(todayIso(), -90));

  await authedFetch('/api/coach/templates/seed-template-wed', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 1 }),
  });
  const date = dateForDowInWindow(3);

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: c1 },
    body: JSON.stringify({ templateId: 'seed-template-wed', date, going: true }),
  }); // going, fills the 1 spot -- active1 is the overdue one, now on the roster
  await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: c2 },
    body: JSON.stringify({ templateId: 'seed-template-wed', date, going: true }), // waitlisted
  });

  const createRes = await authedFetch('/api/coach/sessions', {
    method: 'POST',
    body: JSON.stringify({ templateId: 'seed-template-wed', date }),
  });
  const { session } = await createRes.json();

  const body = await (await authedFetch(`/api/coach/sessions/${session.id}`)).json();

  const active1Roster = body.roster.find((r) => r.email === 'active1@seed.test');
  assert.equal(active1Roster.paymentStatus, 'overdue', 'the overdue member on the roster reads overdue');

  const active2Waitlist = body.waitlist.find((w) => w.email === 'active2@seed.test');
  assert.ok(active2Waitlist, 'active2 is on the waitlist');
  assert.equal(active2Waitlist.paymentStatus, 'none', 'the waitlisted member with no membership reads none');
});

test('promotion is payment-status-agnostic: an overdue waitlisted student is still promoted when capacity rises', async () => {
  await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 1 }),
  });
  const date = dateForDowInWindow(5);

  const { cookie: c1 } = await login('active1@seed.test', 'StudentPass123!');
  const { cookie: c2 } = await login('active2@seed.test', 'StudentPass123!');
  await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: c1 },
    body: JSON.stringify({ templateId: 'seed-template-fri', date, going: true }),
  });

  // active2 becomes overdue, then waitlists behind the full class.
  await assignMembership('mem-overdue-waitlist', 'seed-student-active-2', addDaysIso(todayIso(), -90));
  const waitlistRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: c2 },
    body: JSON.stringify({ templateId: 'seed-template-fri', date, going: true }),
  });
  assert.equal((await waitlistRes.json()).status, 'waitlisted');

  // Raising capacity triggers T3.5's promoteAndNotify -- unchanged waitlist.js,
  // no payment check anywhere in that path.
  await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 2 }),
  });

  const upcomingBody = await (
    await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: c2 } })
  ).json();
  const entry = upcomingBody.upcoming.find((u) => u.templateId === 'seed-template-fri' && u.date === date);
  assert.equal(entry.rsvpStatus, 'going', 'the overdue student is promoted in strict queue order, unaffected by payment status');
});

test('a drop-in student on the roster shows "none", not "overdue"', async () => {
  await db
    .prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_cents, method, paid_on, covers_start, covers_end, recorded_by)
       VALUES (?, ?, 'plan_dropin', 15000, 'cash', ?, ?, ?, 'seed-coach-1')`
    )
    .bind('pay-dropin-roster', 'seed-student-lockout-1', addDaysIso(todayIso(), -60), addDaysIso(todayIso(), -60), addDaysIso(todayIso(), -60))
    .run();

  const createRes = await authedFetch('/api/coach/sessions', {
    method: 'POST',
    body: JSON.stringify({ date: todayIso(), name: 'One-off status test' }),
  });
  const { session } = await createRes.json();
  const body = await (await authedFetch(`/api/coach/sessions/${session.id}`)).json();

  const dropinRow = body.roster.find((r) => r.email === 'lockout1@seed.test');
  assert.equal(dropinRow.paymentStatus, 'none', 'a drop-in-only payer is none, never overdue');
});

test('git diff shows _utils/waitlist.js untouched by this phase', async () => {
  const { execSync } = await import('node:child_process');
  const diff = execSync('git diff main...phase-4-payments -- public/functions/api/_utils/waitlist.js', {
    encoding: 'utf8',
  });
  assert.equal(diff.trim(), '', 'waitlist.js must have zero diff against main');
});

test('the GET query count does not scale with roster size (one batch query added, not one per student)', async () => {
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

  const createRes = await authedFetch('/api/coach/sessions', {
    method: 'POST',
    body: JSON.stringify({ date: todayIso(), name: 'Query count test' }),
  });
  const { session } = await createRes.json();

  const smallDb = countingDb(db);
  await onRequestGet({ params: { id: session.id }, env: { DB: smallDb } });
  const smallCalls = smallDb.calls;

  // Add 20 more active students, well beyond the seeded 4.
  for (let i = 0; i < 20; i++) {
    await db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password)
         VALUES (?, ?, 'x', ?, 'student', 'active', 0)`
      )
      .bind(`qc-student-${i}`, `qc-${i}@seed.test`, `QC Student ${i}`)
      .run();
  }

  const largeDb = countingDb(db);
  await onRequestGet({ params: { id: session.id }, env: { DB: largeDb } });
  const largeCalls = largeDb.calls;

  assert.equal(largeCalls, smallCalls, 'the query count for the GET must not grow with roster size');
});
