// T3.1: _utils/waitlist.js's promoteWaitlist -- the single place that decides who
// gets promoted off a waitlist. Tested directly against a real local D1 binding
// (via test/helpers/db.mjs's getPlatformProxy wrapper) rather than through an
// HTTP endpoint, since nothing calls this helper yet (T3.2 wires it into
// rsvp.js). Each test uses its own template so promotion state never leaks
// between tests; templates and RSVP rows are inserted directly via SQL with
// explicit `created_at` values so ordering is deterministic, not a race with
// CURRENT_TIMESTAMP's one-second resolution (fact 7 in plan/phase-3.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed } from '../helpers/server.mjs';
import { openDb } from '../helpers/db.mjs';
import { promoteWaitlist } from '../../public/functions/api/_utils/waitlist.js';

let db;
let dispose;

before(async () => {
  resetAndSeed();
  ({ db, dispose } = await openDb());
});

after(async () => {
  await dispose();
});

const STUDENTS = [
  'seed-student-active-1',
  'seed-student-active-2',
  'seed-student-inactive-1',
  'seed-student-pending-1',
  'seed-student-mustchange-1',
  'seed-student-lockout-1',
];

async function createTemplate(id, capacity) {
  await db
    .prepare('INSERT INTO class_templates (id, day_of_week, start_time, name, active, capacity) VALUES (?, 1, ?, ?, 1, ?)')
    .bind(id, '10:00', id, capacity)
    .run();
}

async function insertRsvp(templateId, date, userId, status, createdAt) {
  await db
    .prepare('INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(templateId, date, userId, status, createdAt)
    .run();
}

async function goingCount(templateId, date) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM session_rsvps WHERE template_id = ? AND session_date = ? AND status = 'going'")
    .bind(templateId, date)
    .first();
  return row.n;
}

const DATE = '2099-06-01';

test('one spot freed promotes the earliest waitlisted student by created_at, ties broken by user_id', async () => {
  const templateId = 'wl-order';
  await createTemplate(templateId, 3);
  // 3 going (full), 3 waitlisted: two share a created_at second (tie-break by
  // user_id), one is later.
  await insertRsvp(templateId, DATE, STUDENTS[0], 'going', '2020-01-01 00:00:00');
  await insertRsvp(templateId, DATE, STUDENTS[1], 'going', '2020-01-01 00:00:01');
  await insertRsvp(templateId, DATE, STUDENTS[2], 'going', '2020-01-01 00:00:02');
  await insertRsvp(templateId, DATE, STUDENTS[3], 'waitlisted', '2020-01-01 00:01:00'); // tie with [4]
  await insertRsvp(templateId, DATE, STUDENTS[4], 'waitlisted', '2020-01-01 00:01:00'); // tie with [3]
  await insertRsvp(templateId, DATE, STUDENTS[5], 'waitlisted', '2020-01-01 00:02:00'); // latest

  // Free exactly one spot.
  await db.prepare("DELETE FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?").bind(templateId, DATE, STUDENTS[0]).run();

  const [expectedFirst, expectedSecond] = [STUDENTS[3], STUDENTS[4]].sort();
  const promoted = await promoteWaitlist(db, templateId, DATE);
  assert.deepEqual(promoted, [expectedFirst], 'the earliest created_at wins the one free spot, tie broken by user_id');

  const secondPromoted = await promoteWaitlist(db, templateId, DATE);
  assert.deepEqual(secondPromoted, [], 'no further spots are free -- a second call promotes nobody');
  assert.equal(await goingCount(templateId, DATE), 3, 'going count stays at capacity');
});

test('two concurrent calls with one free spot promote exactly one student in total', async () => {
  const templateId = 'wl-concurrent';
  await createTemplate(templateId, 1);
  await insertRsvp(templateId, DATE, STUDENTS[0], 'waitlisted', '2020-01-01 00:00:00');
  await insertRsvp(templateId, DATE, STUDENTS[1], 'waitlisted', '2020-01-01 00:00:01');

  const [a, b] = await Promise.all([promoteWaitlist(db, templateId, DATE), promoteWaitlist(db, templateId, DATE)]);
  const totalPromoted = a.length + b.length;
  assert.equal(totalPromoted, 1, 'exactly one student should be promoted across both concurrent calls, not zero or two');
  assert.equal(await goingCount(templateId, DATE), 1);
});

test('promotes zero when the class is still full', async () => {
  const templateId = 'wl-still-full';
  await createTemplate(templateId, 1);
  await insertRsvp(templateId, DATE, STUDENTS[0], 'going', '2020-01-01 00:00:00');
  await insertRsvp(templateId, DATE, STUDENTS[1], 'waitlisted', '2020-01-01 00:00:01');

  const promoted = await promoteWaitlist(db, templateId, DATE);
  assert.deepEqual(promoted, [], 'the class is still full -- nobody should be promoted');
  assert.equal(await goingCount(templateId, DATE), 1);
});

test('promotes everyone when capacity is null (unlimited)', async () => {
  const templateId = 'wl-unlimited';
  await createTemplate(templateId, null);
  await insertRsvp(templateId, DATE, STUDENTS[0], 'waitlisted', '2020-01-01 00:00:00');
  await insertRsvp(templateId, DATE, STUDENTS[1], 'waitlisted', '2020-01-01 00:00:01');
  await insertRsvp(templateId, DATE, STUDENTS[2], 'waitlisted', '2020-01-01 00:00:02');

  const promoted = await promoteWaitlist(db, templateId, DATE);
  assert.equal(promoted.length, 3, 'unlimited capacity should promote every waitlisted row');
  assert.equal(await goingCount(templateId, DATE), 3);
});

test('never demotes a going row -- the going count is monotonically non-decreasing across the helper', async () => {
  const templateId = 'wl-monotonic';
  await createTemplate(templateId, 2);
  await insertRsvp(templateId, DATE, STUDENTS[0], 'going', '2020-01-01 00:00:00');
  await insertRsvp(templateId, DATE, STUDENTS[1], 'waitlisted', '2020-01-01 00:00:01');
  await insertRsvp(templateId, DATE, STUDENTS[2], 'waitlisted', '2020-01-01 00:00:02');

  const before1 = await goingCount(templateId, DATE);
  await promoteWaitlist(db, templateId, DATE);
  const after1 = await goingCount(templateId, DATE);
  assert.ok(after1 >= before1, 'going count must never decrease as a result of promotion');

  await promoteWaitlist(db, templateId, DATE); // idempotent second call, nothing left to promote
  const after2 = await goingCount(templateId, DATE);
  assert.ok(after2 >= after1, 'going count must never decrease across repeated calls either');
});
