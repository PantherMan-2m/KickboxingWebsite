// T2.2: capacity management API. Covers persistence/clearing on templates, the
// inheritance-vs-override resolution rule (COALESCE(session.capacity, template.capacity)),
// server-side validation, and templates/[id].js's new partial-update PATCH semantics.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { todayIso, addDaysIso, dayOfWeekFor } from '../../public/functions/api/_utils/dates.js';

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

// A Monday within the RSVP window, for creating a session off seed-template-mon.
function nextMonday() {
  const today = todayIso();
  for (let i = 0; i < 14; i++) {
    const d = addDaysIso(today, i);
    if (dayOfWeekFor(d) === 1) return d;
  }
  throw new Error('no Monday found');
}

test('capacity set on a template persists, displays on reload, and clears back to unlimited', async () => {
  const patchRes = await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 15 }),
  });
  assert.equal(patchRes.status, 200);
  assert.equal((await patchRes.json()).ok, true);

  let getBody = await (await authedFetch('/api/coach/templates')).json();
  let fri = getBody.templates.find((t) => t.id === 'seed-template-fri');
  assert.equal(fri.capacity, 15, 'capacity should persist and reload');

  const clearRes = await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: '' }),
  });
  assert.equal(clearRes.status, 200, 'empty string should clear to unlimited, not be rejected');

  getBody = await (await authedFetch('/api/coach/templates')).json();
  fri = getBody.templates.find((t) => t.id === 'seed-template-fri');
  assert.equal(fri.capacity, null, 'clearing should set capacity back to NULL (unlimited)');
});

test('session inherits live template capacity when it has no override, and a direct override wins', async () => {
  const date = nextMonday();

  // Set the template's capacity to 20 first.
  await authedFetch('/api/coach/templates/seed-template-mon', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 20 }),
  });

  // Create a session from the template -- must NOT copy the 20 into the session's own column.
  const createRes = await authedFetch('/api/coach/sessions', {
    method: 'POST',
    body: JSON.stringify({ templateId: 'seed-template-mon', date }),
  });
  assert.equal(createRes.status, 200);
  const { session } = await createRes.json();

  let sessionBody = await (await authedFetch(`/api/coach/sessions/${session.id}`)).json();
  assert.equal(sessionBody.session.capacity, null, 'session capacity column should stay NULL (not copied)');
  assert.equal(sessionBody.session.effectiveCapacity, 20, 'effective capacity should inherit the template');

  // Changing the template afterwards should flow through live, since nothing was copied.
  await authedFetch('/api/coach/templates/seed-template-mon', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 25 }),
  });
  sessionBody = await (await authedFetch(`/api/coach/sessions/${session.id}`)).json();
  assert.equal(sessionBody.session.effectiveCapacity, 25, 'inheritance must be live, not a copy taken at creation time');

  // A direct override on the session wins over the template.
  const overrideRes = await authedFetch(`/api/coach/sessions/${session.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 12 }),
  });
  assert.equal(overrideRes.status, 200);

  sessionBody = await (await authedFetch(`/api/coach/sessions/${session.id}`)).json();
  assert.equal(sessionBody.session.capacity, 12);
  assert.equal(sessionBody.session.effectiveCapacity, 12);

  const templateBody = await (await authedFetch('/api/coach/templates')).json();
  const mon = templateBody.templates.find((t) => t.id === 'seed-template-mon');
  assert.equal(mon.capacity, 25, 'the template itself must be unaffected by the session-level override');
});

test('capacity validation rejects non-numeric, negative, zero, and non-integer values on template POST', async () => {
  const cases = [
    { capacity: 'abc' },
    { capacity: -5 },
    { capacity: 0 },
    { capacity: 12.5 },
  ];
  for (const body of cases) {
    const res = await authedFetch('/api/coach/templates', {
      method: 'POST',
      body: JSON.stringify({ dayOfWeek: 2, startTime: '10:00', name: 'Test Class', ...body }),
    });
    assert.equal(res.status, 400, `expected 400 for capacity=${JSON.stringify(body.capacity)}, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.ok(json.error, 'expected a clear error message');
  }
});

test('capacity validation rejects non-numeric, negative, zero, and non-integer values on template PATCH', async () => {
  // true/[1]/{} all coerce to 1 via Number(), which used to sail through as a valid
  // capacity of 1 -- the fix rejects them by type before any coercion happens.
  const cases = ['abc', -5, 0, 12.5, true, [1], {}];
  for (const capacity of cases) {
    const res = await authedFetch('/api/coach/templates/seed-template-fri', {
      method: 'PATCH',
      body: JSON.stringify({ capacity }),
    });
    assert.equal(res.status, 400, `expected 400 for capacity=${JSON.stringify(capacity)}, got ${res.status}`);
    assert.equal((await res.json()).ok, false);
  }

  // null and '' are both accepted (unlike the rejected cases above) and must behave
  // identically: both clear the capacity to NULL (unlimited).
  for (const capacity of [null, '']) {
    const res = await authedFetch('/api/coach/templates/seed-template-fri', {
      method: 'PATCH',
      body: JSON.stringify({ capacity }),
    });
    assert.equal(res.status, 200, `expected capacity=${JSON.stringify(capacity)} to be accepted as unlimited`);
    assert.equal((await res.json()).ok, true);
    const row = await (await authedFetch('/api/coach/templates')).json();
    const fri = row.templates.find((t) => t.id === 'seed-template-fri');
    assert.equal(fri.capacity, null, `capacity=${JSON.stringify(capacity)} should clear to NULL (unlimited)`);
  }
});

test('capacity validation rejects non-numeric, negative, zero, and non-integer values on session PATCH', async () => {
  const date = nextMonday();
  const createRes = await authedFetch('/api/coach/sessions', {
    method: 'POST',
    body: JSON.stringify({ templateId: 'seed-template-wed', date: addDaysIso(date, 2) }),
  });
  const { session } = await createRes.json();

  const cases = ['abc', -5, 0, 12.5];
  for (const capacity of cases) {
    const res = await authedFetch(`/api/coach/sessions/${session.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ capacity }),
    });
    assert.equal(res.status, 400, `expected 400 for capacity=${JSON.stringify(capacity)}, got ${res.status}`);
    assert.equal((await res.json()).ok, false);
  }
});

test('template PATCH rejects a body with neither active nor capacity, and each field can be set independently', async () => {
  const neitherRes = await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ name: 'irrelevant' }),
  });
  assert.equal(neitherRes.status, 400);
  assert.equal((await neitherRes.json()).ok, false);

  // Only capacity: must not disturb active.
  const capOnlyRes = await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ capacity: 8 }),
  });
  assert.equal(capOnlyRes.status, 200);

  let row = await (await authedFetch('/api/coach/templates')).json();
  let fri = row.templates.find((t) => t.id === 'seed-template-fri');
  assert.equal(fri.capacity, 8);
  assert.equal(fri.active, 1, 'active must be untouched by a capacity-only PATCH');

  // Only active: must not disturb capacity.
  const activeOnlyRes = await authedFetch('/api/coach/templates/seed-template-fri', {
    method: 'PATCH',
    body: JSON.stringify({ active: true }),
  });
  assert.equal(activeOnlyRes.status, 200);

  row = await (await authedFetch('/api/coach/templates')).json();
  fri = row.templates.find((t) => t.id === 'seed-template-fri');
  assert.equal(fri.capacity, 8, 'capacity must be untouched by an active-only PATCH');
  assert.equal(fri.active, 1);
});
