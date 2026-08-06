// T2.0: a shared parseJsonBody() helper was adopted in the routes Phase 2 opens, so a
// literal JSON `null` body (valid JSON, not a .json() parse error) returns a graceful
// 400 instead of an uncaught TypeError -> bare 500. student/rsvp.js already had its own
// regression test (test/integration/rsvp.test.mjs) predating the helper; this file covers
// the other three routes the helper was newly adopted in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';

before(async () => {
  resetAndSeed();
  await startServer();
});

after(() => {
  stopServer();
});

async function postNull(path, cookie, method = 'POST') {
  return fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: 'null',
  });
}

test('POST /api/coach/templates rejects a null JSON body with 400, not 500', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  const res = await postNull('/api/coach/templates', cookie);
  assert.equal(res.status, 400, `expected a graceful 400, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('PATCH /api/coach/templates/:id rejects a null JSON body with 400, not 500', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  const res = await postNull('/api/coach/templates/seed-template-mon', cookie, 'PATCH');
  assert.equal(res.status, 400, `expected a graceful 400, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('POST /api/coach/sessions rejects a null JSON body with 400, not 500', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  assert.ok(cookie, 'expected a session cookie from login');

  const res = await postNull('/api/coach/sessions', cookie);
  assert.equal(res.status, 400, `expected a graceful 400, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.ok, false);
});
