// T3.3: _utils/notify.js. buildEvent is pure -- tested directly, no network. The
// dispatch tests use a fake `ctx.waitUntil` that just captures the promise so we
// can await and inspect it ourselves; no test here sends a real email (sendEmail
// only fires when RESEND_API_KEY + COACH_NOTIFY_EMAIL are both set, and no test
// sets both).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, notifyCoach } from '../../public/functions/api/_utils/notify.js';

// Naive key-value parser matching what an inbox-watching automation would use --
// pins that buildEvent's text body is actually parseable, not just readable.
function parseKeyValue(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(': ');
    result[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return result;
}

function fakeCtx() {
  let captured;
  return {
    ctx: { waitUntil: (p) => { captured = p; } },
    getPromise: () => captured,
  };
}

test('buildEvent(waitlist_joined) has the exact bracketed subject topic and a round-trippable body', () => {
  const event = buildEvent('waitlist_joined', {
    className: 'Adults',
    dayLabel: 'Mon',
    time: '18:00',
    date: '2026-08-10',
    studentName: 'Alice Active',
    queueLength: 2,
  });
  assert.equal(event.type, 'waitlist_joined');
  assert.equal(event.subject, '[CJN][WAITLIST_JOINED] Mon 18:00 Adults — 2026-08-10');

  const parsed = parseKeyValue(event.text);
  assert.equal(parsed.event, 'waitlist_joined');
  assert.equal(parsed.className, 'Adults');
  assert.equal(parsed.dayLabel, 'Mon');
  assert.equal(parsed.time, '18:00');
  assert.equal(parsed.date, '2026-08-10');
  assert.equal(parsed.studentName, 'Alice Active');
  assert.equal(parsed.queueLength, '2');

  assert.deepEqual(event.json, {
    event: 'waitlist_joined',
    className: 'Adults',
    dayLabel: 'Mon',
    time: '18:00',
    date: '2026-08-10',
    studentName: 'Alice Active',
    queueLength: 2,
  });
});

test('buildEvent(waitlist_promoted) has the exact bracketed subject topic and a round-trippable body', () => {
  const event = buildEvent('waitlist_promoted', {
    className: 'Muay Thai',
    dayLabel: 'Wed',
    time: '18:00',
    date: '2026-08-12',
    studentName: 'Bob Active',
    studentEmail: 'active2@seed.test',
  });
  assert.equal(event.type, 'waitlist_promoted');
  assert.equal(event.subject, '[CJN][WAITLIST_PROMOTED] Wed 18:00 Muay Thai — 2026-08-12');

  const parsed = parseKeyValue(event.text);
  assert.equal(parsed.event, 'waitlist_promoted');
  assert.equal(parsed.studentName, 'Bob Active');
  assert.equal(parsed.studentEmail, 'active2@seed.test');
});

test('with no env vars set, notifyCoach is a no-op that resolves without dispatching anything', async () => {
  const { ctx, getPromise } = fakeCtx();
  const event = buildEvent('waitlist_joined', {
    className: 'Adults', dayLabel: 'Mon', time: '18:00', date: '2026-08-10', studentName: 'Alice', queueLength: 1,
  });

  assert.doesNotThrow(() => notifyCoach({}, ctx, event));
  await assert.doesNotReject(() => getPromise());
});

test('an injected failing dispatcher (unreachable webhook) does not reject the dispatched promise', async () => {
  const { ctx, getPromise } = fakeCtx();
  const event = buildEvent('waitlist_joined', {
    className: 'Adults', dayLabel: 'Mon', time: '18:00', date: '2026-08-10', studentName: 'Alice', queueLength: 1,
  });

  // Port 1 refuses connections immediately -- a genuine fetch-level rejection,
  // the case sendEmail/fetch don't catch on their own (fact 8).
  const env = { COACH_WEBHOOK_URL: 'http://127.0.0.1:1/hook', COACH_WEBHOOK_SECRET: 'test-secret' };
  notifyCoach(env, ctx, event);
  await assert.doesNotReject(() => getPromise(), 'a failing webhook dispatch must be swallowed, never surfaced to the caller');
});
