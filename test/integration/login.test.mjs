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

test('login succeeds with the correct coach credentials and sets a session cookie', async () => {
  const { res, cookie } = await login('coach@seed.test', 'CoachPass123!');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.user.role, 'coach');
  assert.ok(cookie?.includes('session='));
});

test('login failure modes all return a byte-identical generic response', async () => {
  const wrongPassword = await login('coach@seed.test', 'TotallyWrongPassword');
  const wrongPasswordText = await wrongPassword.res.text();
  const nonexistent = await login('nobody-at-all@seed.test', 'WhateverPassword1');
  const inactive = await login('inactive1@seed.test', 'StudentPass123!');
  // Real, correct password on purpose -- proves login is blocked by
  // status='pending' itself, not merely by an unknown/wrong password.
  const pending = await login('pending1@seed.test', 'PendingPass123!');

  for (const { res } of [nonexistent, inactive, pending]) {
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.equal(text, wrongPasswordText, 'expected byte-identical body across all failure modes');
  }
  assert.equal(wrongPassword.res.status, 401);

  const parsed = JSON.parse(wrongPasswordText);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'Invalid email or password');
});

test('login rejects a missing password field the same generic way', async () => {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'coach@seed.test' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
});
