// T3.4: the two notification events actually fire from the real write paths.
// Calls rsvp.js's onRequestPost directly (not through wrangler pages dev's HTTP
// layer) against a real local D1 binding (test/helpers/db.mjs), so the test can
// hand-build a `context` with its own `waitUntil` and inspect what got
// dispatched. `globalThis.fetch` is monkey-patched for the duration of each
// test to intercept outbound calls (both sendEmail's and the raw webhook fetch
// go through the global `fetch`) instead of hitting the real network -- no test
// sends a real email, per T3.3's exit condition, while still proving the
// correct recipient and event count.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed } from '../helpers/server.mjs';
import { openDb } from '../helpers/db.mjs';
import { onRequestPost as rsvpHandler } from '../../public/functions/api/student/rsvp.js';
import { promoteAndNotify } from '../../public/functions/api/_utils/waitlist.js';
import { todayIso, addDaysIso, dayOfWeekFor, dayLabelFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';

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

const STUDENT_A = { id: 'seed-student-active-1', email: 'active1@seed.test', name: 'Alice Active', role: 'student', mustChangePassword: false };
const STUDENT_B = { id: 'seed-student-active-2', email: 'active2@seed.test', name: 'Bob Active', role: 'student', mustChangePassword: false };

function makeContext({ env = {}, user, body }) {
  const waitUntilPromises = [];
  const context = {
    request: new Request('http://local.test/api/student/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { DB: db, ...env },
    data: { user },
    waitUntil: (p) => waitUntilPromises.push(p),
  };
  return { context, waitUntilPromises };
}

async function createTemplate(id, dayOfWeek, capacity) {
  await db
    .prepare('INSERT INTO class_templates (id, day_of_week, start_time, name, active, capacity) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(id, dayOfWeek, '18:00', 'Notify Test Class', capacity)
    .run();
}

// Must be within the RSVP window -- rsvp.js's going:true path rejects anything
// further out, and tests 1/2 below go through that real handler, not a direct
// DB insert.
const DATE = addDaysIso(todayIso(), Math.min(2, RSVP_WINDOW_DAYS - 1));
const DOW = dayOfWeekFor(DATE);
const DAY_LABEL = dayLabelFor(DATE);

test('a waitlist join emits exactly one waitlist_joined event; a repeat RSVP from the same student emits none', async () => {
  await createTemplate('notify-join', DOW, 1);
  const envWithCoach = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  // Fill the one spot with student A first (no notification expected -- going, not waitlisted).
  const fillCtx = makeContext({ env: envWithCoach, user: STUDENT_A, body: { templateId: 'notify-join', date: DATE, going: true } });
  await rsvpHandler(fillCtx.context);
  assert.equal(fetchCalls.length, 0, 'a successful going RSVP must not notify anyone');

  // Student B joins the waitlist -- exactly one waitlist_joined, to the coach.
  const joinCtx = makeContext({ env: envWithCoach, user: STUDENT_B, body: { templateId: 'notify-join', date: DATE, going: true } });
  const joinRes = await rsvpHandler(joinCtx.context);
  assert.equal((await joinRes.json()).status, 'waitlisted');
  await Promise.all(joinCtx.waitUntilPromises);
  assert.equal(fetchCalls.length, 1, 'exactly one dispatch (to the coach) for the new waitlist join');
  const joinBody = fetchCalls[0].body;
  assert.equal(joinBody.subject, `[CJN][WAITLIST_JOINED] ${DAY_LABEL} 18:00 Notify Test Class — ${DATE}`);
  assert.match(joinBody.text, /studentName: Bob Active/);
  assert.match(joinBody.text, /queueLength: 1/);

  // Student B re-RSVPing while still waitlisted must not fire a second notification.
  fetchCalls = [];
  const repeatCtx = makeContext({ env: envWithCoach, user: STUDENT_B, body: { templateId: 'notify-join', date: DATE, going: true } });
  const repeatRes = await rsvpHandler(repeatCtx.context);
  assert.equal((await repeatRes.json()).status, 'waitlisted');
  await Promise.all(repeatCtx.waitUntilPromises);
  assert.equal(fetchCalls.length, 0, 'a repeat RSVP from an already-waitlisted student must emit no notification');
});

test('a cancellation that promotes emits one waitlist_promoted event, addressed to both the coach and the promoted student', async () => {
  await createTemplate('notify-promote', DOW, 1);
  const env = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  const fillCtx = makeContext({ env, user: STUDENT_A, body: { templateId: 'notify-promote', date: DATE, going: true } });
  await rsvpHandler(fillCtx.context);
  const waitCtx = makeContext({ env, user: STUDENT_B, body: { templateId: 'notify-promote', date: DATE, going: true } });
  await rsvpHandler(waitCtx.context);
  fetchCalls = []; // discard the waitlist_joined dispatch from the setup above

  const cancelCtx = makeContext({ env, user: STUDENT_A, body: { templateId: 'notify-promote', date: DATE, going: false } });
  await rsvpHandler(cancelCtx.context);
  await Promise.all(cancelCtx.waitUntilPromises);

  assert.equal(fetchCalls.length, 2, 'exactly one waitlist_promoted event, dispatched to both the coach and the promoted student');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  assert.deepEqual(recipients, ['active2@seed.test', 'coach@example.test'], 'the recipient list must include the promoted student\'s own address');
  for (const call of fetchCalls) {
    assert.equal(call.body.subject, `[CJN][WAITLIST_PROMOTED] ${DAY_LABEL} 18:00 Notify Test Class — ${DATE}`);
    assert.match(call.body.text, /studentName: Bob Active/);
  }
});

test('promoting two students at once emits two waitlist_promoted events, not one', async () => {
  await createTemplate('notify-double', DOW, 1); // capacity 1, filled -- raised to 3 below
  const env = { RESEND_API_KEY: 'test-key' }; // student-only dispatch -- no COACH_NOTIFY_EMAIL, isolates the per-student count

  // Two waitlisted students (a third is going, using up the only occupied spot),
  // then the template's capacity is raised directly via SQL -- the same DB
  // effect T3.5's capacity-raise endpoint will have once it's wired -- and
  // promoteAndNotify is called directly, exactly as T3.5 will call it.
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'going', '2020-01-01 00:00:00')`)
    .bind('notify-double', DATE, 'seed-student-mustchange-1')
    .run();
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'waitlisted', '2020-01-01 00:01:00')`)
    .bind('notify-double', DATE, STUDENT_A.id)
    .run();
  await db.prepare(`INSERT INTO session_rsvps (template_id, session_date, user_id, status, created_at) VALUES (?, ?, ?, 'waitlisted', '2020-01-01 00:02:00')`)
    .bind('notify-double', DATE, STUDENT_B.id)
    .run();
  await db.prepare('UPDATE class_templates SET capacity = 3 WHERE id = ?').bind('notify-double').run();

  const fakeCtx = { env: { DB: db, ...env }, waitUntil: (p) => promises.push(p) };
  const promises = [];
  const promoted = await promoteAndNotify(fakeCtx, 'notify-double', DATE);
  assert.equal(promoted.length, 2, 'both waitlisted students should be promoted (3 capacity - 1 going = 2 free spots)');
  await Promise.all(promises);

  assert.equal(fetchCalls.length, 2, 'one dispatch per promoted student, not one combined dispatch');
  const recipients = fetchCalls.map((c) => c.body.to[0]).sort();
  assert.deepEqual(recipients, [STUDENT_A.email, STUDENT_B.email].sort());
});

// Review fix 3: rsvp.js's full-class branch inserts a waitlisted row and then
// immediately calls promoteAndNotify (to close the window where a spot opened
// mid-request). When that call -- or any other concurrent write's own
// promoteAndNotify call -- ends up promoting the student who just joined, the
// old code still unconditionally sent waitlist_joined too, producing two
// events for one request. The fix checks this student's actual final status
// (not just whether *this* request's own promoteAndNotify call named them)
// before deciding to send waitlist_joined.

test('an ordinary waitlist join (no concurrent promotion) still emits exactly one waitlist_joined', async () => {
  await createTemplate('notify-ordinary-join', DOW, 1);
  const env = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  const fillCtx = makeContext({ env, user: STUDENT_A, body: { templateId: 'notify-ordinary-join', date: DATE, going: true } });
  await rsvpHandler(fillCtx.context);
  fetchCalls = [];

  const joinCtx = makeContext({ env, user: STUDENT_B, body: { templateId: 'notify-ordinary-join', date: DATE, going: true } });
  const joinRes = await rsvpHandler(joinCtx.context);
  await Promise.all(joinCtx.waitUntilPromises);

  assert.equal((await joinRes.json()).status, 'waitlisted');
  assert.equal(fetchCalls.length, 1, 'exactly one dispatch for an ordinary join with no concurrent promotion');
  assert.match(fetchCalls[0].body.subject, /WAITLIST_JOINED/);
});

test('a student promoted before their own waitlist_joined decision gets only waitlist_promoted, never both', async () => {
  const env = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  // Races student A's cancellation (frees the one spot) against student B's
  // join on the same full class -- the window rsvp.js's own comment describes
  // ("closes the window where a spot opened between the failed going-insert
  // and the waitlist insert"). Every DB call here goes through one real,
  // network-like round-trip (getPlatformProxy's D1 binding), ~80-100ms each,
  // and B's going:true path makes several of them (template lookup,
  // existing-row check, session capacity lookup, the atomic insert, the
  // waitlist insert, promoteAndNotify's own reads) before its final status
  // check, vs. A's single DELETE + a much shorter promoteAndNotify. Starting
  // both at once lets A's whole request finish before B's atomic insert even
  // runs, so B just wins the spot outright -- empirically confirmed, not
  // theoretical (diagnostic timestamps during development showed A settling
  // before B's atomic insert in every unlimited-delay run). Delaying A's start
  // until after B's atomic insert has had time to run (but well before B's own
  // later promoteAndNotify) reliably lands B in the waitlisted-then-
  // immediately-promoted branch instead.
  //
  // The still-valid alternative outcome (B's early capacity read already sees
  // the freed spot and succeeds outright, never touching the waitlisted
  // branch) doesn't exercise this fix, so it's distinguished by fetchCalls
  // staying empty and retried on a fresh template rather than asserted on
  // directly -- a bounded retry, not an unbounded one, so a real regression
  // still fails loudly instead of hanging.
  let joinBody;
  let attempt = 0;
  for (; attempt < 8; attempt++) {
    const templateId = `notify-instant-promote-${attempt}`;
    await createTemplate(templateId, DOW, 1);
    const fillCtx = makeContext({ env, user: STUDENT_A, body: { templateId, date: DATE, going: true } });
    await rsvpHandler(fillCtx.context);
    fetchCalls = [];

    const cancelCtx = makeContext({ env, user: STUDENT_A, body: { templateId, date: DATE, going: false } });
    const joinCtx = makeContext({ env, user: STUDENT_B, body: { templateId, date: DATE, going: true } });
    const joinPromise = rsvpHandler(joinCtx.context);
    await new Promise((resolve) => setTimeout(resolve, 250 + attempt * 60));
    const cancelPromise = rsvpHandler(cancelCtx.context);
    const [joinRes] = await Promise.all([joinPromise, cancelPromise]);
    await Promise.all([...cancelCtx.waitUntilPromises, ...joinCtx.waitUntilPromises]);

    joinBody = await joinRes.json();
    if (fetchCalls.length > 0) break; // landed in the target interleaving
  }

  assert.ok(fetchCalls.length > 0, `could not reproduce the promote-before-join-decision race after ${attempt + 1} attempts`);
  assert.equal(joinBody.status, 'going', 'B should have ended up promoted within this same request');
  assert.equal(fetchCalls.length, 2, 'exactly one waitlist_promoted event (coach + student) -- never a waitlist_joined as well');
  for (const call of fetchCalls) {
    assert.match(call.body.subject, /WAITLIST_PROMOTED/, 'no waitlist_joined dispatch should have fired for the promoted student');
  }
});

// Opus spot-check finding: finalRow (rsvp.js's re-read after the waitlist
// insert) can be null -- a concurrent cancel (going: false) from the *same*
// student, racing between the waitlist insert and this re-read, deletes the
// row out from under it. Before the fix, `finalRow.status` on a null finalRow
// threw a bare TypeError (uncaught -> 500) instead of the fix's `status: null`
// response with no notification.
//
// Reaching this deterministically through two genuinely concurrent requests
// (mirroring the timing-raced test above) turned out reliable in practice --
// B's own cancel is a single DELETE, fast enough to consistently land inside
// the multi-query window between B's own waitlist insert and its final-status
// re-read once its start is delayed past B's join request's first few queries.
// Bounded retry (not unbounded) for the same reason as the race test above: a
// real regression still fails loudly instead of hanging.
test('a concurrent self-cancel between the waitlist insert and the status re-read does not throw, and emits no waitlist_joined', async () => {
  const env = { COACH_NOTIFY_EMAIL: 'coach@example.test', RESEND_API_KEY: 'test-key' };

  let joinRes;
  let attempt = 0;
  for (; attempt < 10; attempt++) {
    const templateId = `notify-self-cancel-race-${attempt}`;
    await createTemplate(templateId, DOW, 1);
    const fillCtx = makeContext({ env, user: STUDENT_A, body: { templateId, date: DATE, going: true } });
    await rsvpHandler(fillCtx.context);
    fetchCalls = [];

    const joinCtx = makeContext({ env, user: STUDENT_B, body: { templateId, date: DATE, going: true } });
    const cancelCtx = makeContext({ env, user: STUDENT_B, body: { templateId, date: DATE, going: false } });
    const joinPromise = rsvpHandler(joinCtx.context);
    await new Promise((resolve) => setTimeout(resolve, 300 + attempt * 60));
    const cancelPromise = rsvpHandler(cancelCtx.context);
    [joinRes] = await Promise.all([joinPromise, cancelPromise]);
    await Promise.all([...joinCtx.waitUntilPromises, ...cancelCtx.waitUntilPromises]);

    assert.equal(joinRes.status, 200, `join must never 500 regardless of timing (attempt ${attempt})`);
    const row = await db
      .prepare('SELECT status FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?')
      .bind(templateId, DATE, STUDENT_B.id)
      .first();
    if (!row) break; // landed in the target interleaving: B's row is gone
  }

  assert.ok(attempt < 10, `could not reproduce the self-cancel-during-join race after ${attempt + 1} attempts`);
  const joinBody = await joinRes.json();
  assert.equal(joinBody.ok, true);
  assert.equal(joinBody.status, null, 'no row exists to report a status for');
  assert.equal(fetchCalls.length, 0, 'no waitlist_joined for a row that no longer exists by the time it would be sent');
});
